"""Tune label propagation and unknown grouping against a check that needs no labels.

    .venv/Scripts/python tools/tune_labels.py

THE TELEPORT CHECK
One body cannot be in two rooms at once. Two tracklets carrying the same name,
overlapping in time by more than a second, on cameras that do not view the same
space, prove that at least one of those names is wrong. Every tracklet carries
absolute time, so this can be counted over the whole archive -- unlike
cross-validation, which only ever checks the few dozen reviewed crops and cannot
see labels drifting through thousands of unanchored tracklets.

Found necessary 2026-09-16: the first full run scored 1.00 k-fold precision, yet
its "joe" Living Room sheet visibly held two different people and its largest
unknown group mixed many.
"""

from __future__ import annotations

import argparse
import itertools
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT))

import cluster_archive as ca  # noqa: E402

# Cameras that genuinely see the same space: a person may appear in both at once.
OVERLAPPING = {frozenset({"living-room", "kitchen"}), frozenset({"game-room", "game-room-2"})}


def teleports(tracklets, tids) -> tuple[int, int]:
    """(violating pairs, tracklets involved) among tracklets sharing one identity."""
    items = sorted((tracklets[t] for t in tids), key=lambda t: t["start"])
    bad_pairs, involved = 0, set()
    active: list[dict] = []
    for t in items:
        active = [a for a in active if a["end"] > t["start"] + 1.0]
        for a in active:
            # Different rooms that share a view may legitimately hold one body.
            # The SAME camera holding two bodies at once under one name never can.
            if a["room"] != t["room"] and frozenset({a["room"], t["room"]}) in OVERLAPPING:
                continue
            if min(a["end"], t["end"]) - max(a["start"], t["start"]) > 1.0:
                bad_pairs += 1
                involved.update({a["id"], t["id"]})
        active.append(t)
    return bad_pairs, len(involved)


def score_labels(tracklets, labels):
    by_member: dict[str, list[int]] = {}
    for tid, (slug, *_rest) in labels.items():
        by_member.setdefault(slug, []).append(tid)
    report = {}
    for slug, tids in sorted(by_member.items()):
        pairs, involved = teleports(tracklets, tids)
        report[slug] = {"tracklets": len(tids), "teleport_pairs": pairs, "impure_share": round(involved / len(tids), 3)}
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "out" / "archive-labels" / "tuning.json"))
    args = ap.parse_args()

    from tank_vision.background import make_polite
    make_polite()

    tracklets, matrices = ca.load_tracklets()
    anchors, _ = ca.load_anchors(tracklets)
    chain_of = ca.stitch(tracklets, matrices)
    seeds = {a["tracklet"]: a["slug"] for a in anchors}
    results = []

    print("PROPAGATION  score margin topk | named  teleport-pairs  worst-member-impurity | camera-CV precision")
    for min_score, margin, topk in itertools.product((0.72, 0.78, 0.84), (0.06, 0.10), (3,)):
        params = argparse.Namespace(min_score=min_score, min_margin=margin, topk=topk, rounds=12, round_share=0.25)
        labels = ca.propagate(tracklets, matrices, chain_of, seeds, params)
        members = score_labels(tracklets, labels)
        pairs = sum(m["teleport_pairs"] for m in members.values())
        worst = max((m["impure_share"] for m in members.values()), default=0.0)
        cv = ca.evaluate(tracklets, matrices, chain_of, anchors, params, mode="camera")
        row = {"min_score": min_score, "min_margin": margin, "topk": topk, "named": len(labels),
               "teleport_pairs": pairs, "worst_impurity": worst, "camera_cv": {k: cv[k] for k in ("precision", "named", "wrong")},
               "members": members}
        results.append(row)
        print(f"             {min_score:.2f}  {margin:.2f}   {topk}  | {len(labels):5d}  {pairs:7d}         {worst:.3f}              | "
              f"{cv['precision']} ({cv['wrong']} wrong of {cv['named']})", flush=True)

    print("\nUNKNOWN GROUPS  distance | groups  tracklets-grouped  impure-groups  impure-tracklet-share")
    best = min((r for r in results if r["teleport_pairs"] == 0 and (r["camera_cv"]["wrong"] or 0) == 0),
               key=lambda r: -r["named"], default=None)
    base_params = argparse.Namespace(**{k: best[k] for k in ("min_score", "min_margin", "topk")}, rounds=12, round_share=0.25) if best else None
    labels = ca.propagate(tracklets, matrices, chain_of, seeds, base_params) if base_params else {}
    group_rows = []
    for distance in (0.20, 0.30, 0.40):
        groups = ca.group_unknowns(tracklets, matrices, chain_of, labels, distance=distance)
        key_to_id = {(t["stream"], t["uid"]): t["id"] for t in tracklets}
        impure = 0
        impure_tracklets = 0
        total = 0
        for g in groups:
            tids = [key_to_id[(t["stream"], t["key"])] for t in g["tracklets"]]
            total += len(tids)
            pairs, involved = teleports(tracklets, tids)
            if pairs:
                impure += 1
                impure_tracklets += involved
        row = {"distance": distance, "groups": len(groups), "grouped": total, "impure_groups": impure,
               "impure_share": round(impure_tracklets / max(1, total), 3)}
        group_rows.append(row)
        print(f"                 {distance:.2f}   | {len(groups):5d}  {total:8d}          {impure:5d}          {row['impure_share']:.3f}", flush=True)

    Path(args.out).write_text(json.dumps({"propagation": results, "best_propagation": best, "unknown_groups": group_rows}, indent=2), encoding="utf-8")
    print(f"\nbest propagation with zero teleports and zero cross-room CV errors: "
          f"{ {k: best[k] for k in ('min_score', 'min_margin', 'topk', 'named')} if best else None}")


if __name__ == "__main__":
    main()
