"""Turn the human grades from the Housemate Labels page into the identity gallery.

    .venv/Scripts/python tools/build_gallery.py

Reads out/label-grades/labels/*.json (the page's db, exported with ArtifactData)
and the archive index, writes out/gallery/gallery.npz + gallery.json:
one row per graded tracklet (its mean embedding), its name, class, room, time.

It also reports how well the gallery names a tracklet it has never seen, the
number that decides how much the live learner may trust its own guesses:
  * leave-one-room-out: every tracklet in a room is named from the OTHER rooms
    only, which is the hard case (a new camera angle, different lighting);
  * leave-one-day-out: named from the other days, the realistic case for tomorrow.
"""

from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from cluster_archive import load_tracklets  # noqa: E402

GRADES = ROOT / "out" / "label-grades" / "labels"
REVIEW = ROOT / "out" / "label-review" / "index.html"
OUT = ROOT / "out" / "gallery"  # overridden by --out
TOPK = 5


def manifest() -> dict:
    html = REVIEW.read_text(encoding="utf-8")
    return json.JSONDecoder().raw_decode(html[html.index('{"tile"'):])[0]


def score(query: np.ndarray, gallery: np.ndarray, names: list[str]) -> list[tuple[str, float]]:
    """Mean of the TOPK best matches per name: one lucky look-alike cannot win."""
    sims = gallery @ query
    by_name: dict[str, list[float]] = collections.defaultdict(list)
    for s, n in zip(sims.tolist(), names):
        by_name[n].append(s)
    ranked = [(n, float(np.mean(sorted(v, reverse=True)[:TOPK]))) for n, v in by_name.items()]
    return sorted(ranked, key=lambda x: -x[1])


def main() -> None:
    global OUT
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT), help="where to write the gallery")
    OUT = Path(ap.parse_args().out)

    groups = {g["id"]: g for g in manifest()["groups"]}
    tracklets, matrices = load_tracklets()
    by_ref = {(t["stream"], t["uid"]): t for t in tracklets}
    vec_of = {}
    for cls, (ids, mat) in matrices.items():
        for i, row in zip(ids.tolist(), mat):
            vec_of[i] = row

    rows, skipped = [], collections.Counter()
    for path in sorted(GRADES.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        doc = doc.get("data", doc)
        gid = path.stem
        name = (doc.get("name") or "").strip().lower()
        if gid not in groups or not name or name in {"skip", "unknown", "?"}:
            skipped["group-" + (name or "unnamed")] += 1
            continue
        excluded = set(doc.get("excluded") or [])
        for key, stream, _start in groups[gid]["tiles"]:
            if f"{stream}:{key}" in excluded:
                skipped["excluded-tile"] += 1
                continue
            t = by_ref.get((stream, key))
            if t is None:
                skipped["tile-not-in-index"] += 1
                continue
            rows.append({"name": name, "class": t["class"], "room": t["room"], "stream": stream, "key": key,
                         "day": stream.split("_")[1], "start": t["start"], "end": t["end"], "id": t["id"], "group": gid})

    OUT.mkdir(parents=True, exist_ok=True)
    report = {"skipped": dict(skipped), "per_name": {}, "eval": {}}
    for cls in sorted({r["class"] for r in rows}):
        rs = [r for r in rows if r["class"] == cls]
        mat = np.stack([vec_of[r["id"]] for r in rs]).astype(np.float32)
        np.save(OUT / f"{cls}.npy", mat)
        (OUT / f"{cls}.json").write_text(json.dumps(rs), encoding="utf-8")
        report["per_name"][cls] = dict(collections.Counter(r["name"] for r in rs))

        for split in ("room", "day"):
            hits = total = 0
            confident_hits = confident_total = 0
            margins = []
            for value in sorted({r[split] for r in rs}):
                test = [i for i, r in enumerate(rs) if r[split] == value]
                train = [i for i, r in enumerate(rs) if r[split] != value]
                train_names = [rs[i]["name"] for i in train]
                if len(set(train_names)) < 2:
                    continue
                g = mat[train]
                for i in test:
                    if rs[i]["name"] not in train_names:
                        continue  # nobody to recognise them from
                    ranked = score(mat[i], g, train_names)
                    top, margin = ranked[0][0], ranked[0][1] - (ranked[1][1] if len(ranked) > 1 else 0)
                    ok = top == rs[i]["name"]
                    hits += ok
                    total += 1
                    margins.append((margin, ok))
            # How accurate the guesses are when the learner only trusts a clear winner.
            for cut in (0.0, 0.03, 0.06, 0.1):
                sel = [ok for m, ok in margins if m >= cut]
                report["eval"].setdefault(cls, {}).setdefault(f"leave-one-{split}-out", {})[f"margin>={cut}"] = {
                    "accuracy": round(sum(sel) / max(1, len(sel)), 3), "coverage": round(len(sel) / max(1, len(margins)), 3), "n": len(sel)}
    (OUT / "report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
