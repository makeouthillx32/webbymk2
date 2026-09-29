"""Rebuild one representative thumbnail per tracklet, under a unique name.

    .venv/Scripts/python tools/rebuild_thumbs.py

The first index named thumbnails gen-tid, which the tracker reuses, so 619 of
4,094 thumbnails were overwritten by a different sighting and contact sheets
showed the wrong body. The index kept every tracklet's boxes with absolute
times, so the correct crop can be cut again from the footage without
re-running detection: the largest box of each tracklet, from the segment that
was recording at that moment.
"""

from __future__ import annotations

import bisect
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from index_archive import segment_start_epoch  # noqa: E402

INDEX = ROOT / "out" / "archive-index"
THUMBS = ROOT / "out" / "archive-thumbs"
SEGMENTS = Path("V:/tank-archive/segments")


def uid_of(t: dict) -> str:
    return t["key"] if t["key"].count("-") >= 2 else f'{t["key"]}-{int(t["start"] * 1000)}'


def rebuild_stream(meta_path: str) -> tuple[str, int, int]:
    cv2.setNumThreads(1)
    meta_path = Path(meta_path)
    stream = meta_path.stem
    camera, day = stream.rsplit("_", 1)
    files = sorted((SEGMENTS / camera / day).glob("*.mp4"), key=segment_start_epoch)
    starts = [segment_start_epoch(f) for f in files]
    out = THUMBS / stream
    out.mkdir(parents=True, exist_ok=True)

    jobs: dict[int, list[tuple[float, tuple, str]]] = {}
    tracklets = json.loads(meta_path.read_text(encoding="utf-8"))["tracklets"]
    for t in tracklets:
        uid = uid_of(t)
        if (out / f"{uid}.jpg").exists():
            continue
        best = max(t["boxes"], key=lambda b: (b[3] - b[1]) * (b[4] - b[2]))
        seg = bisect.bisect_right(starts, best[0]) - 1
        if seg < 0:
            continue
        jobs.setdefault(seg, []).append((best[0], tuple(best[1:5]), uid))

    written = 0
    for seg, items in jobs.items():
        cap = cv2.VideoCapture(str(files[seg]))
        for at, (x1, y1, x2, y2), uid in sorted(items):
            cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, (at - starts[seg]) * 1000))
            ok, frame = cap.read()
            if not ok:
                continue
            crop = frame[max(0, y1):y2, max(0, x1):x2]
            if crop.size:
                cv2.imwrite(str(out / f"{uid}.jpg"), crop)
                written += 1
        cap.release()
    return stream, len(tracklets), written


def main() -> None:
    sys.path.insert(0, str(ROOT))
    from tank_vision.background import make_polite
    make_polite()
    metas = sorted(str(p) for p in INDEX.glob("*.json"))
    with ProcessPoolExecutor(max_workers=6) as pool:
        for stream, total, written in pool.map(rebuild_stream, metas):
            print(f"{stream}: {written} thumbnails written ({total} tracklets)", flush=True)


if __name__ == "__main__":
    main()
