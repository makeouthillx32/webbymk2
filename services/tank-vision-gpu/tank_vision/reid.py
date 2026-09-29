"""OSNet-AIN person re-identification embeddings.

Chosen by measurement, 2026-09-16, on the reviewed Tank crops with references
restricted to OTHER cameras (tools/reid_bakeoff.py):

    rank-1, people, different room:   colour histogram 30/66   DINOv2 36/66
                                      OSNet 46/66              OSNet-AIN 51/66
    named at score >= 0.70, cross-room: 13 named, 12 right, 1 wrong
    (the live histogram, at any threshold: ~55% of its names wrong)

AIN (adaptive instance normalisation) is the variant trained to generalise to
cameras it never saw, which is the whole problem in a house of fixed cameras.

Weights: kaiyangzhou/osnet on Hugging Face (MIT repository), trained on MSMT17.
MSMT17's own dataset licence is research-only -- check it before this is used
on a monetised stream.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
import torch

MODEL_KEY = "osnet-ain-x1_0-msmt17-v1"
DESCRIPTOR_KIND = "reid-embedding"

_HERE = Path(__file__).resolve().parent
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class OsnetAinEmbedder:
    def __init__(self, weights: Path | None = None, device: str | None = None) -> None:
        sys.path.insert(0, str(_HERE / "third_party"))
        from osnet_ain import osnet_ain_x1_0  # noqa: PLC0415 -- vendored, path set above

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        weights = weights or next((_HERE.parent / "models" / "reid").glob("osnet_ain_x1_0_msmt17*.pth"))
        model = osnet_ain_x1_0(num_classes=1000, pretrained=False, loss="softmax")
        state = torch.load(weights, map_location="cpu")
        state = state.get("state_dict", state)
        state = {
            k.removeprefix("module."): v
            for k, v in state.items()
            if not k.removeprefix("module.").startswith("classifier")
        }
        missing, unexpected = model.load_state_dict(state, strict=False)
        if [k for k in missing if not k.startswith("classifier")] or unexpected:
            raise RuntimeError(f"OSNet-AIN weights did not fit the architecture: {missing[:4]} {unexpected[:4]}")
        self.model = model.eval().to(self.device)
        self.half = self.device == "cuda"
        if self.half:
            self.model = self.model.half()

    def embed_rgb(self, crops: list[np.ndarray]) -> np.ndarray:
        """RGB uint8 crops -> L2-normalised 512-d embeddings. Trained on 256x128 (tall) inputs."""
        if not crops:
            return np.zeros((0, 512), dtype=np.float32)
        batch = np.stack(
            [(cv2.resize(c, (128, 256), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0 - _MEAN) / _STD for c in crops]
        ).transpose(0, 3, 1, 2)
        tensor = torch.from_numpy(batch).to(self.device)
        if self.half:
            tensor = tensor.half()
        with torch.no_grad():
            out = self.model(tensor).float().cpu().numpy()
        return out / np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9)
