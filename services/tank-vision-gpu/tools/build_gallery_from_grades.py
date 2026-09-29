"""Rebuild the identity gallery from the crops the operator kept.

    .venv/Scripts/python tools/build_gallery_from_grades.py            # rebuild + score
    .venv/Scripts/python tools/build_gallery_from_grades.py --limit 500  # quick pass

Until now the gallery held ONE vector per named group, averaged when the group
was captured. That meant a strike changed nothing: the bad crop was already
baked into the average, and a crop handed to somebody else was ignored outright.
Four hours of careful grading moved no needles.

This reads the grading tables instead and embeds what survived:

  tank_identity_training_samples, label_status = confirmed
    -> its own target_slug when the operator gave that one crop to somebody,
       else the name on its group
  crops come from the private tank-identity-crops bucket
  people -> OSNet-AIN, pets -> DINOv2   (same models the live learner uses)

Output (read by live_learner.py at startup):
  out/gallery/{person,cat,dog}.npy   one row per kept crop
  out/gallery/{person,cat,dog}.json  name, room, source group, time
  out/gallery/report.json            counts and leave-one-room-out accuracy

Crops already embedded keep their vector (out/gallery/cache.npz), so a rebuild
after another grading session only embeds what is new.
"""

from __future__ import annotations

import argparse
import collections
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
# In the container the code lives at /app, with no repo above it.
REPO = ROOT.parents[1] if len(ROOT.parents) > 1 else ROOT
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from index_archive import Dinov2PetEmbedder  # noqa: E402
from live_learner import CROP_BUCKET, Rest, STORAGE  # noqa: E402
from tank_vision.reid import OsnetAinEmbedder  # noqa: E402

OUT = ROOT / "out" / "gallery"
# The 3,200 archive tracklets graded on the Housemate Labels page never went to
# the database -- they are local thumbnails from the archive pass. build_gallery.py
# turns those grades into vectors here, and they are merged in, or four hours of
# archive grading would silently drop out of the gallery.
ARCHIVE = ROOT / "out" / "gallery-archive"
CACHE = OUT / "cache.npz"
TOPK = 5
BATCH = 64


def fetch_rows(rest: Rest) -> list[dict]:
    """Confirmed crops with the name they carry, in pages PostgREST will serve."""
    rows: list[dict] = []
    page = 1000
    for offset in range(0, 200_000, page):
        got = rest.get(
            "tank_identity_training_samples?select=sample_id,cluster_key,target_slug,detected_class,room_scope,offset_seconds,crop_path"
            f"&label_status=eq.confirmed&target_slug=not.is.null&order=sample_id&limit={page}&offset={offset}")
        rows += got
        if len(got) < page:
            break
    return rows


def download(rest: Rest, crop_path: str, into: Path) -> np.ndarray | None:
    """Crops live in the private bucket; anything else is a leftover local path."""
    prefix = f"storage://{CROP_BUCKET}/"
    if not crop_path.startswith(prefix):
        return None
    name = crop_path[len(prefix):]
    out = subprocess.run(
        ["curl", "-sS", "-o", str(into), "-w", "%{http_code}",
         f"{STORAGE}/object/{CROP_BUCKET}/{name}",
         "-H", f"apikey: {rest.key}", "-H", f"Authorization: Bearer {rest.key}", "--max-time", "20"],
        capture_output=True, text=True, timeout=40)
    if out.stdout.strip() != "200":
        return None
    img = cv2.imread(str(into), cv2.IMREAD_COLOR)
    return None if img is None else cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def score(query: np.ndarray, gallery: np.ndarray, names: list[str]) -> list[tuple[str, float]]:
    sims = gallery @ query
    by_name: dict[str, list[float]] = collections.defaultdict(list)
    for s, n in zip(sims.tolist(), names):
        by_name[n].append(s)
    return sorted(((n, float(np.mean(sorted(v, reverse=True)[:TOPK]))) for n, v in by_name.items()), key=lambda x: -x[1])


def evaluate(mat: np.ndarray, rows: list[dict], key: str) -> dict:
    """Name each crop from the OTHER rooms (or days) only -- the honest test."""
    hits = total = 0
    margins: list[tuple[float, bool]] = []
    for value in sorted({r[key] for r in rows}):
        test = [i for i, r in enumerate(rows) if r[key] == value]
        train = [i for i, r in enumerate(rows) if r[key] != value]
        train_names = [rows[i]["name"] for i in train]
        if len(set(train_names)) < 2 or not test:
            continue
        g = mat[train]
        for i in test:
            if rows[i]["name"] not in train_names:
                continue
            ranked = score(mat[i], g, train_names)
            ok = ranked[0][0] == rows[i]["name"]
            hits += ok
            total += 1
            margins.append((ranked[0][1] - (ranked[1][1] if len(ranked) > 1 else 0), ok))
    out = {"n": total, "accuracy": round(hits / max(1, total), 3)}
    for cut in (0.03, 0.06, 0.1):
        sel = [ok for m, ok in margins if m >= cut]
        out[f"margin>={cut}"] = {"accuracy": round(sum(sel) / max(1, len(sel)), 3),
                                 "coverage": round(len(sel) / max(1, len(margins)), 3)}
    return out


