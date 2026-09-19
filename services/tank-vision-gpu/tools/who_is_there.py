"""Grab one frame per camera right now and show exactly how the gallery names each body.

    .venv/Scripts/python tools/who_is_there.py cam-1786768240090 cam-1786768240095

For "why did it call me a guest": the top three names, their scores, and the
margin the learner needs (CONFIDENT_MARGIN) before it tells the director a name.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from index_archive import CAMERA_ROOMS  # noqa: E402
from live_learner import CONFIDENT_MARGIN, Gallery, Rest  # noqa: E402
from tank_vision.reid import OsnetAinEmbedder  # noqa: E402


def grab(camera: str) -> np.ndarray | None:
    out = subprocess.run(
        ["docker", "exec", "unt_mediamtx", "ffmpeg", "-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp",
         "-i", f"rtsp://127.0.0.1:8554/cameras/{camera}-hls-low", "-frames:v", "1", "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"],
        capture_output=True, timeout=30)
    if not out.stdout:
        return None
    return cv2.imdecode(np.frombuffer(out.stdout, np.uint8), cv2.IMREAD_COLOR)


def main() -> None:
    from ultralytics import YOLO

    cameras = sys.argv[1:] or list(CAMERA_ROOMS)
    gallery = Gallery(Rest(dry_run=True))
    gallery.refresh()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    embedder = OsnetAinEmbedder(device=device)
    detector = YOLO(str(ROOT / "models" / "yolo11m.pt"))
    print(f"gallery: { {c: len(n) for c, (_, n) in gallery.base.items()} } | confident margin needed: {CONFIDENT_MARGIN}")
    for camera in cameras:
        frame = grab(camera)
        if frame is None:
            print(f"{camera}: no frame")
            continue
        res = detector(frame, classes=[0], conf=0.35, imgsz=960, verbose=False)[0]
        boxes = res.boxes.xyxy.cpu().numpy().astype(int) if res.boxes is not None else []
        room = CAMERA_ROOMS.get(camera, camera)
        if not len(boxes):
            print(f"{room}: nobody detected")
            continue
        for x1, y1, x2, y2 in boxes:
            crop = cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2RGB)
            vec = embedder.embed_rgb([crop])[0]
            name, score, margin, ranked = gallery.name("person", vec)
            verdict = "NAMED" if margin >= CONFIDENT_MARGIN else "not confident -> unnamed box"
            print(f"{room}: box {x2 - x1}x{y2 - y1}px  top={ranked}  margin={margin:+.3f}  => {verdict}")
            cv2.imwrite(str(ROOT / "out" / "live" / f"who-{room}-{x1}.jpg"), cv2.cvtColor(crop, cv2.COLOR_RGB2BGR))


if __name__ == "__main__":
    main()
