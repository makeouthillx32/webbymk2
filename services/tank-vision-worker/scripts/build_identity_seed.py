#!/usr/bin/env python3
"""Build a private, reproducible Tank identity seed and training-crop index.

The supplied reference photos are converted to embeddings and hashes; they are
not copied into the output. Archive crops are exported only from clusters an
operator has explicitly reviewed and associated with a roster slug. This keeps
one weak nearest-neighbour guess from poisoning a future training set.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).resolve().parent))
from archive_profiler import Embedder, MODEL_KEY, cosine  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument(
        "--candidate-manifest",
        type=Path,
        help="Optional larger scan to mine into a quarantined pseudo-label pool.",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--reference",
        action="append",
        default=[],
        metavar="SLUG,CLASS,PATH",
        help="Repeat for each consented roster subject.",
    )
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--yolo", type=Path, default=Path("public/models/yolov8n.onnx"))
    parser.add_argument("--candidate-min-score", type=float, default=0.90)
    parser.add_argument("--candidate-min-margin", type=float, default=0.035)
    return parser.parse_args()


def parse_reference(value: str) -> tuple[str, str, Path]:
    parts = value.split(",", 2)
    if len(parts) != 3:
        raise ValueError(f"Invalid --reference {value!r}; expected SLUG,CLASS,PATH")
    slug, detected_class, raw_path = (part.strip() for part in parts)
    if not slug or detected_class not in {"person", "cat", "dog"}:
        raise ValueError(f"Invalid --reference {value!r}")
    path = Path(raw_path)
    if not path.is_file():
        raise FileNotFoundError(path)
    return slug, detected_class, path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def accepted_review_labels(review: dict[str, object]) -> dict[str, str]:
    accepted: dict[str, str] = {}
    for raw in review.get("decisions", []):
        if not isinstance(raw, dict):
            continue
        decision = raw.get("decision")
        slug = raw.get("suggestedTargetSlug")
        key = raw.get("clusterKey")
        # These decisions were produced by an explicit visual review. Pending,
        # rejected, and anonymous clusters remain excluded from training.
        if decision in {"suggest", "suggest_merge", "reclassify"} and isinstance(slug, str) and isinstance(key, str):
            accepted[key] = slug
    return accepted


def read_frame_crop(source: Path, offset_seconds: float, box: list[object]) -> Image.Image | None:
    if len(box) != 4:
        return None
    video = cv2.VideoCapture(str(source))
    try:
        video.set(cv2.CAP_PROP_POS_MSEC, offset_seconds * 1000)
        ok, frame = video.read()
    finally:
        video.release()
    if not ok or frame is None:
        return None
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = [int(value) for value in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(width, x2), min(height, y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return Image.fromarray(cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2RGB))


def recover_box(
    source: Path,
    offset_seconds: float,
    detected_class: str,
    centroid: np.ndarray,
    detector: YOLO,
    embedder: Embedder,
) -> tuple[list[int], float] | None:
    """Re-identify the exact old crop when a legacy manifest lacks its box."""
    video = cv2.VideoCapture(str(source))
    try:
        video.set(cv2.CAP_PROP_POS_MSEC, offset_seconds * 1000)
        ok, frame = video.read()
    finally:
        video.release()
    if not ok or frame is None:
        return None
    class_ids = {"person": 0, "cat": 15, "dog": 16}
    result = detector.predict(
        frame,
        classes=[class_ids[detected_class]],
        conf=0.40,
        max_det=16,
        verbose=False,
    )[0]
    height, width = frame.shape[:2]
    candidates: list[tuple[list[int], Image.Image]] = []
    for raw_box in result.boxes:
        x1, y1, x2, y2 = [int(value) for value in raw_box.xyxy[0].tolist()]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(width, x2), min(height, y2)
        if x2 <= x1 or y2 <= y1:
            continue
        crop = Image.fromarray(cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2RGB))
        candidates.append(([x1, y1, x2, y2], crop))
    if not candidates:
        return None
    vectors = embedder.encode([crop for _, crop in candidates])
    ranked = sorted(
        ((cosine(vector, centroid), box) for (box, _), vector in zip(candidates, vectors)),
        reverse=True,
    )
    for _, crop in candidates:
        crop.close()
    score, box = ranked[0]
    # Same model, same frame, and same cluster centroid should be substantially
    # closer than a random body. Anything weaker stays out of the labeled set.
    return (box, score) if score >= 0.74 else None


def stable_split(key: str) -> str:
    # Stable across reruns. Roughly 80/20 without leaking adjacent crops across
    # arbitrary random splits controlled by process state.
    return "validation" if int(hashlib.sha256(key.encode()).hexdigest()[:8], 16) % 5 == 0 else "train"


def write_crop(
    output_root: Path,
    bucket: str,
    slug: str,
    source_ref: dict[str, object],
    cluster_key: str,
) -> tuple[str, Path] | None:
    source = Path(str(source_ref["sourcePath"]))
    offset = float(source_ref["offsetSeconds"])
    box = source_ref.get("boxXyxy")
    if not isinstance(box, list):
        return None
    sample_key = f"{source}|{offset:.3f}|{box}|{slug}"
    sample_id = hashlib.sha256(sample_key.encode()).hexdigest()[:20]
    crop = read_frame_crop(source, offset, box)
    if crop is None:
        return None
    sample_dir = output_root / bucket / slug
    sample_dir.mkdir(parents=True, exist_ok=True)
    crop_path = sample_dir / f"{sample_id}.jpg"
    crop.save(crop_path, quality=92)
    crop.close()
    return sample_id, crop_path


def main() -> int:
    args = parse_args()
    references = [parse_reference(value) for value in args.reference]
    if not references:
        raise SystemExit("At least one --reference is required")

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    review = json.loads(args.review.read_text(encoding="utf-8"))
    accepted = accepted_review_labels(review)
    args.output.mkdir(parents=True, exist_ok=True)

    embedder = Embedder(args.device)
    detector: YOLO | None = None
    images = [Image.open(path).convert("RGB") for _, _, path in references]
    vectors = embedder.encode(images)
    for image in images:
        image.close()

    reference_records: list[dict[str, object]] = []
    vectors_by_slug: dict[str, np.ndarray] = {}
    classes_by_slug: dict[str, str] = {}
    for (slug, detected_class, path), vector in zip(references, vectors):
        vectors_by_slug[slug] = vector
        classes_by_slug[slug] = detected_class
        reference_records.append({
            "targetSlug": slug,
            "detectedClass": detected_class,
            "descriptorKind": "reference-image-embedding",
            "modelKey": MODEL_KEY,
            "embeddingLength": int(vector.size),
            "embedding": [round(float(value), 7) for value in vector],
            "sourceSha256": sha256_file(path),
        })

    clusters = {item["clusterKey"]: item for item in manifest.get("clusters", [])}
    proposals: list[dict[str, object]] = []
    for key, cluster in clusters.items():
        centroid = np.asarray(cluster.get("centroid", []), dtype=np.float32)
        if centroid.size == 0:
            continue
        ranked = sorted(
            (
                (cosine(vector, centroid), slug)
                for slug, vector in vectors_by_slug.items()
                if classes_by_slug[slug] == cluster.get("detectedClass")
            ),
            reverse=True,
        )
        if ranked:
            proposals.append({
                "clusterKey": key,
                "candidateSlug": ranked[0][1],
                "score": round(ranked[0][0], 4),
                "margin": round(ranked[0][0] - (ranked[1][0] if len(ranked) > 1 else 0), 4),
                "status": "candidate_only",
            })

    samples: list[dict[str, object]] = []
    anchor_centroids: dict[str, list[np.ndarray]] = {}
    seen = set()
    for cluster_key, slug in accepted.items():
        cluster = clusters.get(cluster_key)
        if not cluster:
            continue
        centroid = np.asarray(cluster.get("centroid", []), dtype=np.float32)
        if centroid.size:
            anchor_centroids.setdefault(slug, []).append(centroid)
        for source_ref in cluster.get("sourceRefs", []):
            if not isinstance(source_ref, dict):
                continue
            source = Path(str(source_ref["sourcePath"]))
            offset = float(source_ref["offsetSeconds"])
            box = source_ref.get("boxXyxy")
            recovery_score: float | None = None
            if box is None:
                detector = detector or YOLO(str(args.yolo), task="detect")
                recovered = recover_box(
                    source,
                    offset,
                    str(cluster["detectedClass"]),
                    centroid,
                    detector,
                    embedder,
                )
                if recovered is None:
                    continue
                box, recovery_score = recovered
            sample_key = f"{source}|{offset:.3f}|{box}|{slug}"
            sample_id = hashlib.sha256(sample_key.encode()).hexdigest()[:20]
            if sample_id in seen:
                continue
            seen.add(sample_id)
            crop = read_frame_crop(source, offset, box)
            if crop is None:
                continue
            sample_dir = args.output / "samples" / slug
            sample_dir.mkdir(parents=True, exist_ok=True)
            crop_path = sample_dir / f"{sample_id}.jpg"
            crop.save(crop_path, quality=92)
            crop.close()
            samples.append({
                "sampleId": sample_id,
                "targetSlug": slug,
                "detectedClass": classes_by_slug.get(slug, cluster.get("detectedClass")),
                "split": stable_split(sample_key),
                "cropPath": str(crop_path),
                "sourcePath": str(source),
                "room": source_ref.get("room"),
                "offsetSeconds": offset,
                "boxXyxy": box,
                "detectorConfidence": source_ref.get("detectorConfidence"),
                "quality": source_ref.get("quality"),
                "labelSource": "operator_reviewed_cluster",
                "clusterKey": cluster_key,
                "provenanceRecoveryScore": round(recovery_score, 4) if recovery_score is not None else None,
            })

    candidates: list[dict[str, object]] = []
    rejected_candidate_counts = {"lowScore": 0, "lowMargin": 0, "noAnchor": 0}
    if args.candidate_manifest:
        candidate_manifest = json.loads(args.candidate_manifest.read_text(encoding="utf-8"))
        for cluster in candidate_manifest.get("clusters", []):
            detected_class = str(cluster.get("detectedClass"))
            centroid = np.asarray(cluster.get("centroid", []), dtype=np.float32)
            ranked: list[tuple[float, str]] = []
            for slug, anchors in anchor_centroids.items():
                if classes_by_slug.get(slug) != detected_class:
                    continue
                ranked.append((max(cosine(centroid, anchor) for anchor in anchors), slug))
            ranked.sort(reverse=True)
            if not ranked:
                rejected_candidate_counts["noAnchor"] += int(cluster.get("sampleCount", 0))
                continue
            best_score, slug = ranked[0]
            runner_up = ranked[1][0] if len(ranked) > 1 else 0.0
            margin = best_score - runner_up
            if best_score < args.candidate_min_score:
                rejected_candidate_counts["lowScore"] += int(cluster.get("sampleCount", 0))
                continue
            if margin < args.candidate_min_margin:
                rejected_candidate_counts["lowMargin"] += int(cluster.get("sampleCount", 0))
                continue
            cluster_key = str(cluster["clusterKey"])
            for source_ref in cluster.get("sourceRefs", []):
                if not isinstance(source_ref, dict):
                    continue
                written = write_crop(args.output, "candidates", slug, source_ref, cluster_key)
                if written is None:
                    continue
                sample_id, crop_path = written
                candidates.append({
                    "sampleId": sample_id,
                    "candidateSlug": slug,
                    "detectedClass": detected_class,
                    "status": "quarantined_auto_label",
                    "cropPath": str(crop_path),
                    "sourcePath": source_ref.get("sourcePath"),
                    "room": source_ref.get("room"),
                    "offsetSeconds": source_ref.get("offsetSeconds"),
                    "boxXyxy": source_ref.get("boxXyxy"),
                    "detectorConfidence": source_ref.get("detectorConfidence"),
                    "quality": source_ref.get("quality"),
                    "clusterKey": cluster_key,
                    "anchorScore": round(best_score, 4),
                    "identityMargin": round(margin, 4),
                })

    generated_at = datetime.now(timezone.utc).isoformat()
    reference_index = {
        "generatedAt": generated_at,
        "privacy": "Private service-only embeddings. Original reference photos were hashed, not copied.",
        "warning": "Reference embeddings and archive/body embeddings are candidates until camera-domain validation passes.",
        "records": reference_records,
    }
    dataset_index = {
        "generatedAt": generated_at,
        "sourceManifest": str(args.manifest),
        "sourceReview": str(args.review),
        "labelPolicy": "Only explicitly reviewed named clusters are exported. Unknown and rejected clusters are excluded.",
        "samples": samples,
        "counts": {
            "total": len(samples),
            "train": sum(item["split"] == "train" for item in samples),
            "validation": sum(item["split"] == "validation" for item in samples),
            "byTarget": {
                slug: sum(item["targetSlug"] == slug for item in samples)
                for slug in sorted(classes_by_slug)
            },
        },
        "unconfirmedSimilarityProposals": proposals,
        "quarantinedCandidates": candidates,
        "candidateCounts": {
            "total": len(candidates),
            "byTarget": {
                slug: sum(item["candidateSlug"] == slug for item in candidates)
                for slug in sorted(classes_by_slug)
            },
            "excluded": rejected_candidate_counts,
            "thresholds": {
                "minimumAnchorScore": args.candidate_min_score,
                "minimumIdentityMargin": args.candidate_min_margin,
            },
        },
    }
    (args.output / "reference-index.json").write_text(json.dumps(reference_index, indent=2), encoding="utf-8")
    (args.output / "dataset-index.json").write_text(json.dumps(dataset_index, indent=2), encoding="utf-8")
    print(f"Wrote {len(reference_records)} private reference embeddings and {len(samples)} reviewed archive crops to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
