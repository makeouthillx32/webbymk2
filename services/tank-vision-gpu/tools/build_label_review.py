"""Build the Archive Label Review page: one sprite per group plus the page itself.

    .venv/Scripts/python tools/build_label_review.py

Reads out/archive-labels/{labels,unknown-groups}.json and the rebuilt thumbnails,
writes out/label-review/{index.html, sprites/*.jpg}. Every crop in a group is
shown (not a sample), because a wrong tile the reviewer cannot see cannot be
excluded.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
LABELS = ROOT / "out" / "archive-labels"
THUMBS = ROOT / "out" / "archive-thumbs"
OUT = ROOT / "out" / "label-review"
TILE_W, TILE_H, COLS = 64, 128, 20
MEMBER_ORDER = ["malia", "tyler", "joe", "molly", "olly", "james", "kitty"]


def sprite(group_id: str, tiles: list[dict]) -> list[dict]:
    """Pack every readable crop into one sprite; return the tiles that made it in."""
    kept, images = [], []
    for t in tiles:
        img = cv2.imread(str(THUMBS / t["stream"] / f"{t['key']}.jpg"))
        if img is None:
            continue
        images.append(cv2.resize(img, (TILE_W, TILE_H), interpolation=cv2.INTER_AREA))
        kept.append(t)
    if not images:
        return []
    rows = math.ceil(len(images) / COLS)
    sheet = np.full((rows * TILE_H, COLS * TILE_W, 3), 18, dtype=np.uint8)
    for i, img in enumerate(images):
        r, c = divmod(i, COLS)
        sheet[r * TILE_H:(r + 1) * TILE_H, c * TILE_W:(c + 1) * TILE_W] = img
    (OUT / "sprites").mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(OUT / "sprites" / f"{group_id}.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 78])
    return kept


def main() -> None:
    labels = json.loads((LABELS / "labels.json").read_text(encoding="utf-8"))["labels"]
    unknown = json.loads((LABELS / "unknown-groups.json").read_text(encoding="utf-8"))["groups"]

    groups = []
    by_member_room: dict[tuple[str, str], list[dict]] = {}
    for l in labels:
        by_member_room.setdefault((l["slug"], l["room"]), []).append(l)
    for (slug, room), items in sorted(
        by_member_room.items(),
        key=lambda kv: (MEMBER_ORDER.index(kv[0][0]) if kv[0][0] in MEMBER_ORDER else 99, -len(kv[1])),
    ):
        items.sort(key=lambda t: t["start"])
        gid = f"member-{slug}-{room}"
        kept = sprite(gid, items)
        if kept:
            groups.append({"id": gid, "kind": "member", "class": items[0]["class"], "suggested": slug, "rooms": [room],
                           "seconds": round(sum(t["end"] - t["start"] for t in kept)),
                           "tiles": [[t["key"], t["stream"], round(t["start"])] for t in kept]})

    for g in unknown:
        items = sorted(g["tracklets"], key=lambda t: t["start"])
        kept = sprite(g["group"], items)
        if kept:
            groups.append({"id": g["group"], "kind": "unknown", "class": g["class"], "suggested": None, "rooms": g["rooms"],
                           "seconds": g["seconds"], "tiles": [[t["key"], t["stream"], round(t["start"])] for t in kept]})

    manifest = {"tile": [TILE_W, TILE_H], "cols": COLS, "groups": groups}
    template = (ROOT / "tools" / "label_review_template.html").read_text(encoding="utf-8")
    html = template.replace("__MANIFEST__", json.dumps(manifest, separators=(",", ":")))
    (OUT / "index.html").write_text(html, encoding="utf-8")
    size = sum(p.stat().st_size for p in (OUT / "sprites").glob("*.jpg"))
    print(f"{len(groups)} groups, {sum(len(g['tiles']) for g in groups)} tiles, sprites {size / 1e6:.1f} MB, "
          f"page {len(html) / 1e3:.0f} KB, largest sprite {max(p.stat().st_size for p in (OUT / 'sprites').glob('*.jpg')) / 1e6:.2f} MB")


if __name__ == "__main__":
    sys.exit(main())
