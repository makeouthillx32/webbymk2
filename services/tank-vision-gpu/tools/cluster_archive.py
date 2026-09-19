"""Attach archive tracklets to the house's identities, and measure how well.

    .venv/Scripts/python tools/cluster_archive.py                # label + evaluate + sheets
    .venv/Scripts/python tools/cluster_archive.py --eval-only    # cross-validation numbers only

Inputs:  out/archive-index/*.json|npz   (tools/index_archive.py)
         the reviewed crops in dataset-index.json (the only human labels)
Outputs: out/archive-labels/labels.json         label, score, margin, round per tracklet
         out/archive-labels/report.json         cross-validated precision and coverage
         out/archive-labels/sheets/<member>/<room>.jpg   contact sheets to eyeball

HOW A NAME SPREADS
  1. Anchors. Each reviewed crop is matched to the tracklet it was cut from:
     same camera, a tracklet live at that moment, overlapping box. Exact
     provenance, not similarity.
  2. Stitching. The same camera re-finding a body within a few seconds, close
     to where the previous track ended, is the same body. Stitched chains share
     one label; this undoes tracker fragmentation.
  3. Propagation, in rounds. An unlabelled chain takes member M only when its
     similarity to M's labelled chains clears --min-score AND beats every other
     member by --min-margin. Each round only accepts the most confident
     candidates, so early mistakes are rare rather than compounding.
  4. Exclusion. Two chains live at the same moment on the same camera are two
     bodies; they can never share a name. The weaker claim is dropped.

HOW IT IS SCORED
  K-fold over the anchors: hide one fold, propagate from the rest, and check
  the hidden anchors' labels. Precision = right / named. That number, not a
  feeling, decides whether these labels are allowed near the live system.
"""

from __future__ import annotations

import argparse
import json
import ntpath
import random
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from index_archive import CAMERA_ROOMS, segment_start_epoch  # noqa: E402

INDEX = ROOT / "out" / "archive-index"
THUMBS = ROOT / "out" / "archive-thumbs"  # rebuilt with unique names; see tools/rebuild_thumbs.py
OUT = ROOT / "out" / "archive-labels"
DATASET = REPO / ".temp/tank-identity-expanded-pass1/dataset-index.json"
SEGMENTS = Path("V:/tank-archive/segments")
ROOM_CAMERAS = {room: cam for cam, room in CAMERA_ROOMS.items()}
PERSON_CLASSES = {"person"}

# Cameras that view the same space: one body may appear in both at once.
OVERLAPPING_ROOMS = {frozenset({"living-room", "kitchen"}), frozenset({"game-room", "game-room-2"})}


def same_body_impossible(a: dict, b: dict, slack: float = 1.0) -> bool:
    """Two sightings that cannot both be one body: live at the same moment,
    either on the same camera (two bodies in one frame) or in two rooms that do
    not share a view (nobody is in two places at once)."""
    if min(a["end"], b["end"]) - max(a["start"], b["start"]) <= slack:
        return False
    if a["camera"] == b["camera"]:
        return True
    return frozenset({a["room"], b["room"]}) not in OVERLAPPING_ROOMS


def spans_compatible(xs: list[dict], ys: list[dict]) -> bool:
    """No sighting in xs is impossible alongside any in ys. Both sorted by start."""
    j0 = 0
    for x in xs:
        while j0 < len(ys) and ys[j0]["end"] < x["start"] - 1.0:
            j0 += 1
        for y in ys[j0:]:
            if y["start"] > x["end"]:
                break
            if same_body_impossible(x, y):
                return False
    return True


