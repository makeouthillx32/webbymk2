"""Capture today's appearance for members identified by WHERE THEY SIT, as the operator states.

    .venv/Scripts/python tools/capture_by_seat.py --camera cam-1786768240095 \
        --seat tyler=0.34,0.50 --seat malia=0.53,0.64          # dry run
    ... --write

Built after the worker named Malia "TYLER" and left Tyler unnamed while both sat
in Game Room 2 (2026-09-16). The worker's own names cannot be trusted to label
its own training data, so this ignores them entirely: the operator says who is
in which seat, and each sample needs exactly one person box centred within
--radius of each stated seat, on the same fresh frame. Anyone moving, standing,
or swapping seats makes the sample skip rather than mislabel.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture_member_today import ROOT, cos, env, grab_frame, hsv_signature  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", required=True)
    ap.add_argument("--seat", action="append", required=True, help="slug=cx,cy (normalised box centre)")
    ap.add_argument("--radius", type=float, default=0.10)
    ap.add_argument("--samples", type=int, default=8)
    ap.add_argument("--seconds", type=float, default=120)
    ap.add_argument("--max-cross-similarity", type=float, default=0.92)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    seats = {}
    for spec in args.seat:
        slug, xy = spec.split("=")
        cx, cy = (float(v) for v in xy.split(","))
        seats[slug] = (cx, cy)

    from ultralytics import YOLO

    yolo = YOLO(str(ROOT / "models" / "yolo11m.pt"))
    out_dir = ROOT / "out" / "live-captures" / f"seats-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    out_dir.mkdir(parents=True, exist_ok=True)
    captured: dict[str, list[dict]] = {s: [] for s in seats}
    deadline = time.time() + args.seconds

    while min(len(v) for v in captured.values()) < args.samples and time.time() < deadline:
        frame = grab_frame(args.camera)
        if frame is None:
            print("  skip: no frame")
            time.sleep(1)
            continue
        H, W = frame.shape[:2]
        det = yolo.predict(frame, classes=[0], conf=0.5, imgsz=960, verbose=False)[0]
        boxes = [(float(x1) / W, float(y1) / H, float(x2 - x1) / W, float(y2 - y1) / H) for x1, y1, x2, y2 in det.boxes.xyxy.cpu().numpy()]

        assigned, problem = {}, None
        for slug, (cx, cy) in seats.items():
            near = [b for b in boxes if ((b[0] + b[2] / 2 - cx) ** 2 + (b[1] + b[3] / 2 - cy) ** 2) ** 0.5 <= args.radius]
            if len(near) != 1:
                problem = f"{len(near)} person box(es) at {slug}'s seat"
                break
            assigned[slug] = near[0]
        if problem is None and len({assigned[s] for s in assigned}) != len(assigned):
            problem = "two seats matched the same box"
        if problem:
            print(f"  skip: {problem}")
            time.sleep(2)
            continue

        small = cv2.cvtColor(cv2.resize(frame, (640, 360), interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB)
        sigs = {}
        for slug, (x, y, w, h) in assigned.items():
            sigs[slug] = hsv_signature(small[int(y * 360):int((y + h) * 360), int(x * 640):int((x + w) * 640)])
        if any(v is None for v in sigs.values()):
            print("  skip: a crop was too small")
            continue
        slugs = list(sigs)
        cross = max((cos(sigs[a], sigs[b]) for i, a in enumerate(slugs) for b in slugs[i + 1:]), default=0.0)
        if cross > args.max_cross_similarity:
            print(f"  skip: the two look {cross:.2f} alike in colour -- would blur them")
            time.sleep(2)
            continue
        for slug, box in assigned.items():
            if len(captured[slug]) >= args.samples:
                continue
            x, y, w, h = box
            cv2.imwrite(str(out_dir / f"{slug}{len(captured[slug])}.jpg"), frame[int(y * H):int((y + h) * H), int(x * W):int((x + w) * W)])
            captured[slug].append({"signature": sigs[slug], "box": [round(v, 4) for v in box], "cross": round(cross, 3)})
        print(f"  sample: {', '.join(f'{s}={len(v)}' for s, v in captured.items())}  (cross-similarity {cross:.2f})")
        time.sleep(3)

    print(f"\ncaptured {', '.join(f'{s}: {len(v)}' for s, v in captured.items())}; crops in {out_dir}")
    if not args.write or not any(captured.values()):
        print("dry run -- nothing written" if any(captured.values()) else "nothing captured")
        return

    now = datetime.now(timezone.utc).isoformat()
    rows = [{
        "target_slug": slug, "signature": s["signature"], "signature_length": 40,
        "camera_id": args.camera, "source_confidence": 1.0,
        "note": f"Live capture {now[:10]}: operator stated {slug} was seated at {seats[slug]}.",
        "is_active": True, "captured_at": now, "descriptor_kind": "color-histogram-v1",
        "model_key": "tank-banded-hsv-v1", "source_kind": "live-capture",
        "source_ref": {"method": "operator-stated-seat", "seat": seats[slug], "box": s["box"], "cross_similarity": s["cross"]},
    } for slug, items in captured.items() for s in items]
    key = env("SERVICE_ROLE_KEY")
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
        json.dump(rows, fh)
        body = fh.name
    res = subprocess.run(
        ["curl", "-sS", "-o", "-", "-w", " HTTP %{http_code}", "-X", "POST",
         "https://db.unenter.live/rest/v1/tank_appearance_enrolment",
         "-H", f"apikey: {key}", "-H", f"Authorization: Bearer {key}",
         "-H", "Content-Type: application/json", "-H", "Prefer: return=minimal", "--data-binary", f"@{body}"],
        capture_output=True, text=True, timeout=60,
    )
    Path(body).unlink(missing_ok=True)
    print(f"inserted {len(rows)} rows:", res.stdout.strip()[-200:] or res.stderr.strip()[-200:])


if __name__ == "__main__":
    main()
