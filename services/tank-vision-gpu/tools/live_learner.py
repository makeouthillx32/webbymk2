"""AI-mode learner: watch the live cameras, cut tracklets, queue them for grading.

    .venv/Scripts/python tools/live_learner.py              # runs while the director is in AI (auto) mode
    .venv/Scripts/python tools/live_learner.py --always     # ignore the director mode
    .venv/Scripts/python tools/live_learner.py --dry-run --always --minutes 2   # no uploads; smoke test

The loop that replaces combing through footage:

  live cameras -> tracklets -> named from the graded gallery -> review queue
        ^                                                         |
        +------------- every grade joins the gallery <------------+

What it does, per camera, at --fps frames a second:
  * detects and tracks people, cats and dogs (YOLO11m + ByteTrack), skipping
    frames where nothing moved and nobody is being tracked;
  * when a track ends, embeds up to eight of its best crops (OSNet-AIN for
    people, DINOv2 for pets) and names it from the gallery: the graded archive
    tracklets (out/gallery, see build_gallery.py) plus every live group already
    confirmed in the review screen;
  * joins it to the camera's open group when it is plainly the same body back
    again (a few seconds' gap, similar embedding), so one visit is one card to
    grade rather than a dozen flickers;
  * writes the group to tank_identity_clusters (status pending, with its
    suggestion and confidence) and its crops to tank_identity_training_samples,
    with the pictures in the private tank-identity-crops bucket (and a copy on
    V:/tank-archive/identity-crops/live for training). Codex's
    Identity Review screen in Tank reads exactly those.

Frames come from MediaMTX's 720p "-hls-low" paths, read inside the MediaMTX
container (its RTSP port is not published to the host). Every ffmpeg it starts
carries the user agent "tank-learner" and a time limit, and is killed on stop,
so none can outlive the learner (MediaMTX has leaked orphaned ffmpeg before).
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import os
import json
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
# In the container the code lives at /app, with no repo above it.
REPO = ROOT.parents[1] if len(ROOT.parents) > 1 else ROOT
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from index_archive import CAMERA_ROOMS, COCO, Dinov2PetEmbedder, Track, crop_score, keep_crop  # noqa: E402
from tank_vision.identity_live import OVERLAPPING_ROOMS, Sighting, box_iou, facing, resolve as resolve_house  # noqa: E402
from tank_vision.reid import MODEL_KEY as PERSON_MODEL_KEY, OsnetAinEmbedder  # noqa: E402

# On the host this reaches the public names; inside the unenter network the
# compose service passes the internal ones, which need no TLS and no edge.
SUPABASE = os.environ.get("SUPABASE_URL", "https://db.unenter.live").rstrip("/")
DB = f"{SUPABASE}/rest/v1"
STORAGE = f"{SUPABASE}/storage/v1"
TANK_BASE = os.environ.get("TANK_BASE_URL", "https://tank.unenter.live").rstrip("/")
MEDIAMTX = os.environ.get("MEDIAMTX_CONTAINER", "unt_mediamtx")
# Set in the container, where ffmpeg runs locally and MediaMTX is a hostname.
# Empty on the host, where RTSP is not published and frames come through
# `docker exec unt_mediamtx ffmpeg` instead.
RTSP_TEMPLATE = os.environ.get("TANK_LEARNER_RTSP", "")
AGENT = "tank-learner"
# A second copy of every crop, for training later. Off in the container: the
# grading copy lives in the storage bucket, and the container's view of the V:
# share is the stale snapshot that started this whole mess.
HOST_CROPS = Path(os.environ.get("TANK_LEARNER_CROP_DIR", "V:/tank-archive/identity-crops/live")) if os.environ.get("TANK_LEARNER_CROP_DIR", "V:") else None
# Tank serves grading crops from this private bucket (its view of V: can be a stale
# snapshot); V: keeps the training copy.
CROP_BUCKET = "tank-identity-crops"
TELEMETRY_URL = f"{TANK_BASE}/api/tank/director/telemetry"
# How often the director is told who it is looking at, and how often an open
# track is re-named. A body must be named while it is still in frame: naming it
# when the track ends is fine for grading and useless for following someone.
PUBLISH_EVERY_S = 1.0
IDENT_EVERY_S = 3.0
GALLERY = ROOT / "out" / "gallery"
STATE = ROOT / "out" / "live"
TOPK = 5
# How much the learned classifier's probability adds to a name's match score
# (see write_classifier in build_gallery_from_grades.py for the measurement).
CLASSIFIER_WEIGHT = 0.1
# How much better a body must match a known non-person (rack, jacket) than any
# person before it is hidden from the director.
NEGATIVE_MARGIN = 0.03
# From build_gallery.py's held-out days: a winner this far ahead of the runner-up
# was right 98.9% of the time for people. Below it the card says "not sure".
CONFIDENT_MARGIN = 0.06
# A body in frame is re-judged every IDENT_EVERY_S. One frame needs the full
# margin above; a name that keeps winning needs much less, because consistency
# over several looks is evidence a single look cannot give. Measured 2026-09-19:
# Tyler seated at the game-room desk was the gallery's #1 every time, by only
# +0.02..+0.04 -- right, and never allowed to say so.
VOTE_WINS = 3            # consecutive checks the same name must top
VOTE_MIN_MARGIN = 0.012  # each of those wins must still be a win, not a tie
MODEL_KEYS = {"person": PERSON_MODEL_KEY, "cat": Dinov2PetEmbedder.MODEL_KEY, "dog": Dinov2PetEmbedder.MODEL_KEY}


def env(name: str) -> str:
    """Real environment first (the container), then the repo .env (the host)."""
    if os.environ.get(name):
        return os.environ[name]
    if (REPO / ".env").exists():
        for line in (REPO / ".env").read_text(encoding="utf-8").splitlines():
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"{name} is not set and is missing from .env")


class Rest:
    """PostgREST over curl: this Python's CA bundle rejects the site's valid chain."""

    def __init__(self, dry_run: bool) -> None:
        self.key = env("SERVICE_ROLE_KEY")
        self.dry_run = dry_run

    def _curl(self, method: str, path: str, body=None, prefer: str | None = None) -> tuple[int, str]:
        cmd = ["curl", "-sS", "-o", "-", "-w", "\n%{http_code}", "-X", method, f"{DB}/{path}",
               "-H", f"apikey: {self.key}", "-H", f"Authorization: Bearer {self.key}", "-H", "Content-Type: application/json"]
        if prefer:
            cmd += ["-H", f"Prefer: {prefer}"]
        tmp = None
        if body is not None:
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
                json.dump(body, fh)
                tmp = fh.name
            cmd += ["--data-binary", f"@{tmp}"]
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=60, creationflags=_NO_WINDOW)
        finally:
            if tmp:
                Path(tmp).unlink(missing_ok=True)
        text, _, code = out.stdout.rpartition("\n")
        return int(code or 0), text

    def get(self, path: str):
        code, text = self._curl("GET", path)
        if code != 200:
            raise RuntimeError(f"GET {path.split('?')[0]} -> {code} {text[:200]}")
        return json.loads(text)

    def upsert(self, table: str, rows: list[dict], conflict: str) -> None:
        if self.dry_run or not rows:
            return
        code, text = self._curl("POST", f"{table}?on_conflict={conflict}", rows, "resolution=merge-duplicates,return=minimal")
        if code not in (200, 201, 204):
            raise RuntimeError(f"upsert {table} -> {code} {text[:300]}")

    def delete(self, table: str, filters: str) -> None:
        """DELETE by PostgREST filter; callers keep the filter short (no giant IN)."""
        if self.dry_run:
            return
        code, text = self._curl("DELETE", f"{table}?{filters}", prefer="return=minimal")
        if code not in (200, 204):
            raise RuntimeError(f"delete {table} -> {code} {text[:200]}")

    def post_telemetry(self, url: str, secret: str, body: dict) -> None:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
            json.dump(body, fh)
            tmp = fh.name
        try:
            out = subprocess.run(
                ["curl", "-sS", "-o", "-", "-w", "\n%{http_code}", "-X", "POST", url,
                 "-H", f"x-tank-ingest-secret: {secret}", "-H", "Content-Type: application/json",
                 "--max-time", "8", "--data-binary", f"@{tmp}"],
                capture_output=True, text=True, timeout=20, creationflags=_NO_WINDOW)
        finally:
            Path(tmp).unlink(missing_ok=True)
        text, _, code = out.stdout.rpartition("\n")
        if code != "200":
            raise RuntimeError(f"telemetry -> {code} {text[:200]}")

    def put_object(self, bucket: str, name: str, file: Path) -> None:
        if self.dry_run:
            return
        out = subprocess.run(
            ["curl", "-sS", "-o", "-", "-w", "\n%{http_code}", "-X", "POST",
             f"{STORAGE}/object/{bucket}/{name}",
             "-H", f"apikey: {self.key}", "-H", f"Authorization: Bearer {self.key}",
             "-H", "Content-Type: image/jpeg", "-H", "x-upsert: true", "--data-binary", f"@{file}"],
            capture_output=True, text=True, timeout=60, creationflags=_NO_WINDOW)
        text, _, code = out.stdout.rpartition("\n")
        if code not in ("200", "201"):  # check the status: a 200 is the only proof it stored
            raise RuntimeError(f"upload {name} -> {code} {text[:200]}")


_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


# ── frames ──────────────────────────────────────────────────────────────────
class CameraFeed(threading.Thread):
    """Latest decoded frame of one camera, from an ffmpeg MJPEG pipe."""

    CHUNK_SECONDS = 900  # every ffmpeg ends by itself; a restart costs one second

    def __init__(self, camera: str, fps: float) -> None:
        super().__init__(daemon=True, name=camera)
        self.camera, self.fps = camera, fps
        self.frame: np.ndarray | None = None
        self.stamp = 0.0
        self.seq = 0
        self.stop_flag = threading.Event()
        self.proc: subprocess.Popen | None = None
        self.errors = 0

    def run(self) -> None:
        while not self.stop_flag.is_set():
            source = RTSP_TEMPLATE.format(camera=self.camera) if RTSP_TEMPLATE else f"rtsp://127.0.0.1:8554/cameras/{self.camera}-hls-low"
            ffmpeg = ["ffmpeg"] if RTSP_TEMPLATE else ["docker", "exec", MEDIAMTX, "ffmpeg"]
            cmd = [*ffmpeg, "-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp",
                   "-user_agent", AGENT, "-i", source, "-an",
                   "-vf", f"fps={self.fps}", "-q:v", "4", "-t", str(self.CHUNK_SECONDS), "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"]
            try:
                self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=_NO_WINDOW)
                buf = b""
                while not self.stop_flag.is_set():
                    chunk = self.proc.stdout.read(65536)
                    if not chunk:
                        break
                    buf += chunk
                    while True:
                        start = buf.find(b"\xff\xd8")
                        end = buf.find(b"\xff\xd9", start + 2) if start >= 0 else -1
                        if start < 0 or end < 0:
                            break
                        img = cv2.imdecode(np.frombuffer(buf[start:end + 2], np.uint8), cv2.IMREAD_COLOR)
                        buf = buf[end + 2:]
                        if img is not None:
                            self.frame, self.stamp = img, time.time()
                            self.seq += 1
            except OSError:
                self.errors += 1
            finally:
                self.close()
            self.stop_flag.wait(3.0)

    def close(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.kill()
        self.proc = None

    def stop(self) -> None:
        self.stop_flag.set()
        self.close()


def kill_container_ffmpeg() -> None:
    """Killing `docker exec` does not kill the ffmpeg it started inside MediaMTX."""
    if RTSP_TEMPLATE:
        return  # our own ffmpeg children die with us
    subprocess.run(["docker", "exec", MEDIAMTX, "pkill", "-f", f"user_agent {AGENT}"],
                   capture_output=True, timeout=30, creationflags=_NO_WINDOW)


# ── gallery ─────────────────────────────────────────────────────────────────
class Gallery:
    def __init__(self, rest: Rest) -> None:
        self.rest = rest
        self.base: dict[str, tuple[np.ndarray, list[str]]] = {}
        # Things the detector calls people and the operator says are not:
        # furniture, screens, reflections. Never an answer, always a veto.
        self.negatives: dict[str, np.ndarray] = {}
        self.base_stamp = 0.0
        self.load_base()
        self.live: dict[str, tuple[np.ndarray, list[str]]] = {}
        self.reviewed: dict[str, str] = {}  # cluster_key -> status, for groups a person has already graded
        self.loaded_at = 0.0

    def _base_stamp(self) -> float:
        files = list(GALLERY.glob("*.npy")) + list(GALLERY.glob("*-classifier.npz"))
        return max((f.stat().st_mtime for f in files), default=0.0)

    def load_base(self) -> bool:
        """(Re)load the gallery files. True when something new was picked up.

        The gallery is rebuilt from the operator's grades while the learner runs
        (a re-trickle does it first); reading it only at startup meant a fresh,
        cleaner gallery sat unused until someone restarted the container.
        """
        stamp = self._base_stamp()
        if stamp and stamp <= self.base_stamp:
            return False
        base: dict[str, tuple[np.ndarray, list[str]]] = {}
        negatives: dict[str, np.ndarray] = {}
        for cls in ("person", "cat", "dog"):
            if (GALLERY / f"{cls}.npy").exists() and (GALLERY / f"{cls}.json").exists():
                rows = json.loads((GALLERY / f"{cls}.json").read_text(encoding="utf-8"))
                base[cls] = (np.load(GALLERY / f"{cls}.npy"), [r["name"] for r in rows])
            if (GALLERY / f"{cls}-negative.npy").exists():
                negatives[cls] = np.load(GALLERY / f"{cls}-negative.npy")
        classifiers: dict[str, tuple[np.ndarray, np.ndarray, list[str]]] = {}
        path = GALLERY / "person-classifier.npz"
        if path.exists():
            try:
                with np.load(path) as data:
                    classifiers["person"] = (data["coef"], data["intercept"], [str(c) for c in data["classes"]])
            except (OSError, ValueError, KeyError):
                pass  # mid-write or old format: match scores alone until the next build
        self.base, self.negatives, self.classifiers, self.base_stamp = base, negatives, classifiers, stamp
        return True

    def learned(self, cls: str, vec: np.ndarray) -> dict[str, float]:
        """The trained classifier's probability for each name (empty without one)."""
        if cls not in self.classifiers:
            return {}
        coef, intercept, classes = self.classifiers[cls]
        logits = coef @ vec + intercept
        if len(classes) == 2 and logits.shape[0] == 1:
            p = 1.0 / (1.0 + np.exp(-float(logits[0])))
            return {classes[0]: 1.0 - p, classes[1]: p}
        e = np.exp(logits - logits.max())
        return dict(zip(classes, (e / e.sum()).tolist()))

    def refresh(self) -> None:
        """Pull graded live groups back in: this is the step that makes it learn."""
        rows = self.rest.get(
            "tank_identity_clusters?select=cluster_key,detected_class,status,assigned_target_slug,centroid,model_key"
            # Every graded group, not only live ones: re-trickled and single-image
            # cards are graded in the same lab. The model_key check below keeps
            # out groups embedded by a different model (the old archive seed).
            "&status=neq.pending&limit=5000")
        live: dict[str, tuple[list, list]] = collections.defaultdict(lambda: ([], []))
        self.reviewed = {r["cluster_key"]: r["status"] for r in rows}
        for r in rows:
            cls = r["detected_class"]
            # "not-*" groups (the rack, the jacket) are negatives: they veto via
            # the gallery's negative set and must never compete as a name.
            if (r["assigned_target_slug"] or "").startswith("not-"):
                continue
            if r["status"] == "confirmed" and r["assigned_target_slug"] and r["centroid"] and r["model_key"] == MODEL_KEYS.get(cls):
                live[cls][0].append(np.asarray(r["centroid"], dtype=np.float32))
                live[cls][1].append(r["assigned_target_slug"])
        self.live = {cls: (np.stack(v), n) for cls, (v, n) in live.items() if v}
        self.loaded_at = time.time()

    def looks_like_nothing(self, cls: str, vec: np.ndarray, best_person: float) -> bool:
        """True when this body matches a known false positive better than any name."""
        mat = self.negatives.get(cls)
        if mat is None or not len(mat):
            return False
        # Against the plain match score: the classifier has no "nothing" class,
        # so its boost to the nearest name must not out-vote the veto.
        best_person -= CLASSIFIER_WEIGHT * max(self.learned(cls, vec).values(), default=0.0)
        # Clearly more rack than person, not a coin flip: Malia from behind at the
        # dark desk scored rack .774 vs person .760 and was hidden as furniture.
        return float(np.max(mat @ vec)) > best_person + NEGATIVE_MARGIN

    def scores(self, cls: str, vec: np.ndarray) -> dict[str, float]:
        """Every name's score for this body: mean of its TOPK closest crops."""
        mats, names = [], []
        for source in (self.base, self.live):
            if cls in source:
                mats.append(source[cls][0])
                names += source[cls][1]
        if not mats:
            return {}
        sims = np.concatenate(mats) @ vec
        by_name: dict[str, list[float]] = collections.defaultdict(list)
        for sim, n in zip(sims.tolist(), names):
            by_name[n].append(sim)
        learned = self.learned(cls, vec)
        return {n: float(np.mean(sorted(v, reverse=True)[:TOPK])) + CLASSIFIER_WEIGHT * learned.get(n, 0.0)
                for n, v in by_name.items()}

    def name(self, cls: str, vec: np.ndarray) -> tuple[str | None, float, float, list]:
        scores = self.scores(cls, vec)
        if not scores:
            return None, 0.0, 0.0, []
        ranked = sorted(scores.items(), key=lambda x: -x[1])
        top, score = ranked[0]
        margin = score - (ranked[1][1] if len(ranked) > 1 else 0.0)
        return top, score, margin, [[n, round(s, 3)] for n, s in ranked[:3]]


