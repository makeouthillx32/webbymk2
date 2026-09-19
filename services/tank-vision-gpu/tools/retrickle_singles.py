"""Re-trickle the single-image cards: group them back into sightings and re-guess.

    python tools/retrickle_singles.py                 # rebuild gallery, then regroup
    python tools/retrickle_singles.py --no-rebuild    # regroup against the current gallery

Single-image cards come from "Drop struck to Not sure": crops the operator ruled
out of a named group. One card per crop is the slowest possible way to grade
them, and the guess they carry (none) is the least useful. Now that the named
data is clean, this:

  1. rebuilds the gallery from the graded crops (build_gallery_from_grades.py),
  2. embeds every pending single with the same models as the live learner,
  3. joins singles that are plainly the same body into one group,
  4. names each group against the clean gallery -- confident groups land in
     Sure, where "Yes to all" can confirm them in one click.

Requested from the Label Lab: the Tank app writes tank_platform_settings key
label_lab_retrickle = {status: "requested"} and the learner runs this. Progress
and the result are written back to the same key, which the screen shows.
Machine-only throughout: nothing here produces text for a person to read.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from index_archive import Dinov2PetEmbedder  # noqa: E402
from live_learner import CONFIDENT_MARGIN, CROP_BUCKET, MODEL_KEYS, Gallery, Rest, STORAGE, _NO_WINDOW  # noqa: E402
from tank_vision.reid import OsnetAinEmbedder  # noqa: E402

STATUS_KEY = "label_lab_retrickle"
# Two singles join one group when their bodies are this alike. Stricter for
# pets: two dogs of the same size and colour are closer than two people.
LINK = {"person": 0.72, "dog": 0.82, "cat": 0.82}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def set_status(rest: Rest, **fields) -> None:
    rest.upsert("tank_platform_settings", [{"key": STATUS_KEY, "value": {**fields, "updatedAt": now()}, "updated_at": now()}], "key")


def fetch_all(rest: Rest, path: str) -> list[dict]:
    rows: list[dict] = []
    for offset in range(0, 200_000, 1000):
        got = rest.get(f"{path}&limit=1000&offset={offset}")
        rows += got
        if len(got) < 1000:
            break
    return rows


def download(rest: Rest, crop_path: str, into: Path) -> np.ndarray | None:
    prefix = f"storage://{CROP_BUCKET}/"
    if not crop_path or not crop_path.startswith(prefix):
        return None
    out = subprocess.run(
        ["curl", "-sS", "-o", str(into), "-w", "%{http_code}", f"{STORAGE}/object/{CROP_BUCKET}/{crop_path[len(prefix):]}",
         "-H", f"apikey: {rest.key}", "-H", f"Authorization: Bearer {rest.key}", "--max-time", "20"],
        capture_output=True, text=True, timeout=40, creationflags=_NO_WINDOW)
    if out.stdout.strip() != "200":
        return None
    img = cv2.imread(str(into), cv2.IMREAD_COLOR)
    return None if img is None else cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def group_singles(vecs: np.ndarray, link: float) -> list[list[int]]:
    """Greedy average-link grouping: join the group whose centre is most alike, if alike enough."""
    groups: list[list[int]] = []
    centres: list[np.ndarray] = []
    for i, vec in enumerate(vecs):
        best, best_sim = -1, link
        for g, centre in enumerate(centres):
            sim = float(centre @ vec)
            if sim >= best_sim:
                best, best_sim = g, sim
        if best < 0:
            groups.append([i])
            centres.append(vec.copy())
        else:
            groups[best].append(i)
            centre = vecs[groups[best]].mean(0)
            centres[best] = centre / max(float(np.linalg.norm(centre)), 1e-9)
    return groups


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-rebuild", action="store_true", help="skip rebuilding the gallery first")
    args = ap.parse_args()
    rest = Rest(dry_run=False)
    started = now()
    set_status(rest, status="running", startedAt=started, stage="rebuilding gallery")

    try:
        if not args.no_rebuild:
            # The clean named data is the whole point: guess from it, not from
            # the gallery as it was before the operator's cleanup pass.
            subprocess.run([sys.executable, "-u", str(ROOT / "tools" / "build_gallery_from_grades.py")],
                           check=True, cwd=str(ROOT), creationflags=_NO_WINDOW)

        set_status(rest, status="running", startedAt=started, stage="reading single-image cards")
        singles = fetch_all(rest, "tank_identity_clusters?select=cluster_key,detected_class&cluster_key=like.single-*&status=eq.pending&order=cluster_key")
        classes = {row["cluster_key"]: row["detected_class"] for row in singles}
        samples = [row for row in fetch_all(rest, "tank_identity_training_samples?select=*&cluster_key=like.single-*&order=sample_id")
                   if row["cluster_key"] in classes and row.get("label_status") != "rejected"]
        print(f"{len(singles)} single cards, {len(samples)} crops", flush=True)
        if not samples:
            subprocess.run([sys.executable, "-u", str(ROOT / "tools" / "build_identity_map.py")],
                           cwd=str(ROOT), creationflags=_NO_WINDOW, check=False)
            set_status(rest, status="done", startedAt=started, finishedAt=now(), result={"singles": 0, "groups": 0, "sure": 0, "unsure": 0})
            return

        set_status(rest, status="running", startedAt=started, stage=f"embedding {len(samples)} crops")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        embedders = {"person": OsnetAinEmbedder(device=device), "pet": Dinov2PetEmbedder(device)}
        by_cls: dict[str, list[tuple[dict, np.ndarray]]] = collections.defaultdict(list)
        with tempfile.TemporaryDirectory() as tmp:
            scratch = Path(tmp) / "crop.jpg"
            pending: dict[str, list[tuple[dict, np.ndarray]]] = collections.defaultdict(list)

            def flush(cls: str) -> None:
                batch = pending.pop(cls, [])
                if batch:
                    vs = embedders["person" if cls == "person" else "pet"].embed_rgb([img for _, img in batch])
                    by_cls[cls] += [(row, vec.astype(np.float32)) for (row, _), vec in zip(batch, vs)]

            for row in samples:
                img = download(rest, row.get("crop_path") or "", scratch)
                if img is None:
                    continue
                cls = classes[row["cluster_key"]]
                pending[cls].append((row, img))
                if len(pending[cls]) >= 64:
                    flush(cls)
            for cls in list(pending):
                flush(cls)

        set_status(rest, status="running", startedAt=started, stage="grouping and guessing")
        gallery = Gallery(rest)
        gallery.refresh()
        stamp = now()
        new_clusters, moved, retired = [], [], []
        sure = unsure = 0
        for cls, items in by_cls.items():
            vecs = np.stack([vec for _, vec in items])
            for members in group_singles(vecs, LINK.get(cls, 0.8)):
                rows = [items[i][0] for i in members]
                centre = vecs[members].mean(0)
                centre /= max(float(np.linalg.norm(centre)), 1e-9)
                name, score, margin, _ = gallery.name(cls, centre)
                negative = gallery.looks_like_nothing(cls, centre, score)
                confident = margin >= CONFIDENT_MARGIN and not negative
                sure += confident
                unsure += not confident
                key = "regroup-" + hashlib.sha1("|".join(sorted(r["sample_id"] for r in rows)).encode()).hexdigest()[:20]
                new_clusters.append({
                    "cluster_key": key, "detected_class": cls, "status": "pending",
                    "assigned_target_slug": None, "suggested_target_slug": name,
                    "suggestion_confidence": round(max(0.0, min(1.0, score)), 4),
                    # A real centre now, from these crops -- not the parent's stand-in.
                    "centroid": [round(float(v), 6) for v in centre], "embedding_length": int(centre.shape[0]),
                    "model_key": MODEL_KEYS[cls], "sample_count": len(rows),
                    "representative_crop_path": rows[0].get("crop_path"),
                    "source_refs": [{"retrickled": [r["cluster_key"] for r in rows][:50], "at": stamp},
                                    {"learner": {"guess": name, "margin": round(margin, 3), "sure": confident, "notAPerson": negative}}],
                    "first_seen_at": stamp, "last_seen_at": stamp, "updated_at": stamp,
                })
                for r in rows:
                    retired.append(r["cluster_key"])
                    moved.append({**r, "cluster_key": key})

        for at in range(0, len(new_clusters), 200):
            rest.upsert("tank_identity_clusters", new_clusters[at:at + 200], "cluster_key")
        for at in range(0, len(moved), 200):
            rest.upsert("tank_identity_training_samples", moved[at:at + 200], "sample_id")
        # The emptied single cards go last, once every crop has a new home.
        for at in range(0, len(retired), 100):
            keys = ",".join(retired[at:at + 100])
            rest.delete("tank_identity_clusters", f"cluster_key=in.({keys})")

        # The Label Lab's Identity Map is drawn from the gallery just rebuilt;
        # refresh it too, so the picture always matches what the director sees.
        # A failed map is not a failed re-trickle.
        set_status(rest, status="running", startedAt=started, stage="redrawing the identity map")
        subprocess.run([sys.executable, "-u", str(ROOT / "tools" / "build_identity_map.py")],
                       cwd=str(ROOT), creationflags=_NO_WINDOW, check=False)

        result = {"singles": len(retired), "groups": len(new_clusters), "sure": sure, "unsure": unsure}
        print(json.dumps(result), flush=True)
        set_status(rest, status="done", startedAt=started, finishedAt=now(), result=result)
    except Exception as exc:  # noqa: BLE001 -- the screen must learn it failed, whatever failed
        set_status(rest, status="failed", startedAt=started, finishedAt=now(), error=str(exc)[:300])
        raise


if __name__ == "__main__":
    main()
