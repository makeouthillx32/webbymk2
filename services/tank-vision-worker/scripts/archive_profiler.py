#!/usr/bin/env python3
"""Mine recurring anonymous person/pet profiles from Tank archive footage.

This tool intentionally discovers clusters before names. Footage can show that
the same-looking subject recurs, but it cannot truthfully infer which roster
name belongs to an unlabeled cluster. Confirmed clusters can later become
enrolment anchors; pending clusters must stay anonymous on the public overlay.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw
from torchvision.models import ResNet18_Weights, resnet18
from ultralytics import YOLO

MODEL_KEY = "resnet18-imagenet-v1-clustering"
CLASS_IDS = [0, 15, 16]  # person, cat, dog in COCO
CLASS_THRESHOLDS = {"person": 0.84, "cat": 0.80, "dog": 0.80}


@dataclass
class Sample:
    detected_class: str
    embedding: np.ndarray
    crop: Image.Image
    source_path: str
    room: str
    offset_seconds: float
    box_xyxy: tuple[int, int, int, int]
    confidence: float
    quality: float


@dataclass
class Cluster:
    detected_class: str
    centroid: np.ndarray
    samples: list[Sample] = field(default_factory=list)
    best: Sample | None = None

    def add(self, sample: Sample) -> None:
        count = len(self.samples)
        self.samples.append(sample)
        centroid = (self.centroid * count + sample.embedding) / (count + 1)
        self.centroid = centroid / max(float(np.linalg.norm(centroid)), 1e-12)
        if self.best is None or sample.quality > self.best.quality:
            self.best = sample


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive-root", type=Path, default=Path(os.environ.get("TANK_ARCHIVE_SCAN_ROOT", r"V:\tank-archive\daily")))
    parser.add_argument("--output", type=Path, default=Path(".temp/tank-identity-profiles"))
    parser.add_argument("--yolo", type=Path, default=Path("public/models/yolov8n.onnx"))
    parser.add_argument("--sample-seconds", type=float, default=45.0)
    parser.add_argument("--max-videos", type=int, default=0)
    parser.add_argument("--max-frames-per-video", type=int, default=0)
    parser.add_argument("--confidence", type=float, default=0.50)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--recursive", action="store_true", help="Scan MP4 files below nested segment directories.")
    parser.add_argument("--room-label", help="Override room inference for a camera-specific segment directory.")
    return parser.parse_args()


def room_from_path(path: Path) -> str:
    name = path.stem
    if name.startswith("s01_"):
        name = name[4:]
    return name.rsplit("_", 1)[0].replace("_", "-")


def unit(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    return vector / max(norm, 1e-12)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


class Embedder:
    def __init__(self, device: str) -> None:
        weights = ResNet18_Weights.DEFAULT
        model = resnet18(weights=weights)
        model.fc = torch.nn.Identity()
        self.model = model.eval().to(device)
        self.transform = weights.transforms()
        self.device = device

    def encode(self, crops: list[Image.Image]) -> list[np.ndarray]:
        if not crops:
            return []
        batch = torch.stack([self.transform(c.convert("RGB")) for c in crops]).to(self.device)
        with torch.inference_mode():
            vectors = self.model(batch).cpu().numpy()
        return [unit(v.astype(np.float32)) for v in vectors]


def iter_frames(path: Path, every_seconds: float, max_frames: int) -> Iterable[tuple[float, np.ndarray]]:
    video = cv2.VideoCapture(str(path))
    if not video.isOpened():
        return
    fps = float(video.get(cv2.CAP_PROP_FPS) or 0)
    frames = float(video.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frames / fps if fps > 0 else 0
    # Archive segments are usually shorter than the sampling interval. Sampling
    # their midpoint avoids decoder warm-up/black frames at exactly t=0 while
    # preserving the old periodic behavior for consolidated daily recordings.
    offset = min(every_seconds / 2, duration / 2) if duration > 0 else 0.0
    emitted = 0
    try:
        while offset <= duration:
            if max_frames and emitted >= max_frames:
                break
            video.set(cv2.CAP_PROP_POS_MSEC, offset * 1000)
            ok, frame = video.read()
            if ok and frame is not None:
                yield offset, frame
                emitted += 1
            offset += every_seconds
    finally:
        video.release()


def collect_samples(path: Path, detector: YOLO, embedder: Embedder, args: argparse.Namespace) -> tuple[list[Sample], int]:
    pending: list[tuple[str, Image.Image, float, tuple[int, int, int, int], float, float]] = []
    sampled = 0
    room = args.room_label or room_from_path(path)
    for offset, frame in iter_frames(path, args.sample_seconds, args.max_frames_per_video):
        sampled += 1
        result = detector.predict(frame, classes=CLASS_IDS, conf=args.confidence, max_det=12, verbose=False)[0]
        height, width = frame.shape[:2]
        for box in result.boxes:
            cls = result.names[int(box.cls.item())]
            confidence = float(box.conf.item())
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(width, x2), min(height, y2)
            bw, bh = x2 - x1, y2 - y1
            min_pixels = 48 * 96 if cls == "person" else 32 * 32
            if bw <= 0 or bh <= 0 or bw * bh < min_pixels:
                continue
            # Edge-clipped and tiny subjects make bad identity anchors.
            clipped = int(x1 == 0) + int(y1 == 0) + int(x2 == width) + int(y2 == height)
            area_ratio = (bw * bh) / max(width * height, 1)
            quality = confidence * min(1.0, area_ratio / 0.08) * (0.72 if clipped else 1.0)
            if quality < 0.18:
                continue
            crop = Image.fromarray(cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2RGB))
            pending.append((cls, crop, offset, (x1, y1, x2, y2), confidence, quality))

    vectors = embedder.encode([item[1] for item in pending])
    samples = [
        Sample(cls, vector, crop, str(path), room, offset, box_xyxy, confidence, quality)
        for (cls, crop, offset, box_xyxy, confidence, quality), vector in zip(pending, vectors)
    ]
    return samples, sampled


def cluster_samples(samples: list[Sample]) -> list[Cluster]:
    clusters: list[Cluster] = []
    # Highest-quality anchors first makes online clustering deterministic and
    # prevents a distant smudge from becoming the initial centroid.
    for sample in sorted(samples, key=lambda s: (-s.quality, s.source_path, s.offset_seconds)):
        same_class = [c for c in clusters if c.detected_class == sample.detected_class]
        ranked = sorted(((cosine(sample.embedding, c.centroid), c) for c in same_class), key=lambda item: item[0], reverse=True)
        if ranked and ranked[0][0] >= CLASS_THRESHOLDS[sample.detected_class]:
            ranked[0][1].add(sample)
        else:
            cluster = Cluster(sample.detected_class, sample.embedding.copy())
            cluster.add(sample)
            clusters.append(cluster)
    return clusters


def cluster_key(cluster: Cluster) -> str:
    digest = hashlib.sha256(cluster.centroid.tobytes()).hexdigest()[:16]
    return f"{cluster.detected_class}-{digest}"


def make_contact_sheet(cluster: Cluster, path: Path) -> None:
    samples = sorted(cluster.samples, key=lambda s: s.quality, reverse=True)[:12]
    thumb_w, thumb_h = 180, 240
    sheet = Image.new("RGB", (thumb_w * 4, thumb_h * math.ceil(len(samples) / 4)), "#0b0d10")
    draw = ImageDraw.Draw(sheet)
    for index, sample in enumerate(samples):
        image = sample.crop.copy()
        image.thumbnail((thumb_w - 8, thumb_h - 34))
        x = (index % 4) * thumb_w + (thumb_w - image.width) // 2
        y = (index // 4) * thumb_h + 4
        sheet.paste(image, (x, y))
        draw.text((index % 4 * thumb_w + 6, y + image.height + 4), f"{sample.room} {sample.offset_seconds:.0f}s", fill="white")
    sheet.save(path, quality=88)


def main() -> int:
    args = parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    candidates = args.archive_root.rglob("*.mp4") if args.recursive else args.archive_root.glob("*.mp4")
    videos = sorted(p for p in candidates if ".tmp" not in p.name)
    if args.max_videos:
        videos = videos[: args.max_videos]
    if not videos:
        raise SystemExit(f"No archive videos found under {args.archive_root}")

    detector = YOLO(str(args.yolo), task="detect")
    embedder = Embedder(args.device)
    all_samples: list[Sample] = []
    sources: list[dict[str, object]] = []
    for path in videos:
        samples, sampled = collect_samples(path, detector, embedder, args)
        all_samples.extend(samples)
        sources.append({"path": str(path), "sampledFrames": sampled, "acceptedCrops": len(samples)})
        print(f"{path.name}: {sampled} frames, {len(samples)} accepted crops", flush=True)

    clusters = cluster_samples(all_samples)
    manifest_clusters: list[dict[str, object]] = []
    for cluster in sorted(clusters, key=lambda c: (c.detected_class, -len(c.samples), cluster_key(c))):
        key = cluster_key(cluster)
        sheet = args.output / f"{key}.jpg"
        make_contact_sheet(cluster, sheet)
        refs = [
            {
                "sourcePath": sample.source_path,
                "room": sample.room,
                "offsetSeconds": round(sample.offset_seconds, 3),
                "boxXyxy": list(sample.box_xyxy),
                "detectorConfidence": round(sample.confidence, 4),
                "quality": round(sample.quality, 4),
            }
            for sample in sorted(cluster.samples, key=lambda s: s.quality, reverse=True)[:32]
        ]
        manifest_clusters.append({
            "clusterKey": key,
            "detectedClass": cluster.detected_class,
            "status": "pending",
            "assignedTargetSlug": None,
            "suggestedTargetSlug": None,
            "sampleCount": len(cluster.samples),
            "modelKey": MODEL_KEY,
            "embeddingLength": int(cluster.centroid.size),
            "centroid": [round(float(v), 7) for v in cluster.centroid],
            "representativeCropPath": str(sheet),
            "sourceRefs": refs,
        })

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelKey": MODEL_KEY,
        "warning": "Anonymous visual clusters only. A name requires an existing trusted anchor or operator correction.",
        "sources": sources,
        "clusters": manifest_clusters,
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(clusters)} clusters from {len(all_samples)} crops to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