# ── models ──────────────────────────────────────────────────────────────────
class Models:
    """Detector and embedders, loaded on first use and dropped when the AI stops.

    Idle means idle: with the director on manual this process holds no CUDA
    memory and no camera, so a game or a stream gets the whole card back.
    """

    def __init__(self, device: str) -> None:
        self.device = device
        self._embedders: dict | None = None
        self.detectors: dict[str, object] = {}
        self._trackers: dict[str, object] = {}
        self._pose = None

    def embedders(self) -> dict:
        if self._embedders is None:
            self._embedders = {"person": OsnetAinEmbedder(device=self.device), "pet": Dinov2PetEmbedder(self.device)}
        return self._embedders

    def detector(self, camera: str, weights: str):
        """One detector for every camera, with each camera's own ByteTrack state.

        It used to be one YOLO per camera -- six copies of the same weights, for
        a process that looks at one frame at a time. The tracker is the only
        per-camera part, so that is what gets swapped in before each frame.
        """
        from ultralytics import YOLO  # noqa: PLC0415

        if "shared" not in self.detectors:
            self.detectors["shared"] = YOLO(weights)
        return _CameraTracker(self.detectors["shared"], camera, self._trackers)

    def pose(self, weights: str):
        """Keypoint model for which way a body faces; None when its weights are absent."""
        from ultralytics import YOLO  # noqa: PLC0415

        if self._pose is None and Path(weights).exists():
            self._pose = YOLO(weights)
        return self._pose

    def release(self) -> None:
        self._embedders = None
        self._pose = None
        self.detectors.clear()
        self._trackers.clear()
        if self.device == "cuda":
            torch.cuda.empty_cache()