# ── loading ─────────────────────────────────────────────────────────────────
def load_tracklets():
    tracklets, embs = [], {}
    for meta_path in sorted(INDEX.glob("*.json")):
        data = json.loads(meta_path.read_text(encoding="utf-8"))
        arrays = np.load(meta_path.with_suffix(".npz"))
        for t in data["tracklets"]:
            cls = t["class"]
            t["stream"] = meta_path.stem
            t["id"] = len(tracklets)
            # Older indexes named tracklets gen-tid, which the tracker reuses;
            # the start time makes the name unique (see index_archive.py).
            t["uid"] = t["key"] if t["key"].count("-") >= 2 else f'{t["key"]}-{int(t["start"] * 1000)}'
            vec = arrays[f"{cls}_track_emb"][t["row"]].astype(np.float32)
            embs.setdefault(cls, []).append((t["id"], vec))
            tracklets.append(t)
    matrices = {}
    for cls, rows in embs.items():
        ids = np.array([i for i, _ in rows])
        mat = np.stack([v for _, v in rows])
        mat /= np.maximum(np.linalg.norm(mat, axis=1, keepdims=True), 1e-9)
        matrices[cls] = (ids, mat)
    return tracklets, matrices


# ── anchors: reviewed crop -> the tracklet it came from ────────────────────
def segment_durations(camera: str, day: str) -> list[tuple[float, float]]:
    """(start_epoch, duration_s) per segment, in the order the daily concat used."""
    cache = OUT / "cache" / f"durations_{camera}_{day}.json"
    if cache.exists():
        return [tuple(x) for x in json.loads(cache.read_text())]
    concat = Path(f"V:/tank-archive/daily/concat_{camera}_{day}.txt")
    names = [ntpath.basename(re.search(r"'(.+)'", line).group(1)) for line in concat.read_text().splitlines() if line.strip()]
    out = []
    for name in names:
        path = SEGMENTS / camera / day / name
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True,
        )
        try:
            duration = float(probe.stdout.strip())
        except ValueError:
            duration = 0.0
        out.append((segment_start_epoch(path), duration))
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(out))
    return out


def daily_offset_to_epoch(camera: str, day: str, offset: float) -> float | None:
    elapsed = 0.0
    for start, duration in segment_durations(camera, day):
        if offset < elapsed + duration:
            return start + (offset - elapsed)
        elapsed += duration
    return None


def iou(a, b) -> float:
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def load_anchors(tracklets):
    samples = json.loads(DATASET.read_text(encoding="utf-8"))["samples"]
    by_camera: dict[str, list[dict]] = {}
    for t in tracklets:
        by_camera.setdefault(t["camera"], []).append(t)
    anchors, missed = [], []
    for s in samples:
        m = re.match(r"s\d+_(.+)_(\d{4}-\d{2}-\d{2})\.mp4$", ntpath.basename(s["sourcePath"]))
        camera = ROOM_CAMERAS.get(m.group(1)) if m else None
        epoch = daily_offset_to_epoch(camera, m.group(2), s["offsetSeconds"]) if camera else None
        best, best_iou, second_iou = None, 0.0, 0.0
        for t in by_camera.get(camera, []) if epoch else []:
            if t["class"] != s["detectedClass"] or not (t["start"] - 2 <= epoch <= t["end"] + 2):
                continue
            nearest = min(t["boxes"], key=lambda b: abs(b[0] - epoch))
            if abs(nearest[0] - epoch) > 3:
                continue
            ov = iou(nearest[1:5], s["boxXyxy"])
            if ov > best_iou:
                best, best_iou, second_iou = t, ov, best_iou
            elif ov > second_iou:
                second_iou = ov
        # With two people sitting close, a loose overlap matched a reviewed crop
        # to the wrong body (Game Room 2, 2026-09-13 23:18). Require a strong
        # match that is clearly better than the next body.
        if best is not None and best_iou >= 0.5 and best_iou - second_iou >= 0.2:
            anchors.append({"tracklet": best["id"], "slug": s["targetSlug"], "split": s["split"], "iou": round(best_iou, 2)})
        else:
            missed.append({"slug": s["targetSlug"], "source": ntpath.basename(s["sourcePath"]), "offset": s["offsetSeconds"],
                           "iou": round(best_iou, 2), "runner_up_iou": round(second_iou, 2)})

    # Two anchors of one member that cannot be one body: keep the stronger match.
    anchors.sort(key=lambda a: -a["iou"])
    kept: list[dict] = []
    for a in anchors:
        ta = tracklets[a["tracklet"]]
        if any(k["slug"] == a["slug"] and same_body_impossible(ta, tracklets[k["tracklet"]]) for k in kept):
            missed.append({"slug": a["slug"], "reason": "contradicts a stronger anchor", "iou": a["iou"]})
            continue
        kept.append(a)
    return kept, missed


