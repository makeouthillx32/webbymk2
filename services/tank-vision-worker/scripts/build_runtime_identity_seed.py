#!/usr/bin/env python3
"""Compile labeled photos and reviewed CCTV crops into Tank's live 40-value descriptor.

The output contains vectors and source hashes only. Raw reference photos stay
outside the repository. This is deliberately the same banded HSV descriptor
used by `buildAppearanceSignature()` in the TypeScript worker, so generated
records can be consumed immediately instead of becoming an incompatible
offline index.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import uuid
from pathlib import Path

import numpy as np
from PIL import Image
from ultralytics import YOLO

BANDS = 4
HUE_BINS = 6
VALUE_BINS = 4
SIGNATURE_LENGTH = BANDS * (HUE_BINS + VALUE_BINS)
CLASS_IDS = {"person": 0, "cat": 15, "dog": 16}
SEED_NAMESPACE = uuid.UUID("88683611-ee68-4e58-999d-3914f91d4f73")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--yolo", type=Path, default=Path("public/models/yolov8n.onnx"))
    parser.add_argument(
        "--reference",
        action="append",
        default=[],
        metavar="SLUG,CLASS,PATH",
        help="Repeat for every user-labeled household reference image.",
    )
    return parser.parse_args()


def parse_reference(raw: str) -> tuple[str, str, Path]:
    parts = raw.split(",", 2)
    if len(parts) != 3:
        raise ValueError(f"Invalid reference {raw!r}")
    slug, detected_class, path = parts[0].strip(), parts[1].strip(), Path(parts[2].strip())
    if not slug or detected_class not in CLASS_IDS or not path.is_file():
        raise ValueError(f"Invalid reference {raw!r}")
    return slug, detected_class, path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def crop_reference(image: Image.Image, detected_class: str, detector: YOLO) -> Image.Image:
    """Use the supplied class label to choose the largest matching YOLO box."""
    result = detector.predict(
        np.asarray(image.convert("RGB")),
        classes=[CLASS_IDS[detected_class]],
        conf=0.20,
        max_det=8,
        verbose=False,
    )[0]
    boxes = []
    for raw_box in result.boxes:
        x1, y1, x2, y2 = [int(value) for value in raw_box.xyxy[0].tolist()]
        area = max(0, x2 - x1) * max(0, y2 - y1)
        boxes.append((area, (x1, y1, x2, y2)))
    if not boxes:
        # These are explicitly user-labeled subject photos. Falling back to the
        # image is better than silently omitting an entire resident, and the
        # Staff Room marks the source as a reference rather than CCTV-confirmed.
        return image.copy()
    _, (x1, y1, x2, y2) = max(boxes)
    return image.crop((max(0, x1), max(0, y1), min(image.width, x2), min(image.height, y2)))


def rgb_to_hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    values = rgb.astype(np.float32) / 255.0
    red, green, blue = values[..., 0], values[..., 1], values[..., 2]
    maximum = values.max(axis=2)
    minimum = values.min(axis=2)
    delta = maximum - minimum
    hue = np.zeros_like(maximum)
    active = delta > 0
    red_max = active & (maximum == red)
    green_max = active & (maximum == green)
    blue_max = active & (maximum == blue)
    hue[red_max] = np.mod((green[red_max] - blue[red_max]) / delta[red_max], 6.0)
    hue[green_max] = (blue[green_max] - red[green_max]) / delta[green_max] + 2.0
    hue[blue_max] = (red[blue_max] - green[blue_max]) / delta[blue_max] + 4.0
    hue = np.mod(hue / 6.0, 1.0)
    saturation = np.divide(delta, maximum, out=np.zeros_like(delta), where=maximum > 0)
    return hue, saturation, maximum


def appearance_signature(image: Image.Image) -> list[float]:
    rgb = np.asarray(image.convert("RGB"))
    height = rgb.shape[0]
    signature = np.zeros(SIGNATURE_LENGTH, dtype=np.float64)
    for band in range(BANDS):
        y0 = int(np.floor(band * height / BANDS))
        y1 = int(np.floor((band + 1) * height / BANDS)) if band < BANDS - 1 else height
        pixels = rgb[y0:y1]
        if pixels.size == 0:
            continue
        hue, saturation, value = rgb_to_hsv(pixels)
        count = float(hue.size)
        offset = band * (HUE_BINS + VALUE_BINS)
        colorful = saturation > 0.2
        if np.any(colorful):
            bins = np.minimum(HUE_BINS - 1, np.floor(hue[colorful] * HUE_BINS).astype(int))
            signature[offset : offset + HUE_BINS] = np.bincount(bins, minlength=HUE_BINS) / count
        value_bins = np.minimum(VALUE_BINS - 1, np.floor(value * VALUE_BINS).astype(int))
        signature[offset + HUE_BINS : offset + HUE_BINS + VALUE_BINS] = (
            np.bincount(value_bins.ravel(), minlength=VALUE_BINS) / count
        )
    return [round(float(value), 8) for value in signature]


def record(slug: str, detected_class: str, source_kind: str, source_key: str, image: Image.Image) -> dict[str, object]:
    stable_key = f"{slug}|{detected_class}|{source_kind}|{source_key}"
    return {
        "id": str(uuid.uuid5(SEED_NAMESPACE, stable_key)),
        "targetSlug": slug,
        "detectedClass": detected_class,
        "signature": appearance_signature(image),
        "sourceKind": source_kind,
        "sourceKey": source_key,
    }


def main() -> int:
    args = parse_args()
    references = [parse_reference(raw) for raw in args.reference]
    detector = YOLO(str(args.yolo), task="detect")
    records: list[dict[str, object]] = []

    for slug, detected_class, path in references:
        with Image.open(path) as source:
            crop = crop_reference(source, detected_class, detector)
            records.append(record(slug, detected_class, "reference-image", sha256_file(path), crop))
            crop.close()

    dataset = json.loads(args.dataset.read_text(encoding="utf-8"))
    for sample in dataset.get("samples", []):
        path = Path(str(sample["cropPath"]))
        if not path.is_file():
            raise FileNotFoundError(path)
        with Image.open(path) as crop:
            records.append(
                record(
                    str(sample["targetSlug"]),
                    str(sample["detectedClass"]),
                    "archive-reviewed",
                    str(sample["sampleId"]),
                    crop,
                )
            )

    payload = json.dumps(records, separators=(",", ":"))
    target_counts: dict[str, int] = {}
    for item in records:
        slug = str(item["targetSlug"])
        target_counts[slug] = target_counts.get(slug, 0) + 1
    output = (
        "// Generated by scripts/build_runtime_identity_seed.py. Raw photos are not bundled.\n"
        "// Every vector uses the exact 40-value descriptor consumed by the live worker.\n"
        "export type RuntimeIdentitySeed = {\n"
        "  id: string; targetSlug: string; detectedClass: \"person\" | \"cat\" | \"dog\";\n"
        "  signature: readonly number[]; sourceKind: \"reference-image\" | \"archive-reviewed\"; sourceKey: string;\n"
        "};\n\n"
        f"export const RUNTIME_IDENTITY_SEEDS: readonly RuntimeIdentitySeed[] = {payload};\n"
        f"export const RUNTIME_IDENTITY_SEED_COUNTS = {json.dumps(target_counts, separators=(',', ':'))} as const;\n"
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(output, encoding="utf-8")
    print(f"Wrote {len(records)} runtime-compatible signatures: {target_counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