def write_classifier(mat: np.ndarray, names: list[str]) -> None:
    """Learn what tells the people apart, from every graded crop.

    Matching alone asks "whose crops look most like this body?", and in a shared
    chair the chair, the laptop and the hunch all look alike: Malia at the Game
    Room 2 desk scored Joe .728 / Malia .718. A classifier trained on all the
    graded crops learns which features separate the names and discounts the ones
    they share. The learner adds its probabilities to the match scores (weight
    CLASSIFIER_WEIGHT in live_learner.py). Measured 2026-09-19, held out by
    sighting: 81.6% -> 87.5% right, 32% -> 72% of sightings confidently named,
    confident names right 98.6% -> 97.5%.
    """
    from sklearn.linear_model import LogisticRegression

    if len(set(names)) < 2:
        return
    clf = LogisticRegression(C=0.5, max_iter=3000, class_weight="balanced").fit(mat, names)
    tmp = OUT / "person-classifier.tmp.npz"
    np.savez(tmp, coef=clf.coef_.astype(np.float32), intercept=clf.intercept_.astype(np.float32),
             classes=np.array(clf.classes_))
    tmp.replace(OUT / "person-classifier.npz")
    print(f"  person classifier over {len(clf.classes_)} names", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="stop after this many crops (a quick pass)")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--drop-contradicted", action="store_true",
                    help="leave out groups the audit caught being in two places at once")
    args = ap.parse_args()

    rest = Rest(dry_run=False)
    rows = fetch_rows(rest)
    if args.drop_contradicted:
        audit = json.loads((OUT / "audit.json").read_text(encoding="utf-8"))
        bad = {key for entry in audit.values() for key in entry.get("suspect_groups", [])}
        before = len(rows)
        rows = [r for r in rows if r["cluster_key"] not in bad]
        print(f"dropping {before - len(rows)} crops from {len(bad)} contradicted groups", flush=True)
    if args.limit:
        rows = rows[: args.limit]
    print(f"{len(rows)} confirmed crops to build from", flush=True)

    cache: dict[str, np.ndarray] = {}
    if CACHE.exists() and not args.no_cache:
        try:
            with np.load(CACHE) as data:
                cache = {k: data[k] for k in data.files}
            print(f"  {len(cache)} already embedded", flush=True)
        except Exception as exc:  # noqa: BLE001
            # A cache is only a shortcut: a broken one costs time, never the job.
            print(f"  embedding cache unreadable ({exc}); re-embedding everything", flush=True)
            cache = {}

    device = "cuda" if torch.cuda.is_available() else "cpu"
    embedders = {"person": OsnetAinEmbedder(device=device), "pet": Dinov2PetEmbedder(device)}
    kept: dict[str, list[dict]] = collections.defaultdict(list)
    vectors: dict[str, list[np.ndarray]] = collections.defaultdict(list)
    pending: dict[str, list[tuple[dict, np.ndarray]]] = collections.defaultdict(list)
    missing = 0
    started = time.time()

    def flush(cls: str) -> None:
        batch = pending.pop(cls, [])
        if not batch:
            return
        vs = embedders["person" if cls == "person" else "pet"].embed_rgb([img for _, img in batch])
        for (row, _), vec in zip(batch, vs):
            cache[row["sample_id"]] = vec.astype(np.float32)
            kept[cls].append(row)
            vectors[cls].append(vec.astype(np.float32))

    with tempfile.TemporaryDirectory() as tmp:
        scratch = Path(tmp) / "crop.jpg"
        for index, raw in enumerate(rows):
            cls = raw["detected_class"]
            row = {"sample_id": raw["sample_id"], "name": raw["target_slug"], "cls": cls,
                   "room": raw.get("room_scope") or "unknown", "group": raw["cluster_key"],
                   "day": time.strftime("%Y-%m-%d", time.gmtime(float(raw.get("offset_seconds") or 0)))}
            cached = cache.get(raw["sample_id"])
            if cached is not None:
                kept[cls].append(row)
                vectors[cls].append(cached)
            else:
                img = download(rest, raw.get("crop_path") or "", scratch)
                if img is None:
                    missing += 1
                    continue
                pending[cls].append((row, img))
                if len(pending[cls]) >= BATCH:
                    flush(cls)
            if index % 500 == 499:
                done = sum(len(v) for v in vectors.values())
                print(f"  {index + 1}/{len(rows)}  kept={done} missing={missing} {(time.time() - started):.0f}s", flush=True)
        for cls in list(pending):
            flush(cls)

    # Merge the archive grading, which lives in files rather than the database.
    merged = 0
    for cls in ("person", "cat", "dog"):
        vec_file, meta_file = ARCHIVE / f"{cls}.npy", ARCHIVE / f"{cls}.json"
        if not (vec_file.exists() and meta_file.exists()):
            continue
        rows_a = json.loads(meta_file.read_text(encoding="utf-8"))
        mat_a = np.load(vec_file)
        for row, vec in zip(rows_a, mat_a):
            kept[cls].append({"sample_id": f"archive:{row['stream']}:{row['key']}", "name": row["name"], "cls": cls,
                              "room": row.get("room", "unknown"), "group": row.get("group", "archive"), "day": row.get("day", "archive")})
            vectors[cls].append(vec.astype(np.float32))
            merged += 1
    print(f"merged {merged} archive-graded tracklets", flush=True)

    # Hard negatives ("not-server-rack") are written to their own files. They
    # must never be a name the learner can answer with, but a live crop that
    # looks more like the rack than like any person is not a person at all.
    for cls in list(kept):
        negatives = [i for i, row in enumerate(kept[cls]) if row["name"].startswith("not-")]
        if not negatives:
            continue
        mat = np.stack([vectors[cls][i] for i in negatives])
        mat /= np.maximum(np.linalg.norm(mat, axis=1, keepdims=True), 1e-9)
        np.save(OUT / f"{cls}-negative.npy", mat)
        (OUT / f"{cls}-negative.json").write_text(json.dumps([kept[cls][i] for i in negatives]), encoding="utf-8")
        keep = [i for i in range(len(kept[cls])) if i not in set(negatives)]
        kept[cls] = [kept[cls][i] for i in keep]
        vectors[cls] = [vectors[cls][i] for i in keep]
        print(f"  {len(negatives)} {cls} negatives held out of the gallery", flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    # Written beside the real file and swapped in whole: a kill mid-write (a
    # container restart did exactly this) must leave the old cache, not half of one.
    tmp_cache = CACHE.with_name("cache.tmp.npz")
    np.savez_compressed(tmp_cache, **cache)
    tmp_cache.replace(CACHE)
    report = {"crops": {}, "names": {}, "missing_crops": missing, "archive_merged": merged, "eval": {}}
    for cls, rs in kept.items():
        mat = np.stack(vectors[cls])
        mat /= np.maximum(np.linalg.norm(mat, axis=1, keepdims=True), 1e-9)
        np.save(OUT / f"{cls}.npy", mat)
        (OUT / f"{cls}.json").write_text(json.dumps(rs), encoding="utf-8")
        report["crops"][cls] = len(rs)
        report["names"][cls] = dict(collections.Counter(r["name"] for r in rs))
        report["eval"][cls] = {"leave-one-room-out": evaluate(mat, rs, "room"), "leave-one-day-out": evaluate(mat, rs, "day")}
        if cls == "person":
            write_classifier(mat, [r["name"] for r in rs])

        # The learner never judges one crop: it averages a sighting's crops and
        # names the body. Scoring per crop measures a job nothing does, and made
        # the merged gallery look far worse than it behaves.
        by_group: dict[str, list[int]] = collections.defaultdict(list)
        for i, row in enumerate(rs):
            by_group[row["group"]].append(i)
        g_rows, g_vecs = [], []
        for group, members in by_group.items():
            vec = mat[members].mean(0)
            vec /= max(float(np.linalg.norm(vec)), 1e-9)
            g_rows.append({**rs[members[0]], "group": group})
            g_vecs.append(vec)
        if len(g_rows) > 5:
            g_mat = np.stack(g_vecs)
            report["eval"][cls]["per-sighting"] = {
                "sightings": len(g_rows),
                "leave-one-room-out": evaluate(g_mat, g_rows, "room"),
                "leave-one-day-out": evaluate(g_mat, g_rows, "day"),
            }
    (OUT / "report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    # The director's fast path (the vision worker) reads its own copy.
    from export_worker_gallery import export as export_worker_gallery  # noqa: PLC0415
    print(f"  worker gallery: {export_worker_gallery(OUT)}", flush=True)
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
