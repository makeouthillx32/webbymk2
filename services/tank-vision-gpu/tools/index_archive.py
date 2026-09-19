"""Turn archive recordings into tracklets with identity embeddings.

    .venv/Scripts/python tools/index_archive.py                      # every camera-day in V:/tank-archive/segments
    .venv/Scripts/python tools/index_archive.py --limit-seconds 120 --streams cam-1786768240092_2026-09-13

A TRACKLET is one continuous sighting of one body in one camera: the unit every
later step works with. A single crop is one guess from one angle; a tracklet is
many looks at the same person that the tracker already guarantees belong
together, which is free, reliable evidence.

Per recording this writes, under out/archive-index/:
  <stem>.json   tracklet metadata (class, start/end seconds, boxes, room)
  <stem>.npz    track_emb  (tracklets x D)   mean of the crop embeddings
                crop_emb   (tracklets x K x D) the individual crops, zero-padded
                (per class: person_*, cat_*, dog_*; row order = the json's "row")
  thumbs/<stem>/<track>.jpg  one representative crop, for contact sheets

A recording with an existing .json is skipped, so an interrupted run resumes.

What is dropped, deliberately:
  * tracks shorter than --min-seconds (a flicker is not a sighting),
  * tracks that never moved (the server rack that got named Tyler),
  * crops touching the frame edge (half a person embeds as someone else),
  * crops too small to carry identity.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tank_vision.reid import MODEL_KEY as PERSON_MODEL_KEY, OsnetAinEmbedder  # noqa: E402

COCO = {0: "person", 15: "cat", 16: "dog"}
MAX_CROPS = 8
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class Dinov2PetEmbedder:
    """Pets: DINOv2-small ranked the right pet first on 9/9 cross-room probes."""

    MODEL_KEY = "dinov2-vits14-v1"

    def __init__(self, device: str) -> None:
        self.device = device
        self.model = torch.hub.load("facebookresearch/dinov2", "dinov2_vits14", trust_repo=True).eval().to(device)
        if device == "cuda":
            self.model = self.model.half()

    def embed_rgb(self, crops: list[np.ndarray]) -> np.ndarray:
        if not crops:
            return np.zeros((0, 384), dtype=np.float32)
        batch = np.stack(
            [(cv2.resize(c, (224, 224), interpolation=cv2.INTER_AREA).astype(np.float32) / 255 - _MEAN) / _STD for c in crops]
        ).transpose(0, 3, 1, 2)
        t = torch.from_numpy(batch).to(self.device)
        if self.device == "cuda":
            t = t.half()
        with torch.no_grad():
            out = self.model(t).float().cpu().numpy()
        return out / np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9)


@dataclass
class Track:
    tid: int
    cls: str
    start: float
    end: float
    first_center: tuple[float, float]
    moved: bool = False
    gen: int = 0                                   # tracker generation within the stream
    boxes: list = field(default_factory=list)     # (t, x1, y1, x2, y2, conf)
    crops: list = field(default_factory=list)     # (score, t, rgb)


CAMERA_ROOMS = {
    "cam-1786768240090": "game-room",
    "cam-1786768240091": "living-room",
    "cam-1786768240092": "kitchen",
    "cam-1786768240093": "foyer",
    "cam-1786768240094": "makeup-room",
    "cam-1786768240095": "game-room-2",
}


def segment_start_epoch(path: Path) -> float:
    """Segment files are named by UTC start, e.g. 2026-09-14_02-24-30-199627.mp4."""
    from datetime import datetime, timezone
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{6})", path.stem)
    if not m:
        raise ValueError(f"unrecognised segment name: {path.name}")
    y, mo, d, h, mi, se, us = map(int, m.groups())
    return datetime(y, mo, d, h, mi, se, us, tzinfo=timezone.utc).timestamp()


def crop_score(cls: str, conf: float, x1, y1, x2, y2, W: int, H: int) -> float | None:
    w, h = x2 - x1, y2 - y1
    edge = 4
    if x1 <= edge or y1 <= edge or x2 >= W - edge or y2 >= H - edge:
        return None
    # A cat curled on a counter is small; a person that small carries no identity.
    min_h, min_w = (72, 28) if cls == "person" else (40, 40)
    if h < min_h or w < min_w:
        return None
    return conf * (w * h) ** 0.5


def keep_crop(track: Track, score: float, t: float, rgb: np.ndarray) -> None:
    # Spread crops over the track's life: a new crop within 1 s of a kept one
    # only replaces it if it is better, so eight crops are eight poses.
    for i, (s, ct, _) in enumerate(track.crops):
        if abs(ct - t) < 1.0:
            if score > s:
                track.crops[i] = (score, t, rgb)
            return
    track.crops.append((score, t, rgb))
    if len(track.crops) > MAX_CROPS:
        track.crops.remove(min(track.crops, key=lambda c: c[0]))


def index_stream(name: str, camera: str, files: list[Path], detector_path: Path, embedders: dict, args, OUT: Path) -> dict:
    """Index one camera-day: its segments in order, as one continuous stream.

    Times are absolute (Unix seconds, UTC, from the segment file names), so a
    tracklet in the kitchen and one in the foyer can be compared on the same
    clock -- the basis of "one person cannot be in two rooms at once".
    """
    from ultralytics import YOLO

    room = CAMERA_ROOMS.get(camera, camera)
    detector = YOLO(str(detector_path))
    live: dict[int, Track] = {}
    thumbs = OUT / "thumbs" / name
    thumbs.mkdir(parents=True, exist_ok=True)
    meta: list[dict] = []
    embs: dict[str, list[np.ndarray]] = {}
    crop_embs: dict[str, list[np.ndarray]] = {}
    t0 = time.time()
    frames = 0
    skipped = 0
    seconds = 0.0
    prev_end: float | None = None
    budget = args.limit_seconds or float("inf")

    def finish(tr: Track) -> None:
        # Embedded the moment the track ends, then its pixels are dropped:
        # holding every crop until a day finished would cost gigabytes.
        if not (tr.end - tr.start >= args.min_seconds and tr.moved and tr.crops):
            return
        crops = sorted(tr.crops, key=lambda c: c[1])
        vs = embedders["person" if tr.cls == "person" else "pet"].embed_rgb([c[2] for c in crops])
        mean = vs.mean(0)
        mean /= max(float(np.linalg.norm(mean)), 1e-9)
        pad = np.zeros((MAX_CROPS, vs.shape[1]), dtype=np.float16)
        pad[: len(vs)] = vs[:MAX_CROPS]
        embs.setdefault(tr.cls, []).append(mean.astype(np.float32))
        crop_embs.setdefault(tr.cls, []).append(pad)
        # The tracker reuses an id when a body it lost comes back, so gen-tid
        # alone collided for 1,075 of 4,094 tracklets and overwrote 619 thumbnails.
        key = f"{tr.gen}-{tr.tid}-{int(tr.start * 1000)}"
        cv2.imwrite(str(thumbs / f"{key}.jpg"), cv2.cvtColor(max(tr.crops, key=lambda c: c[0])[2], cv2.COLOR_RGB2BGR))
        meta.append({
            "key": key, "class": tr.cls, "row": len(embs[tr.cls]) - 1, "camera": camera, "room": room,
            "start": round(tr.start, 2), "end": round(tr.end, 2), "crops": len(vs),
            "boxes": tr.boxes[:: max(1, len(tr.boxes) // 200)],
        })
        tr.crops.clear()

    gen = 0
    for path in files:
        if seconds >= budget:
            break
        seg_start = segment_start_epoch(path)
        cap = cv2.VideoCapture(str(path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
        if not (1.0 <= fps <= 60.0):
            fps = 15.0
        W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        step = max(1, round(fps / args.fps))

        # A gap between segments (a restart, a dropped feed) breaks continuity:
        # a body before the gap is not guaranteed to be the body after it.
        if prev_end is not None and seg_start - prev_end > 10.0:
            for tr in live.values():
                finish(tr)
            live.clear()
            detector = YOLO(str(detector_path))
            gen += 1

        index = -1
        last_t = seg_start
        motion_ref = None
        while True:
            if not cap.grab():
                break
            index += 1
            if index % step:
                continue
            ok, frame = cap.retrieve()
            if not ok:
                break
            t = seg_start + index / fps
            last_t = t

            # Motion gate. Most archive hours are an empty room; a detector pass
            # there finds nothing and costs as much as a busy one. Skip frames
            # that match the last analysed frame, unless a track is live (a
            # person standing still must keep their track, not lose it).
            small = cv2.cvtColor(cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
            changed = motion_ref is None or float(cv2.absdiff(small, motion_ref).mean()) >= args.motion_threshold
            if not changed and not live:
                skipped += 1
                continue
            motion_ref = small
            frames += 1
            res = detector.track(
                frame, persist=True, tracker="bytetrack.yaml", classes=list(COCO), conf=0.35,
                imgsz=args.imgsz, verbose=False,
            )[0]
            if res.boxes is not None and res.boxes.id is not None:
                for (x1, y1, x2, y2), tid, c, conf in zip(
                    res.boxes.xyxy.cpu().numpy().astype(int), res.boxes.id.int().cpu().tolist(),
                    res.boxes.cls.int().cpu().tolist(), res.boxes.conf.cpu().tolist(),
                ):
                    cls = COCO[c]
                    cx, cy = (x1 + x2) / 2 / W, (y1 + y2) / 2 / H
                    tr = live.get(tid)
                    if tr is None or tr.cls != cls:
                        if tr is not None:
                            finish(tr)
                        tr = Track(tid, cls, t, t, (cx, cy), gen=gen)
                        live[tid] = tr
                    tr.end = t
                    if ((cx - tr.first_center[0]) ** 2 + (cy - tr.first_center[1]) ** 2) ** 0.5 >= 0.03:
                        tr.moved = True
                    if len(tr.boxes) < 4000:
                        tr.boxes.append((round(t, 2), int(x1), int(y1), int(x2), int(y2), round(float(conf), 3)))
                    score = crop_score(cls, conf, x1, y1, x2, y2, W, H) if conf >= 0.5 else None
                    if score is not None:
                        keep_crop(tr, score, t, cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2RGB))
            for tid in [k for k, tr in live.items() if t - tr.end > 5.0]:
                finish(live.pop(tid))
            if frames % 3000 == 0:
                rate = frames / max(1e-6, time.time() - t0)
                print(f"  {name}: {seconds / 3600:.2f}h indexed  {rate:.0f} fps  skipped={skipped}  tracklets={len(meta)}", flush=True)
        cap.release()
        seconds += max(0.0, last_t - seg_start)
        prev_end = last_t

    for tr in live.values():
        finish(tr)

    arrays = {}
    for cls in embs:
        arrays[f"{cls}_track_emb"] = np.stack(embs[cls])
        arrays[f"{cls}_crop_emb"] = np.stack(crop_embs[cls])
    np.savez_compressed(OUT / f"{name}.npz", **arrays)
    summary = {
        "stream": name, "camera": camera, "room": room, "segments": len(files), "frames": frames, "skipped_static": skipped,
        "hours_indexed": round(seconds / 3600, 2), "wall_seconds": round(time.time() - t0),
        "models": {"detector": detector_path.name, "person": PERSON_MODEL_KEY, "pet": Dinov2PetEmbedder.MODEL_KEY},
        "tracklets": len(meta), "by_class": {c: len(v) for c, v in embs.items()},
    }
    (OUT / f"{name}.json").write_text(json.dumps({"summary": summary, "tracklets": meta}), encoding="utf-8")
    return summary


def _pid_alive(pid: int) -> bool:
    if sys.platform != "win32":
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    import ctypes

    handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # QUERY_LIMITED_INFORMATION
    if not handle:
        return False
    code = ctypes.c_ulong()
    ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
    ctypes.windll.kernel32.CloseHandle(handle)
    return code.value == 259  # STILL_ACTIVE


def claim_lock(lock: Path) -> bool:
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        try:
            owner = int(lock.read_text().strip() or "0")
        except (OSError, ValueError):
            owner = 0
        if owner and _pid_alive(owner):
            return False
        lock.unlink(missing_ok=True)
        return claim_lock(lock)
    with os.fdopen(fd, "w") as fh:
        fh.write(str(os.getpid()))
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="V:/tank-archive/segments")
    ap.add_argument("--streams", nargs="*", default=None, help="camera_date names, e.g. cam-1786768240092_2026-09-13")
    ap.add_argument("--fps", type=float, default=2.0)
    ap.add_argument("--motion-threshold", type=float, default=1.2, help="mean abs grey-level change on a 160x90 thumbnail")
    ap.add_argument("--shard", default="0/1", help="i/n: process every n-th stream, offset i, for parallel runs")
    ap.add_argument("--imgsz", type=int, default=960)
    ap.add_argument("--min-seconds", type=float, default=1.5)
    ap.add_argument("--limit-seconds", type=float, default=0)
    ap.add_argument("--yolo", default=str(ROOT / "models" / "yolo11m.pt"))
    ap.add_argument("--priority", choices=["low", "normal"], default="low")
    args = ap.parse_args()

    if args.priority == "low":
        from tank_vision.background import make_polite
        make_polite()

    # A partial smoke run must never leave a "done" marker in the real index.
    OUT = ROOT / "out" / ("archive-index-smoke" if args.limit_seconds else "archive-index")
    OUT.mkdir(parents=True, exist_ok=True)

    streams = []
    for cam_dir in sorted(Path(args.root).iterdir()):
        if not cam_dir.is_dir():
            continue
        for day in sorted(p for p in cam_dir.iterdir() if p.is_dir()):
            name = f"{cam_dir.name}_{day.name}"
            if args.streams and name not in args.streams:
                continue
            files = sorted(day.glob("*.mp4"), key=segment_start_epoch)
            if files:
                streams.append((name, cam_dir.name, files))

    shard_i, shard_n = (int(x) for x in args.shard.split("/"))
    streams = streams[shard_i::shard_n]
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"shard {args.shard} device={device}  streams={len(streams)}  segments={sum(len(f) for _, _, f in streams)}", flush=True)
    embedders = {"person": OsnetAinEmbedder(device=device), "pet": Dinov2PetEmbedder(device)}
    for name, camera, files in streams:
        if (OUT / f"{name}.json").exists():
            print(f"skip {name} (already indexed)", flush=True)
            continue
        # Several indexers can share the list: each claims a stream with a lock
        # holding its pid, and a lock left by a process that died is taken over.
        lock = OUT / f"{name}.lock"
        if not claim_lock(lock):
            print(f"skip {name} (claimed by another indexer)", flush=True)
            continue
        try:
            print(f"index {name} ({len(files)} segments)", flush=True)
            print("  ", json.dumps(index_stream(name, camera, files, Path(args.yolo), embedders, args, OUT)), flush=True)
        finally:
            lock.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