class _CameraTracker:
    """A camera's view of the shared detector: its own ByteTrack, the shared weights."""

    def __init__(self, model, camera: str, trackers: dict) -> None:
        self.model, self.camera, self.trackers = model, camera, trackers

    def track(self, frame, **kwargs):
        predictor = getattr(self.model, "predictor", None)
        if predictor is not None:
            if self.camera in self.trackers:
                predictor.trackers = self.trackers[self.camera]
            elif hasattr(predictor, "trackers"):
                del predictor.trackers  # a new camera starts with a fresh tracker
        result = self.model.track(frame, persist=True, **kwargs)
        self.trackers[self.camera] = self.model.predictor.trackers
        return result


# ── grouping + upload ───────────────────────────────────────────────────────
class OpenGroup:
    def __init__(self, key: str, cls: str, camera: str) -> None:
        self.key, self.cls, self.camera = key, cls, camera
        self.vectors: list[np.ndarray] = []
        self.samples = 0
        self.first = self.last = 0.0
        self.refs: list[dict] = []
        self.best_crop = (-1.0, "")
        self.sure_name: str | None = None

    def centroid(self) -> np.ndarray:
        c = np.mean(self.vectors, axis=0)
        return c / max(float(np.linalg.norm(c)), 1e-9)


class Learner:
    JOIN_GAP_S = 30.0
    JOIN_SIM = 0.65
    SURE_JOIN_GAP_S = 600.0
    MAX_GROUP_SAMPLES = 160  # past this a group is closed and the next sighting starts a new card

    def __init__(self, args, rest: Rest, gallery: Gallery, models: "Models") -> None:
        self.args, self.rest, self.gallery, self.models = args, rest, gallery, models
        self.open: dict[tuple[str, str], OpenGroup] = {}
        self.idents: dict[tuple[str, int], dict] = {}
        self.collecting = True
        # Set while the director is enrolling a guest: the one body the house
        # cannot name is that guest.
        self.enroll_slug: str | None = None
        self.pending_readings: dict[str, dict] = {}
        self.stats = collections.Counter()
        self.faced_at: dict[str, float] = {}

    def name_open_tracks(self, camera: str, tracks: dict, now: float) -> None:
        """Name the bodies currently in frame, so the director can follow them."""
        for tid, tr in tracks.items():
            if not tr.crops:
                continue
            seen = self.idents.get((camera, tid))
            if seen and now - seen["at"] < IDENT_EVERY_S:
                continue
            # All the looks the track has kept, not just the best three: a
            # seated body shows a different slice of itself each time.
            best = sorted(tr.crops, key=lambda c: -c[0])[:8]
            vs = self.models.embedders()["person" if tr.cls == "person" else "pet"].embed_rgb([c[2] for c in best])
            vec = vs.mean(0)
            vec /= max(float(np.linalg.norm(vec)), 1e-9)
            scores = self.gallery.scores(tr.cls, vec)
            top = max(scores.values()) if scores else 0.0
            ident = self.idents.setdefault((camera, tid), {"history": [], "held": None})
            # A fresh look: resolve() counts it towards the track's votes once.
            ident.update({"scores": scores, "vec": vec, "at": now, "cls": tr.cls, "fresh": True,
                          "not_a_person": self.gallery.looks_like_nothing(tr.cls, vec, top)})

    def judge_facing(self, camera: str, tracks: dict, frame: np.ndarray, now: float) -> None:
        """Front, side or back, for each body on a camera that shares its room.

        Only those cameras need it: the director picks between two views of the
        same body by which one sees the front. Elsewhere there is no choice to make.
        """
        if not any(CAMERA_ROOMS.get(camera, camera) in pair for pair in OVERLAPPING_ROOMS):
            return
        open_tracks = {tid: tr for tid, tr in tracks.items() if tr.cls == "person" and tr.boxes and now - tr.end <= 2.0}
        # Every 2 s per camera is plenty: people turn in their chairs slower than that.
        if not open_tracks or now - self.faced_at.get(camera, 0.0) < 2.0:
            return
        self.faced_at[camera] = now
        model = self.models.pose(self.args.pose)
        if model is None:
            return
        res = model(frame, classes=[0], conf=0.35, imgsz=960, verbose=False)[0]
        if res.keypoints is None or res.boxes is None or not len(res.boxes):
            return
        poses = list(zip(res.boxes.xyxy.cpu().numpy().tolist(), res.keypoints.conf.cpu().numpy()))
        for tid, tr in open_tracks.items():
            box = tr.boxes[-1][1:5]
            iou, conf = max(((box_iou(box, pb), kc) for pb, kc in poses), key=lambda x: x[0])
            ident = self.idents.get((camera, tid))
            if ident is not None:
                ident["facing"] = facing(conf) if iou >= 0.3 else None
                self.stats[f"facing-{ident['facing']}"] += 1

    def dump_reasoning(self, sightings: list, verdicts: dict, now: float) -> None:
        """out/live/reasoning.json: every body's scores, verdict and held name, for "why is Tyler Joe"."""
        if now - getattr(self, "_dumped_at", 0.0) < 3.0:
            return
        self._dumped_at = now
        rows = []
        for s in sightings:
            ident, v = self.idents[s.key], verdicts[s.key]
            top = sorted(s.scores.items(), key=lambda kv: -kv[1])[:4]
            rows.append({"camera": s.key[0], "track": s.key[1], "room": s.room, "held": ident.get("held"),
                         "verdict": v.name, "margin": round(v.margin, 3), "lost": v.lost_claim, "excluded": v.excluded,
                         "partner": list(v.partner) if v.partner else None, "top": [[n, round(x, 3)] for n, x in top],
                         "history": ident.get("history", [])[-4:], "notAPerson": ident.get("not_a_person"),
                         "facing": ident.get("facing"), "age": round(now - ident.get("at", now), 1)})
        try:
            out = ROOT / "out" / "live" / "reasoning.json"
            out.parent.mkdir(parents=True, exist_ok=True)
            tmp = out.with_suffix(".tmp")
            tmp.write_text(json.dumps({"at": now, "bodies": rows}, indent=1, default=str), encoding="utf-8")
            tmp.replace(out)
        except OSError:
            pass

    def resolve(self, live: dict, now: float) -> None:
        """Name every body in the house at once (see tank_vision/identity_live.py).

        One body per name, strongest claim first, and bodies seen by two
        overlapping cameras pooled into one person -- then each track's votes
        are counted on that house-wide answer, not on its own lonely guess.
        """
        sightings = []
        for camera, tracks in live.items():
            room = CAMERA_ROOMS.get(camera, camera)
            for tid, tr in tracks.items():
                ident = self.idents.get((camera, tid))
                if not ident or "scores" not in ident or now - tr.end > 2.0:
                    continue
                # The rack, the jacket: never a claimant. Left in, a rack
                # holding "tyler" pushed the real Tyler onto Joe's name.
                if ident.get("not_a_person"):
                    ident.update({"name": None, "held": None, "partner": None})
                    continue
                sightings.append(Sighting((camera, tid), tr.cls, room, ident["vec"], ident["scores"], ident.get("held")))
        if not sightings:
            return
        verdicts = resolve_house(sightings)
        for sighting in sightings:
            verdict = verdicts[sighting.key]
            ident = self.idents[sighting.key]
            ident.update({"name": verdict.name, "score": verdict.score, "margin": verdict.margin, "partner": verdict.partner})
            if verdict.lost_claim:
                # Two bodies held one name; the stronger kept it.
                ident["held"] = None
                self.stats["claims-lost"] += 1
            if ident.pop("fresh", False):
                history = (ident.get("history") or [])[-(VOTE_WINS - 1):] + [(verdict.name, verdict.margin)]
                ident["history"] = history
                streak = len(history) >= VOTE_WINS and all(n == verdict.name and m >= VOTE_MIN_MARGIN for n, m in history[-VOTE_WINS:])
                # Once earned, a name sticks to the track until another name earns it:
                # one bad look (a turn, an arm across the face) must not un-name a body.
                held = ident.get("held")
                if verdict.margin >= CONFIDENT_MARGIN or streak:
                    held = verdict.name
                elif held and held != verdict.name and len(history) >= VOTE_WINS and all(n == verdict.name for n, _ in history[-VOTE_WINS:]):
                    held = None
                ident["held"] = held
            # Enrolling: a person nobody can put a known name to is the guest.
            # A housemate who wanders in earns their own name within a few
            # checks and stops being mistaken for the guest.
            if self.enroll_slug and sighting.cls == "person" and ident.get("held") in (None, self.enroll_slug):
                known = verdict.margin >= CONFIDENT_MARGIN and verdict.name and verdict.name != self.enroll_slug
                ident["held"] = None if known else self.enroll_slug
        self.dump_reasoning(sightings, verdicts, now)
        # Overlapping cameras agree: one confident view names the other.
        for sighting in sightings:
            partner = self.idents[sighting.key].get("partner")
            mine = self.idents[sighting.key]
            theirs = self.idents.get(partner) if partner else None
            if theirs and theirs.get("held") and not mine.get("held"):
                mine["held"] = theirs["held"]
                self.stats["named-by-overlap"] += 1

    def publish(self, camera: str, tracks: dict, shape: tuple[int, int], now: float) -> None:
        """Tell the director who is on this camera right now.

        It is posted as an identity overlay, not as a reading: the vision worker
        still owns audio and motion, and the two must not overwrite each other.
        """
        height, width = shape
        boxes = []
        people = animals = 0
        target = None
        target_area = 0.0
        target_score = 0.0
        for tid, tr in tracks.items():
            if not tr.boxes or now - tr.end > 2.0:
                continue
            _, x1, y1, x2, y2, conf = tr.boxes[-1]
            nw, nh = max(0.0, (x2 - x1) / width), max(0.0, (y2 - y1) / height)
            ident = self.idents.get((camera, tid)) or {}
            # Only a confident name reaches the director. An unsure guess is
            # still worth grading, but following the wrong body is worse than
            # following an unnamed one.
            if ident.get("not_a_person"):
                # The rack, the TV, the mirror: detected, recognised as a known
                # false positive, and kept out of the director's view entirely.
                # Sent as "suppressed" so Tank also drops the vision worker's box
                # for the same spot (it merges both detectors' boxes now).
                self.stats["suppressed"] += 1
                boxes.append({"nx": round(x1 / width, 4), "ny": round(y1 / height, 4), "nw": round(nw, 4), "nh": round(nh, 4),
                              "label": "suppressed", "confidence": round(float(conf), 3)})
                continue
            # What the director hears is the name the track has EARNED -- by one
            # decisive look, or by winning look after look -- not this instant's guess.
            named = ident.get("held")
            box = {"nx": round(x1 / width, 4), "ny": round(y1 / height, 4), "nw": round(nw, 4), "nh": round(nh, 4),
                   "label": tr.cls, "confidence": round(float(conf), 3), "isMovement": bool(tr.moved)}
            if named:
                box["targetName"] = named
            if ident.get("facing"):
                box["facing"] = ident["facing"]
                if tr.cls == "person" and nw * nh > target_area:
                    target, target_area, target_score = named, nw * nh, float(ident.get("score", 0))
            boxes.append(box)
            if tr.cls == "person":
                people += 1
            else:
                animals += 1
        reading = {"cameraId": camera, "peopleCount": people, "animalCount": animals,
                   "visibleFeetCount": 0, "feetConfidence": 0, "faceCount": 0,
                   "motionScore": 0, "audioPeak": 0, "isSpeaking": False, "boundingBoxes": boxes[:32]}
        if target:
            reading["targetMemberDetected"] = target
            reading["targetMemberConfidence"] = round(target_score, 3)
        self.pending_readings[camera] = reading

    def flush(self, secret: str, url: str) -> None:
        if self.args.dry_run or not self.pending_readings:
            return
        body = {"cameras": list(self.pending_readings.values()), "source": "learner"}
        self.pending_readings.clear()
        try:
            self.rest.post_telemetry(url, secret, body)
            self.stats["published"] += 1
        except RuntimeError as exc:
            self.stats["publish-errors"] += 1
            if self.stats["publish-errors"] % 20 == 1:
                print(f"  publish failed: {exc}", flush=True)

    def forget(self, camera: str, tid: int) -> None:
        self.idents.pop((camera, tid), None)

    def still_pending(self, key: str) -> bool:
        if self.args.dry_run:
            return True
        try:
            rows = self.rest.get(f"tank_identity_clusters?select=status&cluster_key=eq.{key}")
        except RuntimeError:
            return False  # unsure: start a fresh group rather than risk overwriting a grade
        return not rows or rows[0]["status"] == "pending"

    def finish(self, camera: str, tr: Track) -> None:
        # Naming for the director happens live, in name_open_tracks. This is the
        # curating half -- embed, group, upload crops to grade -- so outside the
        # collecting mode it costs nothing and writes nothing.
        if not self.collecting:
            tr.crops.clear()
            return
        if not (tr.end - tr.start >= self.args.min_seconds and tr.moved and tr.crops):
            return
        crops = sorted(tr.crops, key=lambda c: c[1])
        vs = self.models.embedders()["person" if tr.cls == "person" else "pet"].embed_rgb([c[2] for c in crops])
        vec = vs.mean(0)
        vec /= max(float(np.linalg.norm(vec)), 1e-9)
        room = CAMERA_ROOMS.get(camera, camera)

        name, score, margin, ranked = self.gallery.name(tr.cls, vec)
        sure_name = name if margin >= CONFIDENT_MARGIN else None
        group = self.open.get((camera, tr.cls))
        gap = tr.start - group.last if group else float("inf")
        joinable = (
            group is not None
            and (
                # the same body back after a missed detection
                (gap <= self.JOIN_GAP_S and float(group.centroid() @ vec) >= self.JOIN_SIM)
                # or a confident repeat of the group's confident name: a dog pacing the
                # kitchen for an hour is one card to approve, not two hundred
                or (sure_name is not None and sure_name == group.sure_name and gap <= self.SURE_JOIN_GAP_S)
            )
            and group.samples < self.MAX_GROUP_SAMPLES
            and group.key not in self.gallery.reviewed
            and self.still_pending(group.key)  # never grow (or un-grade) a group someone already graded
        )
        if not joinable:
            stamp = datetime.fromtimestamp(tr.start, timezone.utc)
            key = f"live-{tr.cls}-{stamp:%Y%m%d-%H%M%S}-{camera[-3:]}-{tr.tid}"
            group = OpenGroup(key, tr.cls, camera)
            group.first = tr.start
            self.open[(camera, tr.cls)] = group
            self.stats["groups"] += 1
        group.vectors.append(vec)
        group.last = tr.end

        group.refs.append({"camera": camera, "room": room, "start": round(tr.start, 1), "end": round(tr.end, 1),
                           "guess": name, "score": round(score, 3), "margin": round(margin, 3), "ranked": ranked})
        self.stats["tracklets"] += 1
        self.stats[f"guess-{name}-{'sure' if margin >= CONFIDENT_MARGIN else 'unsure'}"] += 1

        day = datetime.fromtimestamp(tr.start, timezone.utc).strftime("%Y-%m-%d")
        folder = (HOST_CROPS / day / group.key) if HOST_CROPS else Path(tempfile.gettempdir()) / "tank-learner" / group.key
        samples = []
        for i, ((quality, t, rgb), emb) in enumerate(zip(crops, vs)):
            name_on_disk = f"{group.key}-{group.samples + i:03d}"
            # The table only accepts 20 hex characters as an id.
            sample_id = hashlib.sha1(name_on_disk.encode()).hexdigest()[:20]
            path = folder / f"{name_on_disk}.jpg"
            object_name = f"live/{day}/{group.key}/{name_on_disk}.jpg"
            if not self.args.dry_run:
                folder.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(path), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])
                try:
                    self.rest.put_object(CROP_BUCKET, object_name, path)
                except RuntimeError as exc:
                    self.stats["crop-upload-errors"] += 1
                    print(f"  {exc}", flush=True)
                if HOST_CROPS is None:
                    path.unlink(missing_ok=True)
            container_path = f"storage://{CROP_BUCKET}/{object_name}"
            if quality > group.best_crop[0]:
                group.best_crop = (quality, container_path)
            box = min(tr.boxes, key=lambda b: abs(b[0] - t)) if tr.boxes else None
            samples.append({
                "sample_id": sample_id, "target_slug": None, "detected_class": tr.cls, "label_status": "quarantined",
                "label_source": "auto-anchor-proposal", "dataset_split": "unassigned", "cluster_key": group.key, "source_key": camera, "room_scope": room,
                "offset_seconds": round(t, 2), "box_xyxy": list(box[1:5]) if box else None, "crop_path": container_path,
                "detector_confidence": box[5] if box else None, # crop_score is confidence x sqrt(box area); a 180x400 px body at 0.9 is about 240.
                "crop_quality": round(min(1.0, float(quality) / 240.0), 3),
                "anchor_score": round(score, 4), "identity_margin": round(margin, 4),
            })
        group.samples += len(samples)

        centroid = group.centroid()
        g_name, g_score, g_margin, _ = self.gallery.name(tr.cls, centroid)
        enrolling = bool(self.enroll_slug) and tr.cls == "person" and not (g_margin >= CONFIDENT_MARGIN and g_name != self.enroll_slug)
        if enrolling:
            # Saved as the guest and marked sure, so the whole session lands in
            # the Label Lab's Sure queue: strike the bad crops, then Yes to all.
            g_name, g_margin = self.enroll_slug, max(g_margin, CONFIDENT_MARGIN)
        group.sure_name = g_name if g_margin >= CONFIDENT_MARGIN else None
        now =datetime.now(timezone.utc).isoformat()
        cluster = {
            "cluster_key": group.key, "detected_class": tr.cls, "status": "pending",
            # Always carry the best guess, even a shaky one: naming a card from
            # scratch is the slow path, and a wrong guess costs one tap to fix.
            # source_refs says whether it is confident; the review screen splits on that.
            "suggested_target_slug": g_name,
            # The page shows this number; it is the gallery score of the whole group.
            "suggestion_confidence": round(g_score, 4),
            "centroid": [round(float(v), 6) for v in centroid], "embedding_length": int(centroid.shape[0]),
            "sample_count": group.samples, "model_key": MODEL_KEYS[tr.cls],
            "representative_crop_path": group.best_crop[1],
            "source_refs": group.refs[-50:]
            + ([{"enrollment": self.enroll_slug}] if enrolling else [])
            + [{"learner": {"guess": g_name, "margin": round(g_margin, 3), "sure": g_margin >= CONFIDENT_MARGIN}}],
            "first_seen_at": datetime.fromtimestamp(group.first, timezone.utc).isoformat(),
            "last_seen_at": datetime.fromtimestamp(group.last, timezone.utc).isoformat(),
            "updated_at": now,
        }
        try:
            self.rest.upsert("tank_identity_clusters", [cluster], "cluster_key")
            self.rest.upsert("tank_identity_training_samples", samples, "sample_id")
        except RuntimeError as exc:
            self.stats["upload-errors"] += 1
            print(f"  upload failed: {exc}", flush=True)
        print(f"  {room:12s} {tr.cls:6s} {tr.end - tr.start:5.1f}s -> {name} ({score:.2f}, margin {margin:+.2f})  group {group.key[-22:]} x{len(group.vectors)}", flush=True)


