"""Check the grading against physics, not against an answer key.

    .venv/Scripts/python tools/audit_labels.py

Nobody can be in two rooms at once, and nobody appears twice in the same frame.
Those two rules need no ground truth, so they measure label quality on data that
has never been checked by anyone -- which is the only kind we have.

Reports, per name:
  crops, groups, rooms, days
  teleports   two crops of one name, seconds apart, in rooms with no shared view
  twins       two crops of one name in the SAME camera at the same moment

A name with many teleports is a name being handed to more than one body.
"""

from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from live_learner import Rest  # noqa: E402

# Rooms that can see each other: a body in both at once is not a contradiction.
OVERLAPPING = {frozenset({"living-room", "kitchen"}), frozenset({"game-room", "game-room-2"})}
SAME_MOMENT_S = 2.0


def fetch(rest: Rest) -> list[dict]:
    rows: list[dict] = []
    page = 1000
    for offset in range(0, 200_000, page):
        got = rest.get(
            "tank_identity_training_samples?select=sample_id,cluster_key,target_slug,detected_class,room_scope,offset_seconds,source_key"
            f"&label_status=eq.confirmed&target_slug=not.is.null&order=sample_id&limit={page}&offset={offset}")
        rows += got
        if len(got) < page:
            break
    return rows


def main() -> None:
    rows = [r for r in fetch(Rest(dry_run=False)) if r.get("offset_seconds")]
    by_name: dict[str, list[dict]] = collections.defaultdict(list)
    for row in rows:
        by_name[row["target_slug"]].append(row)

    report = {}
    for name, items in sorted(by_name.items(), key=lambda kv: -len(kv[1])):
        items.sort(key=lambda r: float(r["offset_seconds"]))
        teleports = twins = 0
        examples: list[str] = []
        suspect: collections.Counter[str] = collections.Counter()
        for i, row in enumerate(items):
            t = float(row["offset_seconds"])
            for other in items[i + 1:]:
                gap = float(other["offset_seconds"]) - t
                if gap > SAME_MOMENT_S:
                    break
                # Crops of ONE sighting are the same body by construction; only
                # two different groups claiming the name at once is evidence.
                if row["cluster_key"] == other["cluster_key"]:
                    continue
                rooms = {row.get("room_scope"), other.get("room_scope")}
                if row.get("source_key") == other.get("source_key"):
                    # Same camera, same second, two crops: one of them is not this name.
                    twins += 1
                    suspect[row["cluster_key"]] += 1
                    suspect[other["cluster_key"]] += 1
                    if len(examples) < 3:
                        examples.append(f"twin in {row.get('room_scope')} at {int(t)}")
                elif None not in rooms and len(rooms) == 2 and frozenset(rooms) not in OVERLAPPING:
                    teleports += 1
                    suspect[row["cluster_key"]] += 1
                    suspect[other["cluster_key"]] += 1
                    if len(examples) < 3:
                        examples.append(f"{' vs '.join(sorted(r or '?' for r in rooms))} at {int(t)}")
        report[name] = {
            "crops": len(items),
            "groups": len({r["cluster_key"] for r in items}),
            "rooms": sorted({r.get("room_scope") or "?" for r in items}),
            "teleports": teleports,
            "twins": twins,
            "examples": examples,
            # Groups that took part in a contradiction: one of each pair carries
            # the wrong name, and which one is unknowable from physics alone.
            "suspect_groups": [k for k, _ in suspect.most_common()],
        }

    (ROOT / "out" / "gallery" / "audit.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(f"{'name':18s} {'crops':>6s} {'groups':>7s} {'teleports':>10s} {'twins':>6s}  rooms")
    for name, r in report.items():
        print(f"{name:18s} {r['crops']:6d} {r['groups']:7d} {r['teleports']:10d} {r['twins']:6d}  {len(r['rooms'])}")
    worst = sorted(report.items(), key=lambda kv: -(kv[1]["teleports"] + kv[1]["twins"]))[:3]
    for name, r in worst:
        if r["examples"]:
            print(f"\n{name}: {r['examples']}")


if __name__ == "__main__":
    main()
