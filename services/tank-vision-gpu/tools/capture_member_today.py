"""Capture a member's appearance TODAY from a live camera, for the live colour-histogram worker.

    .venv/Scripts/python tools/capture_member_today.py --member malia --camera cam-1786768240095 \
        --anchor tyler                 # dry run: shows samples, writes nothing
    ... --write                        # insert into tank_appearance_enrolment

WHY: the live worker names people by clothing colour. A member reviewed in one
outfit is invisible in the next one -- Malia's samples were all from 2026-09-13,
so on 2026-09-16 she read as an unknown PERSON while sitting next to Tyler.

HOW THE BOX IS CHOSEN (never by looks): the operator states who is in the room.
The worker already names the ANCHOR member there; the one remaining unnamed
person box is the member being captured. Every sample requires, at that moment:
  * exactly one box the worker names ANCHOR, and exactly one unnamed person box,
  * both matched (IoU) to an independent YOLO detection on the same live frame.
A third person in the room, or a mismatch, skips the sample.

The signature is computed on the frame exactly as the worker sees it: the
1280x720 low rung scaled to 640x360.
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

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
MEDIA = "https://media.tank.unenter.live"


def env(name: str) -> str:
    for line in (REPO / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"{name} missing from .env")


def curl_json(url: str, headers: dict[str, str]) -> dict:
    args = ["curl", "-sS", "-m", "10", url]
    for k, v in headers.items():
        args += ["-H", f"{k}: {v}"]
    return json.loads(subprocess.run(args, capture_output=True, text=True, timeout=15).stdout)


def hsv_signature(rgb: np.ndarray) -> list[float] | None:
    """Port of buildAppearanceSignature (src/zones/tank/vision/appearance.ts)."""
    B, HB, VB = 4, 6, 4
    h, w, _ = rgb.shape
    if w <= 0 or h < B or w * h < 24 * 48:
        return None
    x = rgb.astype(np.float32) / 255.0
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    mx, mn = x.max(-1), x.min(-1)
    d = mx - mn
    hue = np.zeros_like(mx)
    m = d > 0
    rm = m & (mx == r); gm = m & (mx == g) & ~rm; bm = m & ~rm & ~gm
    hue[rm] = np.mod((g[rm] - b[rm]) / d[rm], 6)
    hue[gm] = (b[gm] - r[gm]) / d[gm] + 2
    hue[bm] = (r[bm] - g[bm]) / d[bm] + 4
    hue /= 6
    sat = np.where(mx == 0, 0, d / np.where(mx == 0, 1, mx))
    sig = np.zeros(B * (HB + VB), dtype=np.float64)
    band = np.minimum(B - 1, np.floor(np.arange(h) / (h / B)).astype(int))
    for i in range(B):
        rows = band == i
        if not rows.any():
            continue
        off = i * (HB + VB)
        hb = np.minimum(HB - 1, np.floor(hue[rows] * HB).astype(int))[sat[rows] > 0.2]
        vb = np.minimum(VB - 1, np.floor(mx[rows] * VB).astype(int)).ravel()
        cnt = rows.sum() * w
        sig[off:off + HB] = np.bincount(hb.ravel(), minlength=HB)[:HB] / cnt
        sig[off + HB:off + HB + VB] = np.bincount(vb, minlength=VB)[:VB] / cnt
    return [round(float(v), 6) for v in sig]


def grab_frame(camera: str) -> np.ndarray | None:
    """One fresh frame from MediaMTX's internal RTSP, the same low rung the worker reads."""
    # The low rung first; the source path, scaled to 1280x720, if the low rung is mid-restart.
    for path, scale in ((f"cameras/{camera}-hls-low", []), (f"cameras/{camera}", ["-vf", "scale=1280:720"])):
        res = subprocess.run(
            ["docker", "exec", "unt_mediamtx", "ffmpeg", "-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp",
             "-i", f"rtsp://127.0.0.1:8554/{path}", *scale, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
            capture_output=True, timeout=30,
        )
        if res.returncode == 0 and res.stdout:
            return cv2.imdecode(np.frombuffer(res.stdout, np.uint8), cv2.IMREAD_COLOR)
    return None


def cos(a, b) -> float:
    a, b = np.asarray(a), np.asarray(b)
    return float(a @ b / max(1e-9, np.linalg.norm(a) * np.linalg.norm(b)))


def iou(a, b) -> float:
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    ix = max(0.0, min(ax2, bx2) - max(a[0], b[0])); iy = max(0.0, min(ay2, by2) - max(a[1], b[1]))
    inter = ix * iy
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--member", required=True)
    ap.add_argument("--anchor", required=True, help="member the worker already names in the same room")
    ap.add_argument("--camera", required=True)
    ap.add_argument("--samples", type=int, default=8)
    ap.add_argument("--seconds", type=float, default=90)
    ap.add_argument("--max-anchor-similarity", type=float, default=0.90)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    from ultralytics import YOLO

    secret = env("TANK_ARCHIVE_INGEST_SECRET")
    yolo = YOLO(str(ROOT / "models" / "yolo11m.pt"))
    out_dir = ROOT / "out" / "live-captures" / f"{args.member}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    out_dir.mkdir(parents=True, exist_ok=True)

    samples, last_at, deadline = [], 0.0, time.time() + args.seconds
    while len(samples) < args.samples and time.time() < deadline:
        if time.time() - last_at < 3:
            time.sleep(0.5)
            continue
        diag = curl_json(f"https://tank.unenter.live/api/tank/director/diagnostics?cb={time.time()}", {"x-tank-ingest-secret": secret})
        cam = next((c for c in diag.get("cameras", []) if c["id"] == args.camera), None)
        boxes = [b for b in (cam or {}).get("boxes", []) if b["label"] == "person"]
        anchors = [b for b in boxes if (b["name"] or "").lower() == args.anchor.lower()]
        unnamed = [b for b in boxes if not b["name"]]
        if len(anchors) != 1 or len(unnamed) != 1 or len(boxes) != 2:
            print(f"  skip: worker sees {len(boxes)} person box(es), {len(anchors)} {args.anchor}, {len(unnamed)} unnamed")
            time.sleep(2)
            continue
        frame = grab_frame(args.camera)
        if frame is None:
            print("  skip: could not grab a frame")
            continue

        H, W = frame.shape[:2]
        det = yolo.predict(frame, classes=[0], conf=0.4, imgsz=960, verbose=False)[0]
        mine = [(float(x1) / W, float(y1) / H, float(x2 - x1) / W, float(y2 - y1) / H) for x1, y1, x2, y2 in det.boxes.xyxy.cpu().numpy()]
        match = lambda wb: max(mine, key=lambda m: iou(m, wb["box"]), default=None)
        target_box, anchor_box = match(unnamed[0]), match(anchors[0])
        if target_box is None or anchor_box is None or target_box == anchor_box or iou(target_box, unnamed[0]["box"]) < 0.3 or iou(anchor_box, anchors[0]["box"]) < 0.3:
            print("  skip: worker boxes do not line up with the live frame (someone moved)")
            continue

        small = cv2.cvtColor(cv2.resize(frame, (640, 360), interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB)
        def crop_sig(bx):
            x, y, w, h = bx
            return hsv_signature(small[int(y * 360):int((y + h) * 360), int(x * 640):int((x + w) * 640)])
        sig, anchor_sig = crop_sig(target_box), crop_sig(anchor_box)
        if sig is None or anchor_sig is None:
            print("  skip: crop too small")
            continue
        similarity = cos(sig, anchor_sig)
        if similarity > args.max_anchor_similarity:
            print(f"  skip: {args.member}'s colours are {similarity:.2f} similar to {args.anchor}'s -- would blur the two")
            continue
        x, y, w, h = target_box
        cv2.imwrite(str(out_dir / f"sample{len(samples)}.jpg"), frame[int(y * H):int((y + h) * H), int(x * W):int((x + w) * W)])
        samples.append({"signature": sig, "box": [round(v, 4) for v in target_box], "anchor_similarity": round(similarity, 3)})
        last_at = time.time()
        print(f"  sample {len(samples)}: box={samples[-1]['box']} similarity-to-{args.anchor}={similarity:.2f}")

    print(f"\n{len(samples)} samples; crops in {out_dir}")
    if not samples or not args.write:
        print("dry run -- nothing written" if samples else "no samples captured")
        return

    now = datetime.now(timezone.utc).isoformat()
    rows = [{
        "target_slug": args.member, "signature": s["signature"], "signature_length": 40,
        "camera_id": args.camera, "room_scope": None, "source_confidence": 1.0,
        "note": f"Live capture {now[:10]}: operator stated {args.member} was the unnamed person beside {args.anchor}.",
        "is_active": True, "captured_at": now, "descriptor_kind": "color-histogram-v1",
        "model_key": "tank-banded-hsv-v1", "source_kind": "live-capture",
        "source_ref": {"method": "operator-stated-exclusion", "anchor": args.anchor, "box": s["box"], "anchor_similarity": s["anchor_similarity"]},
    } for s in samples]
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
    print("insert:", res.stdout.strip()[-200:] or res.stderr.strip()[-200:])


if __name__ == "__main__":
    sys.exit(main())