# The director is "on AI" whenever it is choosing shots itself, whatever it is
# looking for: auto, follow member, animals, speaker and the rest all direct the
# house. Only a hand on the controls -- manual mode, or somebody flying a camera
# from the browser -- means the AI is not working, and then nothing is learned.
HANDS_ON_MODES = {"manual"}
# The learner runs ONLY while enrolling -- adding people, gathering data. Every
# presenting mode (follow member, dog, speaker, group, auto) directs from the
# vision worker alone: fast, and nothing extra to spin up mid-follow (owner's
# call, 2026-09-19). Idle, this process holds no model, no GPU and no camera.
# It ran in every AI mode before; with the pose model that was ~4 GB of the
# Docker VM, and the VM swapping is when camera receivers started dropping off
# Docker's network. Override: LEARNER_MODES=a,b,c.
NAME_MODES = set(filter(None, os.environ.get("LEARNER_MODES", "enroll").split(",")))
# ONE mode collects. "auto" is the director roaming wherever it likes, which is
# when the operator wants it gathering material to grade. Every other AI mode is
# a job -- follow Malia, watch the animals, hold on whoever is talking -- and a
# job must spend the graded data, not stop to curate more of it. So the learner
# still names bodies in those modes (the director needs the names) and writes
# nothing to the grading queue.
COLLECT_MODES = {"auto", "enroll"}


