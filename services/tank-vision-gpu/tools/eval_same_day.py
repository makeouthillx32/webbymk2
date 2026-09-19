"""Does remembering TODAY help? Measured on the graded data before it goes live.

    .venv/Scripts/python tools/eval_same_day.py

For each graded person sighting, name it three ways from every OTHER sighting:
  all days   : the gallery as the learner uses it today
  same day   : only sightings from the same calendar day (clothes do not change)
  blended    : per name, the better of the two after scaling same-day evidence
               by a weight -- the learner's candidate rule
A sighting is only scored same-day if its person has another sighting that day,
which is the live situation the tier is for: someone already seen once today.
"""

from __future__ import annotations

import collections
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from build_gallery_from_grades import fetch_rows  # noqa: E402
from live_learner import Rest  # noqa: E402

TOPK = 5


def per_name(sims: np.ndarray, names: list[str]) -> dict[str, float]:
    by: dict[str, list[float]] = collections.defaultdict(list)
    for s, n in zip(sims.tolist(), names):
        by[n].append(s)
    return {n: float(np.mean(sorted(v, reverse=True)[:TOPK])) for n, v in by.items()}


def main() -> None:
    rows = [r for r in fetch_rows(Rest(dry_run=False)) if r["detected_class"] == "person" and not r["target_slug"].startswith("not-")]
    with np.load(ROOT / "out" / "gallery" / "cache.npz") as data:
        cache = {k: data[k] for k in data.files}
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        if r["sample_id"] in cache and r.get("offset_seconds"):
            groups[r["cluster_key"]].append(r)
    keys, names, days, vecs = [], [], [], []
    for key, members in groups.items():
        v = np.mean([cache[m["sample_id"]] for m in members], axis=0)
        vecs.append(v / max(float(np.linalg.norm(v)), 1e-9))
        keys.append(key)
        names.append(collections.Counter(m["target_slug"] for m in members).most_common(1)[0][0])
        # Local calendar day, the way a person means "today".
        days.append(time.strftime("%Y-%m-%d", time.localtime(float(members[0]["offset_seconds"]))))
    mat = np.stack(vecs)
    results: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    total = 0
    for i in range(len(keys)):
        same_day = [j for j in range(len(keys)) if j != i and days[j] == days[i]]
        if not any(names[j] == names[i] for j in same_day):
            continue  # nobody has seen this person today yet: the tier cannot apply
        others = [j for j in range(len(keys)) if j != i]
        general = per_name(mat[others] @ mat[i], [names[j] for j in others])
        today = per_name(mat[same_day] @ mat[i], [names[j] for j in same_day])
        total += 1
        results["all days"][max(general, key=general.get) == names[i]] += 1
        results["same day"][max(today, key=today.get) == names[i]] += 1
        for w in (0.0, 0.02, 0.04, 0.06):
            blended = {n: max(general.get(n, -1), today.get(n, -1) + w) for n in set(general) | set(today)}
            results[f"blend +{w}"][max(blended, key=blended.get) == names[i]] += 1
    report = {k: round(v[True] / max(1, total), 3) for k, v in results.items()}
    report["sightings"] = total
    (ROOT / "out" / "gallery" / "same-day-report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
