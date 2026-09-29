"""Fill tank_identity_vectors: two machine-only views of every graded crop.

    .venv/Scripts/python tools/build_vector_store.py            # embed + upload + evaluate
    .venv/Scripts/python tools/build_vector_store.py --eval-only

View 1, body: the re-identification vector the live learner already uses
(reused from out/gallery/cache.npz -- never recomputed).
View 2, appearance: DINOv2-B (768-d), a general vision model with the opposite
profile -- strong inside one room, weak across rooms -- computed here.

Then the honest question: does a second opinion help? Each crop's sighting is
named from the OTHER rooms (and separately the other days) three ways -- body
only, appearance only, and fused -- and the three are compared. The live
learner should only switch to fused naming if fused wins.

Vectors also land in out/gallery/appearance.npz so the learner can use them
without a database round trip.
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from build_gallery_from_grades import download, fetch_rows  # noqa: E402
from live_learner import MODEL_KEYS, Rest  # noqa: E402

GALLERY = ROOT / "out" / "gallery"
APPEARANCE = GALLERY / "appearance.npz"
APPEARANCE_MODEL = "dinov2-vitb14-v1"
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
TOPK = 5


class AppearanceEmbedder:
    """DINOv2-B CLS embedding, L2-normalised."""

    def __init__(self, device: str) -> None:
        self.device = device
        self.model = torch.hub.load("facebookresearch/dinov2", "dinov2_vitb14", trust_repo=True).eval().to(device)
        if device == "cuda":
            self.model = self.model.half()

    def embed_rgb(self, crops: list[np.ndarray]) -> np.ndarray:
        # People are tall: 224x112 keeps their shape instead of squashing it square.
        batch = np.stack([(cv2.resize(c, (112, 224), interpolation=cv2.INTER_AREA).astype(np.float32) / 255 - _MEAN) / _STD
                          for c in crops]).transpose(0, 3, 1, 2)
        t = torch.from_numpy(batch).to(self.device)
        if self.device == "cuda":
            t = t.half()
        with torch.no_grad():
            out = self.model(t).float().cpu().numpy()
        return out / np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9)


def per_name(sims: np.ndarray, names: list[str]) -> dict[str, float]:
    by: dict[str, list[float]] = collections.defaultdict(list)
    for s, n in zip(sims.tolist(), names):
        by[n].append(s)
    return {n: float(np.mean(sorted(v, reverse=True)[:TOPK])) for n, v in by.items()}


def zscore(scores: dict[str, float]) -> dict[str, float]:
    """Put each view on the same footing before adding: raw cosines differ in scale."""
    vals = np.array(list(scores.values()))
    mu, sd = float(vals.mean()), float(vals.std()) or 1.0
    return {n: (v - mu) / sd for n, v in scores.items()}


def evaluate(body: np.ndarray, app: np.ndarray, rows: list[dict], key: str) -> dict:
    """Per-sighting accuracy for body, appearance and fused, naming from the other rooms/days."""
    groups: dict[str, list[int]] = collections.defaultdict(list)
    for i, r in enumerate(rows):
        groups[r["group"]].append(i)
    g_rows, g_body, g_app = [], [], []
    for members in groups.values():
        b, a = body[members].mean(0), app[members].mean(0)
        g_body.append(b / max(float(np.linalg.norm(b)), 1e-9))
        g_app.append(a / max(float(np.linalg.norm(a)), 1e-9))
        g_rows.append(rows[members[0]])
    B, A = np.stack(g_body), np.stack(g_app)
    hits = collections.Counter()
    total = 0
    for value in sorted({r[key] for r in g_rows}):
        test = [i for i, r in enumerate(g_rows) if r[key] == value]
        train = [i for i, r in enumerate(g_rows) if r[key] != value]
        names = [g_rows[i]["name"] for i in train]
        if len(set(names)) < 2:
            continue
        for i in test:
            if g_rows[i]["name"] not in names:
                continue
            sb = per_name(B[train] @ B[i], names)
            sa = per_name(A[train] @ A[i], names)
            zb, za = zscore(sb), zscore(sa)
            fused = {n: zb[n] + za[n] for n in sb}
            truth = g_rows[i]["name"]
            hits["body"] += max(sb, key=sb.get) == truth
            hits["appearance"] += max(sa, key=sa.get) == truth
            hits["fused"] += max(fused, key=fused.get) == truth
            total += 1
    return {"sightings": total, **{k: round(hits[k] / max(1, total), 3) for k in ("body", "appearance", "fused")}}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--eval-only", action="store_true")
    ap.add_argument("--no-upload", action="store_true")
    args = ap.parse_args()
    rest = Rest(dry_run=False)

    rows = fetch_rows(rest)
    with np.load(GALLERY / "cache.npz") as data:
        body_cache = {k: data[k] for k in data.files}
    app_cache: dict[str, np.ndarray] = {}
    if APPEARANCE.exists():
        with np.load(APPEARANCE) as data:
            app_cache = {k: data[k] for k in data.files}
    todo = [r for r in rows if r["sample_id"] in body_cache and r["sample_id"] not in app_cache
            and not r["target_slug"].startswith("not-")]
    print(f"{len(rows)} confirmed crops; {len(app_cache)} already have an appearance vector; {len(todo)} to embed", flush=True)

    if todo and not args.eval_only:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        embedder = AppearanceEmbedder(device)
        started = time.time()
        with tempfile.TemporaryDirectory() as tmp:
            scratch = Path(tmp) / "crop.jpg"
            batch: list[tuple[str, np.ndarray]] = []

            def flush() -> None:
                if batch:
                    for (sid, _), vec in zip(batch, embedder.embed_rgb([img for _, img in batch])):
                        app_cache[sid] = vec.astype(np.float32)
                    batch.clear()

            for i, row in enumerate(todo):
                img = download(rest, row.get("crop_path") or "", scratch)
                if img is not None:
                    batch.append((row["sample_id"], img))
                if len(batch) >= 64:
                    flush()
                if i % 1000 == 999:
                    tmp_file = GALLERY / "appearance.tmp.npz"
                    np.savez_compressed(tmp_file, **app_cache)
                    tmp_file.replace(APPEARANCE)  # a kill keeps what was done
                    print(f"  {i + 1}/{len(todo)}  {time.time() - started:.0f}s", flush=True)
            flush()
        tmp_file = GALLERY / "appearance.tmp.npz"
        np.savez_compressed(tmp_file, **app_cache)
        tmp_file.replace(APPEARANCE)

    # Upload both views to the store: machine-only, one row per crop.
    if not args.eval_only and not args.no_upload:
        out = []
        for r in rows:
            b, a = body_cache.get(r["sample_id"]), app_cache.get(r["sample_id"])
            if b is None or a is None:
                continue
            body = np.zeros(512, dtype=np.float32)
            body[: len(b)] = b  # pets are 384-d; zero padding keeps cosine unchanged
            out.append({
                "sample_id": r["sample_id"], "target_slug": r["target_slug"], "detected_class": r["detected_class"],
                "cluster_key": r["cluster_key"], "room_scope": r.get("room_scope"),
                "seen_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(float(r.get("offset_seconds") or 0))),
                "body": "[" + ",".join(f"{v:.6f}" for v in body) + "]", "body_model": MODEL_KEYS[r["detected_class"]],
                "appearance": "[" + ",".join(f"{v:.6f}" for v in a) + "]", "appearance_model": APPEARANCE_MODEL,
            })
        for at in range(0, len(out), 200):
            rest.upsert("tank_identity_vectors", out[at:at + 200], "sample_id")
        print(f"uploaded {len(out)} dual-view rows to tank_identity_vectors", flush=True)

    # The question that decides whether the learner switches.
    report = {}
    for cls in ("person", "dog", "cat"):
        rs = [{"sample_id": r["sample_id"], "name": r["target_slug"], "room": r.get("room_scope") or "?",
               "day": time.strftime("%Y-%m-%d", time.gmtime(float(r.get("offset_seconds") or 0))), "group": r["cluster_key"]}
              for r in rows if r["detected_class"] == cls and not r["target_slug"].startswith("not-")
              and r["sample_id"] in body_cache and r["sample_id"] in app_cache]
        if len(rs) < 20:
            continue
        B = np.stack([body_cache[r["sample_id"]] for r in rs])
        A = np.stack([app_cache[r["sample_id"]] for r in rs])
        report[cls] = {"crops": len(rs), "held-out room": evaluate(B, A, rs, "room"), "held-out day": evaluate(B, A, rs, "day")}
    (GALLERY / "dual-view-report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