def enrollment_slug(rest: Rest) -> str | None:
    """The guest being enrolled right now (Tank's director_enrollment), or None."""
    rows = rest.get("tank_platform_settings?select=value&key=eq.director_enrollment")
    value = (rows[0]["value"] or {}) if rows else {}
    return value.get("slug") if value.get("slug") and not value.get("finishedAt") else None


def director_wants_learning(rest: Rest) -> tuple[bool, str]:
    """(is the director on AI, which mode) -- naming runs on AI, collecting only in COLLECT_MODES."""
    rows = rest.get("tank_platform_settings?select=value&key=eq.director_operator_mode")
    mode = ((rows[0]["value"] or {}).get("mode") if rows else None) or "auto"
    if mode in HANDS_ON_MODES or mode not in NAME_MODES:
        return False, mode
    lease = rest.get("tank_platform_settings?select=value&key=eq.director_manual_pilot_lease")
    expires = ((lease[0]["value"] or {}).get("expiresAt") if lease else 0) or 0
    if expires / 1000 > time.time():
        return False, "manual-pilot"
    return True, mode


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fps", type=float, default=2.0)
    ap.add_argument("--imgsz", type=int, default=960)
    ap.add_argument("--min-seconds", type=float, default=1.5)
    ap.add_argument("--motion-threshold", type=float, default=1.2)
    ap.add_argument("--yolo", default=str(ROOT / "models" / "yolo11m.pt"))
    ap.add_argument("--pose", default=str(ROOT / "models" / "yolo11x-pose.pt"))
    ap.add_argument("--priority", choices=["low", "normal"], default="low")
    ap.add_argument("--always", action="store_true", help="learn regardless of the director mode")
    ap.add_argument("--dry-run", action="store_true", help="no uploads, no crop files")
    ap.add_argument("--minutes", type=float, default=0, help="stop after this long (0 = run until stopped)")
    ap.add_argument("--publish", action=argparse.BooleanOptionalAction, default=True, help="tell the director who it is looking at")
    ap.add_argument("--publish-url", default=TELEMETRY_URL)
    ap.add_argument("--cameras", nargs="*", default=list(CAMERA_ROOMS))
    args = ap.parse_args()

    if args.priority == "low":
        from tank_vision.background import make_polite
        make_polite()

    STATE.mkdir(parents=True, exist_ok=True)
    rest = Rest(args.dry_run)
    gallery = Gallery(rest)
    gallery.refresh()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    models = Models(device)
    learner = Learner(args, rest, gallery, models)
    print(f"learner device={device} cameras={len(args.cameras)} gallery="
          f"{ {c: len(n) for c, (_, n) in gallery.base.items()} } live-graded={ {c: len(n) for c, (_, n) in gallery.live.items()} }", flush=True)

    kill_container_ffmpeg()
    feeds: dict[str, CameraFeed] = {}
    live: dict[str, dict[int, Track]] = {}
    seen: dict[str, int] = {}
    motion_ref: dict[str, np.ndarray | None] = {}
    active = False
    mode_checked = 0.0
    published = 0.0
    retrickle: subprocess.Popen | None = None
    last_mode = ""
    mode = "auto"
    secret = env("TANK_ARCHIVE_INGEST_SECRET") if args.publish else ""
    started = time.time()

    def stop_feeds() -> None:
        for cam, feed in feeds.items():
            feed.stop()
            for tr in live.get(cam, {}).values():
                learner.finish(cam, tr)
        feeds.clear()
        live.clear()
        kill_container_ffmpeg()

    try:
        while not args.minutes or time.time() - started < args.minutes * 60:
            now = time.time()
            if now - mode_checked >= 30:
                mode_checked = now
                try:
                    want, mode = (True, "always") if args.always else director_wants_learning(rest)
                except RuntimeError as exc:
                    print(f"mode check failed: {exc}", flush=True)
                    want = active
                learner.collecting = args.always or mode in COLLECT_MODES
                try:
                    learner.enroll_slug = enrollment_slug(rest) if mode == "enroll" else None
                except RuntimeError:
                    pass  # keep the last answer; a blip must not drop the guest mid-walk
                if want and not active:
                    job = "collecting to grade" if learner.collecting else "naming only, using what is graded"
                    print(f"{datetime.now():%H:%M:%S} director on AI ({mode}): {job}, {len(args.cameras)} cameras", flush=True)
                    for cam in args.cameras:
                        feeds[cam] = CameraFeed(cam, args.fps)
                        feeds[cam].start()
                        models.detector(cam, args.yolo)
                        live[cam], seen[cam], motion_ref[cam] = {}, 0, None
                elif active and not want:
                    print(f"{datetime.now():%H:%M:%S} director is hands-on ({mode}): pausing, freeing the GPU", flush=True)
                    stop_feeds()
                    models.release()
                if active and want and mode != last_mode:
                    job = "collecting to grade" if learner.collecting else "naming only, using what is graded"
                    print(f"{datetime.now():%H:%M:%S} director mode {last_mode} -> {mode}: {job}", flush=True)
                last_mode = mode
                active = want
                if now - gallery.loaded_at >= 300:
                    try:
                        gallery.refresh()
                    except RuntimeError as exc:
                        print(f"gallery refresh failed: {exc}", flush=True)
                if gallery.load_base():
                    print(f"{datetime.now():%H:%M:%S} gallery rebuilt on disk: reloaded "
                          f"{ {c: len(n) for c, (_, n) in gallery.base.items()} }", flush=True)
                # The Label Lab's "Re-trickle singles" button asks for this job.
                # It runs beside the learner, not inside it: it rebuilds the
                # gallery and embeds thousands of crops, and the cameras must
                # keep being watched meanwhile.
                if retrickle is None or retrickle.poll() is not None:
                    try:
                        request = rest.get("tank_platform_settings?select=value&key=eq.label_lab_retrickle")
                        state = (request[0]["value"] or {}).get("status") if request else None
                    except RuntimeError:
                        state = None
                    # A job marked running with no process behind it was killed by a
                    # restart of this container (2026-09-19: a deploy 30 s after the
                    # operator pressed the button left "rebuilding gallery" on screen
                    # for good). Nothing else can be running it, so run it again.
                    if state == "running" and retrickle is None:
                        print(f"{datetime.now():%H:%M:%S} re-trickle was cut off by a restart; running it again", flush=True)
                        state = "requested"
                    if state == "requested":
                        print(f"{datetime.now():%H:%M:%S} re-trickle requested from the Label Lab", flush=True)
                        retrickle = subprocess.Popen([sys.executable, "-u", str(ROOT / "tools" / "retrickle_singles.py")],
                                                     cwd=str(ROOT), creationflags=_NO_WINDOW)
                (STATE / "status.json").write_text(json.dumps({
                    "at": datetime.now(timezone.utc).isoformat(), "active": active, "dry_run": args.dry_run,
                    "mode": mode, "collecting": active and learner.collecting,
                    "cameras": {c: {"frames": f.seq, "age_s": round(now - f.stamp, 1) if f.stamp else None} for c, f in feeds.items()},
                    "live_graded": {c: len(n) for c, (_, n) in gallery.live.items()}, "stats": learner.stats,
                }, indent=1), encoding="utf-8")

            if not active:
                time.sleep(1.0)
                continue

            worked = False
            for cam, feed in feeds.items():
                if feed.seq == seen[cam] or feed.frame is None:
                    continue
                seen[cam] = feed.seq
                frame, t = feed.frame, feed.stamp
                H, W = frame.shape[:2]
                small = cv2.cvtColor(cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
                ref = motion_ref[cam]
                if ref is not None and not live[cam] and float(cv2.absdiff(small, ref).mean()) < args.motion_threshold:
                    continue
                motion_ref[cam] = small
                worked = True
                res = models.detector(cam, args.yolo).track(frame, persist=True, tracker="bytetrack.yaml", classes=list(COCO), conf=0.35,
                                           imgsz=args.imgsz, verbose=False)[0]
                tracks = live[cam]
                if res.boxes is not None and res.boxes.id is not None:
                    for (x1, y1, x2, y2), tid, c, conf in zip(
                        res.boxes.xyxy.cpu().numpy().astype(int), res.boxes.id.int().cpu().tolist(),
                        res.boxes.cls.int().cpu().tolist(), res.boxes.conf.cpu().tolist(),
                    ):
                        cls = COCO[c]
                        cx, cy = (x1 + x2) / 2 / W, (y1 + y2) / 2 / H
                        tr = tracks.get(tid)
                        if tr is None or tr.cls != cls:
                            if tr is not None:
                                learner.finish(cam, tr)
                            tr = Track(tid, cls, t, t, (cx, cy))
                            tracks[tid] = tr
                        tr.end = t
                        if ((cx - tr.first_center[0]) ** 2 + (cy - tr.first_center[1]) ** 2) ** 0.5 >= 0.03:
                            tr.moved = True
                        if len(tr.boxes) < 4000:
                            tr.boxes.append((round(t, 2), int(x1), int(y1), int(x2), int(y2), round(float(conf), 3)))
                        score = crop_score(cls, conf, x1, y1, x2, y2, W, H) if conf >= 0.5 else None
                        if score is not None:
                            keep_crop(tr, score, t, cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2RGB))
                for tid in [k for k, tr in tracks.items() if t - tr.end > 5.0]:
                    learner.finish(cam, tracks.pop(tid))
                    learner.forget(cam, tid)
                # A camera that stopped delivering must not hold its tracks open forever.
            if now - published >= PUBLISH_EVERY_S and args.publish:
                published = now
                for cam, feed in feeds.items():
                    if feed.frame is not None:
                        learner.name_open_tracks(cam, live.get(cam, {}), now)
                        learner.judge_facing(cam, live.get(cam, {}), feed.frame, now)
                learner.resolve(live, now)
                for cam, feed in feeds.items():
                    if feed.frame is not None:
                        learner.publish(cam, live.get(cam, {}), feed.frame.shape[:2], now)
                learner.flush(secret, args.publish_url)

            for cam, feed in feeds.items():
                if feed.stamp and time.time() - feed.stamp > 20 and live.get(cam):
                    for tr in live[cam].values():
                        learner.finish(cam, tr)
                    live[cam].clear()
            if not worked:
                time.sleep(0.05)
    except KeyboardInterrupt:
        pass
    finally:
        stop_feeds()
        print(f"stopped. {dict(learner.stats)}", flush=True)


if __name__ == "__main__":
    main()
