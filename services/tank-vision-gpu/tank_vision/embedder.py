"""DINOv2-small crop embeddings, batched, on whatever device is available."""

from __future__ import annotations

import json
import ntpath
from pathlib import Path

import cv2
import numpy as np
import torch

from .identity import Gallery

MODEL_KEY = "dinov2-vits14-v1"
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class Embedder:
    def __init__(self, device: str | None = None) -> None:
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = torch.hub.load("facebookresearch/dinov2", "dinov2_vits14", trust_repo=True)
        self.model.eval().to(self.device)

    def embed_rgb(self, crops: list[np.ndarray]) -> np.ndarray:
        """crops: RGB uint8 arrays. Squashed to 224x224, matching the calibration run."""
        if not crops:
            return np.zeros((0, 384), dtype=np.float32)
        batch = np.stack(
            [
                (cv2.resize(c, (224, 224), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0 - _MEAN) / _STD
                for c in crops
            ]
        ).transpose(0, 3, 1, 2)
        with torch.no_grad():
            out = self.model(torch.from_numpy(batch).to(self.device))
        return out.float().cpu().numpy()


def gallery_from_dataset(
    embedder: Embedder,
    dataset_index: Path,
    repo_root: Path,
    exclude: list[tuple[str, float, float]] | None = None,
) -> tuple[Gallery, int]:
    """Build a gallery from the reviewed crops.

    `exclude` holds (source basename, start_s, end_s) windows. Any crop taken
    inside one is left out, so an evaluation over that footage cannot score
    itself against the very frames it is being tested on.
    """
    data = json.loads(dataset_index.read_text(encoding="utf-8"))
    gallery = Gallery()
    skipped = 0
    crops, meta = [], []
    for s in data["samples"]:
        src = ntpath.basename(s["sourcePath"])
        if any(src == name and start <= s["offsetSeconds"] <= end for name, start, end in exclude or []):
            skipped += 1
            continue
        img = cv2.imread(str(repo_root / Path(s["cropPath"].replace("\\", "/"))))
        if img is None:
            skipped += 1
            continue
        crops.append(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        meta.append((s["detectedClass"], s["targetSlug"]))
    for i in range(0, len(crops), 32):
        for emb, (cls, slug) in zip(embedder.embed_rgb(crops[i : i + 32]), meta[i : i + 32]):
            gallery.add(cls, slug, emb)
    return gallery, skipped
