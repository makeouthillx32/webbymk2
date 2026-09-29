"""Seed tank_identity_reference_index with OSNet-AIN embeddings of the reviewed crops.

    python tools/seed_reid_gallery.py            # dry run: counts only
    python tools/seed_reid_gallery.py --write    # upsert into Supabase

Rows are keyed by (target_slug, descriptor_kind, model_key, source_sha256), so a
re-run is idempotent. The live colour-histogram worker reads a different table
(tank_appearance_enrolment) and never sees these rows.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT))

from tank_vision.reid import MODEL_KEY, DESCRIPTOR_KIND, OsnetAinEmbedder  # noqa: E402

DATASET = REPO / ".temp/tank-identity-expanded-pass1/dataset-index.json"


def env(name: str) -> str:
    for line in (REPO / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"{name} missing from .env")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    samples = json.loads(DATASET.read_text(encoding="utf-8"))["samples"]
    embedder = OsnetAinEmbedder()
    rows, crops, meta = [], [], []
    for s in samples:
        path = REPO / s["cropPath"].replace("\\", "/")
        data = path.read_bytes()
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        crops.append(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        meta.append((s, hashlib.sha256(data).hexdigest()))
    vectors = embedder.embed_rgb(crops)
    for vec, (s, sha) in zip(vectors, meta):
        rows.append({
            "target_slug": s["targetSlug"],
            "detected_class": s["detectedClass"],
            "descriptor_kind": DESCRIPTOR_KIND,
            "model_key": MODEL_KEY,
            "embedding": [round(float(v), 6) for v in vec],
            "embedding_length": int(vec.shape[0]),
            "source_sha256": sha,
            "status": "active",
        })

    by_member: dict[str, int] = {}
    for r in rows:
        by_member[r["target_slug"]] = by_member.get(r["target_slug"], 0) + 1
    print(f"{len(rows)} embeddings ({rows[0]['embedding_length']}-d) by member: {by_member}")
    if not args.write:
        print("dry run -- pass --write to upsert")
        return

    # Sent with curl, not urllib: this machine's Python CA bundle (certifi
    # 2024.02) predates Let's Encrypt's current chain and rejects a valid
    # db.unenter.live certificate. curl uses the Windows certificate store.
    import subprocess, tempfile  # noqa: E401,PLC0415
    key = env("SERVICE_ROLE_KEY")
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
        json.dump(rows, fh)
        body = fh.name
    result = subprocess.run(
        [
            "curl", "-sS", "-o", "-", "-w", " HTTP %{http_code}",
            "-X", "POST",
            "https://db.unenter.live/rest/v1/tank_identity_reference_index"
            "?on_conflict=target_slug,descriptor_kind,model_key,source_sha256",
            "-H", f"apikey: {key}", "-H", f"Authorization: Bearer {key}",
            "-H", "Content-Type: application/json",
            "-H", "Prefer: resolution=merge-duplicates,return=minimal",
            "--data-binary", f"@{body}",
        ],
        capture_output=True, text=True, timeout=120,
    )
    Path(body).unlink(missing_ok=True)
    print(result.stdout.strip()[-300:] or result.stderr.strip()[-300:])


if __name__ == "__main__":
    with torch.no_grad():
        main()
