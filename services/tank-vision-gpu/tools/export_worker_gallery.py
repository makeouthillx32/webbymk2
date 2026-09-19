"""Export the graded PERSON gallery for the vision worker (the director's fast path).

    python tools/export_worker_gallery.py

The vision worker (services/tank-vision-worker) names people with the same
OSNet-AIN model the gallery was built with, exported to ONNX. It cannot read
.npy/.npz, so this writes plain files next to the gallery:

  worker-person.f32          N x 512 float32, row-major, L2-normalised crops
  worker-person-negative.f32 M x 512 float32: things that are NOT people (rack, jacket)
  worker-person.json         names per row, the classifier, and the counts

Written atomically (tmp + rename) so the worker, which reloads on change, never
reads half a file. build_gallery_from_grades.py calls this after every rebuild.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
GALLERY = ROOT / "out" / "gallery"


def _write(path: Path, data: bytes) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def export(gallery: Path = GALLERY) -> dict:
    mat = np.load(gallery / "person.npy").astype(np.float32)
    rows = json.loads((gallery / "person.json").read_text(encoding="utf-8"))
    names = [r["name"] for r in rows]
    if len(names) != len(mat):
        raise ValueError(f"person.json has {len(names)} rows but person.npy has {len(mat)}")
    negative = np.zeros((0, mat.shape[1]), dtype=np.float32)
    if (gallery / "person-negative.npy").exists():
        negative = np.load(gallery / "person-negative.npy").astype(np.float32)
    classifier = None
    if (gallery / "person-classifier.npz").exists():
        with np.load(gallery / "person-classifier.npz") as data:
            classifier = {
                "classes": [str(c) for c in data["classes"]],
                "coef": np.round(data["coef"].astype(np.float32), 6).tolist(),
                "intercept": np.round(data["intercept"].astype(np.float32), 6).tolist(),
            }
    meta = {
        "version": 1,
        "dims": int(mat.shape[1]),
        "rows": int(len(mat)),
        "negativeRows": int(len(negative)),
        "names": names,
        "classifier": classifier,
        "model": "osnet_ain_x1_0_msmt17 (256x128, ImageNet mean/std, L2)",
    }
    # Binary files first, JSON last: the worker keys its reload on the JSON, so it
    # never pairs new names with an old matrix.
    _write(gallery / "worker-person.f32", np.ascontiguousarray(mat).tobytes())
    _write(gallery / "worker-person-negative.f32", np.ascontiguousarray(negative).tobytes())
    _write(gallery / "worker-person.json", json.dumps(meta).encode("utf-8"))
    return {"rows": meta["rows"], "negatives": meta["negativeRows"], "names": sorted(set(names))}


if __name__ == "__main__":
    print(json.dumps(export()))