# ── stitching ───────────────────────────────────────────────────────────────
def stitch(tracklets, matrices, max_gap=6.0, max_jump=0.12, min_sim=0.55):
    """Union consecutive fragments of one body on one camera into chains.

    A link is refused if it would put two tracklets that overlap in time into
    one chain. The first version checked only the pair being linked, so A->B
    and A->C both succeeded while B and C overlapped: two people, one chain.
    """
    parent = list(range(len(tracklets)))
    members: dict[int, list[dict]] = {t["id"]: [t] for t in tracklets}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    vec = {}
    for cls, (ids, mat) in matrices.items():
        for i, row in zip(ids, mat):
            vec[int(i)] = row
    by_cam: dict[tuple, list[dict]] = {}
    for t in tracklets:
        by_cam.setdefault((t["camera"], t["class"]), []).append(t)
    for trs in by_cam.values():
        trs.sort(key=lambda t: t["start"])
        for i, a in enumerate(trs):
            a_last = a["boxes"][-1]
            for b in trs[i + 1:]:
                gap = b["start"] - a["end"]
                if gap > max_gap:
                    break
                if gap < -0.5:
                    continue
                b_first = b["boxes"][0]
                ca = ((a_last[1] + a_last[3]) / 2 / 1280, (a_last[2] + a_last[4]) / 2 / 720)
                cb = ((b_first[1] + b_first[3]) / 2 / 1280, (b_first[2] + b_first[4]) / 2 / 720)
                if ((ca[0] - cb[0]) ** 2 + (ca[1] - cb[1]) ** 2) ** 0.5 > max_jump or float(vec[a["id"]] @ vec[b["id"]]) < min_sim:
                    continue
                ra, rb = find(a["id"]), find(b["id"])
                if ra == rb:
                    continue
                if not spans_compatible(members[ra], members[rb]):
                    continue
                parent[rb] = ra
                members[ra] = sorted(members[ra] + members.pop(rb), key=lambda t: t["start"])
                break  # one successor per fragment
    return [find(i) for i in range(len(tracklets))]


# ── propagation ─────────────────────────────────────────────────────────────
def _chain_vectors(matrices, chain_of, cls):
    ids, mat = matrices[cls]
    id_list = [int(i) for i in ids]
    pos = {tid: k for k, tid in enumerate(id_list)}
    chains: dict[int, list[int]] = {}
    for tid in id_list:
        chains.setdefault(chain_of[tid], []).append(tid)
    chain_ids = list(chains)
    vec = np.stack([mat[[pos[t] for t in chains[c]]].mean(0) for c in chain_ids]).astype(np.float32)
    vec /= np.maximum(np.linalg.norm(vec, axis=1, keepdims=True), 1e-9)
    return chains, chain_ids, vec


