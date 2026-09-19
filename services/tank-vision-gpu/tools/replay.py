"""Run the full pipeline over archive footage and render what it saw.

    python tools/replay.py --video V:/tank-archive/daily/s01_kitchen_2026-09-13.mp4 \
        --start 13620 --duration 300 --follow tyler

Outputs (in --out):
  boxes.mp4    every tracked box, labelled with its committed name or class
  follow.mp4   the virtual camera following --follow, as the programme would
  summary.json per-track names over time, static tracks, throughput

Gallery crops taken from the SAME video within --exclude-margin seconds of the
window are left out, so the footage is never recognised using its own frames.
"""

from __future__ import annotations

import argparse
import json
import ntpath
import sys
import time
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tank_vision.embedder import MODEL_KEY, Embedder, gallery_from_dataset  # noqa: E402
from tank_vision.framing import FollowCamera, crop_to_ptz  # noqa: E402
from tank_vision.identity import Resolution, exclusive_names  # noqa: E402
from tank_vision.tracks import CameraTracks  # noqa: E402

REPO = ROOT.parents[1]
COCO = {0: "person", 15: "cat", 16: "dog"}
COLOURS = {
    "tyler": (60, 180, 255), "malia": (200, 90, 255), "joe": (80, 220, 120),
    "molly": (0, 200, 255), "olly": (255, 170, 60), "james": (255, 100, 100), "kitty": (180, 255, 255),
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--video", required=True)
    p.add_argument("--start", type=float, required=True)
    p.add_argument("--duration", type=float, default=300)
    p.add_argument("--fps", type=float, default=5.0)
    p.add_argument("--follow", default="tyler")
    p.add_argument("--yolo", default=str(ROOT / "models" / "yolo11m.pt"))
    p.add_argument("--imgsz", type=int, default=960)
    p.add_argument("--dataset", default=str(REPO / ".temp/tank-identity-expanded-pass1/dataset-index.json"))
    p.add_argument("--exclude-margin", type=float, default=300)
    p.add_argument("--out", default=str(ROOT / "out" / "replay"))
    return p.parse_args()


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    from ultralytics import YOLO

    t0 = time.time()
    embedder = Embedder()
    source = ntpath.basename(args.video)
    window = (source, args.start - args.exclude_margin, args.start + args.duration + args.exclude_margin)
    gallery, skipped = gallery_from_dataset(embedder, Path(args.dataset), REPO, exclude=[window])
    print(f"gallery {gallery.counts()}  (excluded {skipped} crops near the test window)")

    detector = YOLO(args.yolo)
    cap = cv2.VideoCapture(args.video)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
    cap.set(cv2.CAP_PROP_POS_MSEC, args.start * 1000)
    step = max(1, round(src_fps / args.fps))
    out_fps = src_fps / step
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    boxes_writer = cv2.VideoWriter(str(out / "boxes.mp4"), fourcc, out_fps, (W, H))
    follow_writer = cv2.VideoWriter(str(out / "follow.mp4"), fourcc, out_fps, (W, H))

    cams = CameraTracks()
    follow = FollowCamera()
    timeline: dict[int, dict] = {}
    frames = 0
    follow_frames_with_target = 0
    total_frames = int(args.duration * src_fps)
    infer_s = 0.0
    last_t = None

    for index in range(total_frames):
        ok = cap.grab()
        if not ok:
            break
        if index % step:
            continue
        ok, frame = cap.retrieve()
        if not ok:
            break
        now = args.start + index / src_fps
        dt = 0.0 if last_t is None else now - last_t
        last_t = now

        t1 = time.time()
        result = detector.track(
            frame, persist=True, tracker="bytetrack.yaml", classes=list(COCO), conf=0.30,
            imgsz=args.imgsz, verbose=False,
        )[0]
        live_ids: list[int] = []
        crops, crop_tracks = [], []
        if result.boxes is not None and result.boxes.id is not None:
            for (x1, y1, x2, y2), tid, cls, conf in zip(
                result.boxes.xyxy.cpu().numpy(), result.boxes.id.int().cpu().tolist(),
                result.boxes.cls.int().cpu().tolist(), result.boxes.conf.cpu().tolist(),
            ):
                box = (float(x1) / W, float(y1) / H, float(x2 - x1) / W, float(y2 - y1) / H)
                track = cams.observe(now, tid, COCO[cls], box, conf)
                live_ids.append(tid)
                if cams.wants_sample(track, now, W, H):
                    crop = frame[int(y1):int(y2), int(x1):int(x2)]
                    if crop.size:
                        crops.append(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
                        crop_tracks.append(track)
        for emb, track in zip(embedder.embed_rgb(crops), crop_tracks):
            track.identity.add(gallery.rank(track.detected_class, emb))
            track.last_sample_t = now
        infer_s += time.time() - t1

        claims: list[tuple[int, Resolution]] = []
        for tid in live_ids:
            tr = cams.tracks[tid]
            claims.append((tid, tr.identity.resolve(static=tr.is_static(now, cams.policy))))
        names = exclusive_names(claims)
        by_id = dict(claims)

        target_box = None
        for tid in live_ids:
            tr = cams.tracks[tid]
            tr.name = names[tid]
            res = by_id[tid]
            static = tr.is_static(now, cams.policy)
            entry = timeline.setdefault(tid, {"class": tr.detected_class, "first": now, "last": now, "names": {}, "static": False})
            entry["last"] = now
            entry["static"] = entry["static"] or static
            if tr.name:
                entry["names"][tr.name] = entry["names"].get(tr.name, 0) + 1
            if res.candidate:
                entry["last_candidate"] = f"{res.candidate} mean={res.confidence:.3f} margin={res.margin:.3f} n={res.samples}"
            entry["last_box"] = [round(float(v), 3) for v in tr.box]
            if tr.name == args.follow:
                target_box = tr.box

            x, y, w, h = tr.box
            colour = COLOURS.get(tr.name or "", (140, 140, 140))
            if static and not tr.name:
                colour = (60, 60, 60)
            p1, p2 = (int(x * W), int(y * H)), (int((x + w) * W), int((y + h) * H))
            cv2.rectangle(frame, p1, p2, colour, 2)
            label = (
                f"{tr.name.upper()} {res.confidence:.2f}" if tr.name
                else f"{tr.detected_class}{' static' if static else ''} ({res.samples})"
            )
            cv2.putText(frame, f"#{tid} {label}", (p1[0], max(14, p1[1] - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 2)
        cams.forget_stale(now)

        crop = follow.update(now, dt, target_box)
        if target_box is not None:
            follow_frames_with_target += 1
        cx, cy, cw, ch = crop.rect()
        view = frame[int(cy * H):int((cy + ch) * H), int(cx * W):int((cx + cw) * W)]
        follow_frame = cv2.resize(view, (W, H), interpolation=cv2.INTER_LINEAR)
        tag = f"FOLLOW {args.follow.upper()}  {'LOCKED' if target_box else 'searching'}  x{crop.zoom:.2f}"
        cv2.putText(follow_frame, tag, (16, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        stamp = time.strftime("%H:%M:%S", time.gmtime(now))
        cv2.putText(frame, f"{source} {stamp}", (16, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        boxes_writer.write(frame)
        follow_writer.write(follow_frame)
        frames += 1
        if frames % 100 == 0:
            print(f"  {frames} frames  {infer_s / frames * 1000:.0f} ms/frame  last ptz {crop_to_ptz(crop)}")

    cap.release()
    boxes_writer.release()
    follow_writer.release()

    tracks = [
        {"track": tid, **v, "first": round(v["first"], 1), "last": round(v["last"], 1)}
        for tid, v in sorted(timeline.items())
    ]
    summary = {
        "video": source, "start": args.start, "duration": args.duration, "fps": out_fps,
        "model": {"detector": Path(args.yolo).name, "identity": MODEL_KEY, "imgsz": args.imgsz},
        "frames": frames, "ms_per_frame_cpu": round(infer_s / max(1, frames) * 1000),
        "follow": args.follow, "follow_locked_frames": follow_frames_with_target,
        "gallery": gallery.counts(), "excluded_gallery_crops": skipped,
        "tracks_named": {t["track"]: t["names"] for t in tracks if t["names"]},
        "static_tracks": [t["track"] for t in tracks if t["static"]],
        "tracks": tracks, "wall_s": round(time.time() - t0),
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("frames", "ms_per_frame_cpu", "follow_locked_frames", "tracks_named", "static_tracks", "wall_s")}, indent=2))


if __name__ == "__main__":
    main()