def propagate(tracklets, matrices, chain_of, seeds: dict[int, str], args):
    """seeds: tracklet id -> slug. Returns tracklet id -> (slug, score, margin, round).

    Vectorised per round (chains x members), and the exclusion rule checks an
    interval index instead of every labelled chain: the first version compared
    every candidate against every labelled span pairwise, which on ~2,000
    tracklets pinned the CPU for over ten minutes and made the PC stutter.
    """
    labels: dict[int, tuple] = {}
    for cls in matrices:
        chains, chain_ids, vec = _chain_vectors(matrices, chain_of, cls)
        index_of = {c: k for k, c in enumerate(chain_ids)}
        sim = vec @ vec.T
        spans = {c: sorted((tracklets[t] for t in chains[c]), key=lambda t: t["start"]) for c in chain_ids}

        chain_label: dict[int, tuple] = {}
        # slug -> every sighting already carrying that name, sorted by start.
        claimed: dict[str, list[dict]] = {}

        def claim(c, slug):
            claimed[slug] = sorted(claimed.get(slug, []) + spans[c], key=lambda t: t["start"])

        def conflicts(c, slug):
            # The same name cannot be on two bodies at once -- same camera, or
            # two rooms that do not share a view.
            return not spans_compatible(spans[c], claimed.get(slug, []))

        for tid, slug in seeds.items():
            c = chain_of[tid]
            if c in index_of and c not in chain_label:
                chain_label[c] = (slug, 1.0, 1.0, 0)
                claim(c, slug)

        for rnd in range(1, args.rounds + 1):
            members = sorted({v[0] for v in chain_label.values()})
            if not members:
                break
            unlabeled = [c for c in chain_ids if c not in chain_label]
            if not unlabeled:
                break
            rows = np.array([index_of[c] for c in unlabeled])
            score = np.zeros((len(unlabeled), len(members)), dtype=np.float32)
            for mi, m in enumerate(members):
                cols = np.array([index_of[c] for c, v in chain_label.items() if v[0] == m])
                block = sim[np.ix_(rows, cols)]
                k = min(args.topk, block.shape[1])
                top = np.partition(block, block.shape[1] - k, axis=1)[:, -k:]
                score[:, mi] = top.mean(1)
            order = np.argsort(-score, axis=1)
            best = score[np.arange(len(unlabeled)), order[:, 0]]
            runner = score[np.arange(len(unlabeled)), order[:, 1]] if len(members) > 1 else np.zeros(len(unlabeled))
            ok = (best >= args.min_score) & (best - runner >= args.min_margin)
            candidates = sorted(
                ((float(best[i]), float(best[i] - runner[i]), unlabeled[i], members[order[i, 0]]) for i in np.flatnonzero(ok)),
                reverse=True,
            )
            if not candidates:
                break
            accepted = 0
            for top_score, margin, c, slug in candidates[: max(1, int(len(candidates) * args.round_share))]:
                if conflicts(c, slug):
                    continue
                chain_label[c] = (slug, round(top_score, 4), round(margin, 4), rnd)
                claim(c, slug)
                accepted += 1
            if accepted == 0:
                break

        for c, v in chain_label.items():
            for tid in chains[c]:
                labels[tid] = v
    return labels


def group_unknowns(tracklets, matrices, chain_of, labels, min_chain_seconds=5.0, min_members=3, distance=0.35):
    """Cluster everything not named as a house member into anonymous groups.

    Centroid agglomeration with a hard rule: two clusters never merge if any of
    their sightings are live at the same moment on one camera, or in rooms that
    do not share a view. Plain appearance clustering mixed people in most
    groups (2026-09-16); every co-appearance in the archive is free proof that
    two bodies are different people, and this uses all of it.
    """
    import heapq

    groups = []
    for cls in matrices:
        chains, chain_ids, vec = _chain_vectors(matrices, chain_of, cls)
        keep = []
        for k, c in enumerate(chain_ids):
            if any(t in labels for t in chains[c]):
                continue
            if sum(tracklets[t]["end"] - tracklets[t]["start"] for t in chains[c]) >= min_chain_seconds:
                keep.append(k)
        if len(keep) < min_members:
            continue
        n = len(keep)
        sums = {i: vec[keep[i]].astype(np.float64).copy() for i in range(n)}
        counts = {i: 1 for i in range(n)}
        spans = {i: sorted((tracklets[t] for t in chains[chain_ids[keep[i]]]), key=lambda t: t["start"]) for i in range(n)}
        cluster_chains = {i: [chain_ids[keep[i]]] for i in range(n)}
        alive = set(range(n))
        threshold = 1.0 - distance

        sub_vec = vec[keep]
        sim = sub_vec @ sub_vec.T
        heap = []
        # Candidate merges: each cluster's 30 nearest neighbours above threshold.
        # All pairs above threshold can run to millions on a single class.
        for i in range(n):
            row = sim[i].copy()
            row[i] = -1.0
            nearest = np.argpartition(-row, min(30, n - 1))[:30]
            for j in nearest:
                if row[j] >= threshold and j != i:
                    heap.append((-float(row[j]), min(i, int(j)), max(i, int(j))))
        heapq.heapify(heap)

        def centroid_sim(i, j):
            a = sums[i] / np.linalg.norm(sums[i])
            b = sums[j] / np.linalg.norm(sums[j])
            return float(a @ b)

        while heap:
            neg, i, j = heapq.heappop(heap)
            if i not in alive or j not in alive:
                continue
            current = centroid_sim(i, j)
            if current < threshold:
                continue
            if current < -neg - 1e-6:
                heapq.heappush(heap, (-current, i, j))  # stale score: re-queue at its true value
                continue
            if not spans_compatible(spans[i], spans[j]):
                continue
            sums[i] += sums.pop(j)
            counts[i] += counts.pop(j)
            spans[i] = sorted(spans[i] + spans.pop(j), key=lambda t: t["start"])
            cluster_chains[i] += cluster_chains.pop(j)
            alive.discard(j)

        for i in sorted(alive, key=lambda i: -counts[i]):
            if counts[i] < min_members:
                continue
            tids = [t for c in cluster_chains[i] for t in chains[c]]
            groups.append({
                "group": f"unknown-{cls}-{len([g for g in groups if g['class'] == cls]) + 1}",
                "class": cls,
                "tracklets": [{"key": tracklets[t]["uid"], "stream": tracklets[t]["stream"], "room": tracklets[t]["room"],
                               "start": tracklets[t]["start"], "end": tracklets[t]["end"]} for t in tids],
                "rooms": sorted({tracklets[t]["room"] for t in tids}),
                "seconds": round(sum(tracklets[t]["end"] - tracklets[t]["start"] for t in tids)),
            })
    return groups


def group_sheets(groups, per_sheet=40):
    sheets = OUT / "unknown-sheets"
    sheets.mkdir(parents=True, exist_ok=True)
    for g in groups:
        pick = g["tracklets"][:: max(1, len(g["tracklets"]) // per_sheet)][:per_sheet]
        tiles = []
        for t in pick:
            img = cv2.imread(str(THUMBS / t["stream"] / f"{t['key']}.jpg"))
            if img is not None:
                tiles.append(cv2.resize(img, (80, 160)))
        if not tiles:
            continue
        while len(tiles) % 10:
            tiles.append(np.zeros_like(tiles[0]))
        cv2.imwrite(str(sheets / f"{g['group']}.jpg"), np.vstack([np.hstack(tiles[i:i + 10]) for i in range(0, len(tiles), 10)]))


def evaluate(tracklets, matrices, chain_of, anchors, args, mode="kfold", folds=5):
    """mode="kfold": random folds -- optimistic, a hidden anchor usually has an
    unhidden neighbour from the same room minutes earlier.
    mode="camera": hide every anchor from one camera and seed only from the
    others -- the cross-room question Follow Member actually depends on."""
    usable = [a for a in anchors]
    random.Random(7).shuffle(usable)
    if mode == "camera":
        cams = sorted({tracklets[a["tracklet"]]["camera"] for a in usable})
        groups = [[a for a in usable if tracklets[a["tracklet"]]["camera"] == c] for c in cams]
    else:
        groups = [usable[f::folds] for f in range(folds)]
    results = {"mode": mode, "groups": len(groups), "named": 0, "right": 0, "wrong": 0, "unnamed": 0, "confusions": {}}
    for hidden in groups:
        if mode == "camera":
            hidden_cam = tracklets[hidden[0]["tracklet"]]["camera"]
        hidden_ids = {a["tracklet"] for a in hidden}
        seeds = {a["tracklet"]: a["slug"] for a in usable if a["tracklet"] not in hidden_ids}
        if mode == "camera":
            seeds = {t: s for t, s in seeds.items() if tracklets[t]["camera"] != hidden_cam}
        # A hidden anchor must not be reachable through its own chain's seed.
        seeds = {t: s for t, s in seeds.items() if chain_of[t] not in {chain_of[h] for h in hidden_ids}}
        labels = propagate(tracklets, matrices, chain_of, seeds, args)
        for a in hidden:
            got = labels.get(a["tracklet"])
            if got is None:
                results["unnamed"] += 1
                continue
            results["named"] += 1
            if got[0] == a["slug"]:
                results["right"] += 1
            else:
                results["wrong"] += 1
                key = f"{a['slug']}->{got[0]}"
                results["confusions"][key] = results["confusions"].get(key, 0) + 1
    n = results["named"]
    results["precision"] = round(results["right"] / n, 3) if n else None
    results["coverage"] = round(n / max(1, len(usable)), 3)
    return results


def contact_sheets(tracklets, labels, per_sheet=40):
    sheets = OUT / "sheets"
    by: dict[tuple, list[dict]] = {}
    for t in tracklets:
        if t["id"] in labels:
            by.setdefault((labels[t["id"]][0], t["room"]), []).append(t)
    for (slug, room), trs in by.items():
        trs = sorted(trs, key=lambda t: -labels[t["id"]][1])
        pick = trs[:: max(1, len(trs) // per_sheet)][:per_sheet]
        tiles = []
        for t in pick:
            img = cv2.imread(str(THUMBS / t["stream"] / f"{t['uid']}.jpg"))
            if img is not None:
                tiles.append(cv2.resize(img, (80, 160)))
        if not tiles:
            continue
        while len(tiles) % 10:
            tiles.append(np.zeros_like(tiles[0]))
        grid = np.vstack([np.hstack(tiles[i:i + 10]) for i in range(0, len(tiles), 10)])
        (sheets / slug).mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(sheets / slug / f"{room}.jpg"), grid)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-score", type=float, default=0.72)
    ap.add_argument("--min-margin", type=float, default=0.06)
    ap.add_argument("--topk", type=int, default=3)
    ap.add_argument("--rounds", type=int, default=12)
    ap.add_argument("--round-share", type=float, default=0.25)
    ap.add_argument("--eval-only", action="store_true")
    args = ap.parse_args()
    sys.path.insert(0, str(ROOT))
    from tank_vision.background import make_polite
    make_polite()
    OUT.mkdir(parents=True, exist_ok=True)

    tracklets, matrices = load_tracklets()
    print(f"tracklets {len(tracklets)}  by class {{{', '.join(f'{c}: {len(m[0])}' for c, m in matrices.items())}}}")
    anchors, missed = load_anchors(tracklets)
    print(f"anchors matched {len(anchors)} / {len(anchors) + len(missed)}")
    chain_of = stitch(tracklets, matrices)
    print(f"chains after stitching {len(set(chain_of))}")

    report = {"params": vars(args), "anchors": len(anchors), "anchors_missed": missed[:20]}
    for mode in ("kfold", "camera"):
        r = evaluate(tracklets, matrices, chain_of, anchors, args, mode=mode)
        report[mode] = r
        print(mode, json.dumps({k: r[k] for k in ("precision", "coverage", "named", "right", "wrong", "unnamed", "confusions")}))
    (OUT / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if args.eval_only:
        return

    labels = propagate(tracklets, matrices, chain_of, {a["tracklet"]: a["slug"] for a in anchors}, args)
    counts: dict[str, dict[str, int]] = {}
    for t in tracklets:
        if t["id"] in labels:
            counts.setdefault(labels[t["id"]][0], {}).setdefault(t["room"], 0)
            counts[labels[t["id"]][0]][t["room"]] += 1
    print("labelled tracklets by member and room:", json.dumps(counts))
    (OUT / "labels.json").write_text(json.dumps({
        "params": vars(args),
        "labels": [{"key": t["uid"], "stream": t["stream"], "class": t["class"], "room": t["room"],
                    "start": t["start"], "end": t["end"], "slug": labels[t["id"]][0],
                    "score": labels[t["id"]][1], "margin": labels[t["id"]][2], "round": labels[t["id"]][3]}
                   for t in tracklets if t["id"] in labels],
    }), encoding="utf-8")
    contact_sheets(tracklets, labels)

    groups = group_unknowns(tracklets, matrices, chain_of, labels)
    group_sheets(groups)
    (OUT / "unknown-groups.json").write_text(json.dumps({
        "note": "Name a group once; every tracklet in it takes that name on the next run.",
        "groups": groups,
    }), encoding="utf-8")
    print(f"unknown groups: {len(groups)} ({', '.join(g['group'] + ':' + str(len(g['tracklets'])) for g in groups[:12])})")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
