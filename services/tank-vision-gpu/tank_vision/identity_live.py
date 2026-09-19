"""House-wide identity for the bodies in frame right now.

Naming each body on its own gets two things wrong that the house makes obvious:

1. There is only one Tyler. When Tyler is named at the game-room desk, the
   person beside him cannot also be Tyler -- yet scored alone, Tyler stays in
   her list, and a three-way near tie (joe .675 / malia .663 / tyler .646,
   measured 2026-09-19) leaves her unnamed. Names are therefore handed out
   across the whole house, strongest claim first, and a name once given is off
   everyone else's list for that moment -- in every room, since nobody is in two
   places at once.

2. Overlapping cameras see the same people. Game Room and Game Room 2 look at
   the same desks; Living Room and Kitchen share a view. The same person scored
   separately in each was named in one and "unknown" in the other at the same
   instant. Bodies that look alike across such a pair are treated as one person
   and their evidence is pooled.

Pure functions only -- no models, cameras or network -- so the rules are tested
directly (tests/test_identity_live.py).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# Rooms whose cameras can see the same body at the same moment.
OVERLAPPING_ROOMS = (frozenset({"game-room", "game-room-2"}), frozenset({"living-room", "kitchen"}))
# Two tracks in overlapping rooms are one person when they look at least this
# alike AND each is the other's clear best match. Measured on graded sightings
# on camera at the same time in overlapping rooms (2026-09-19): same person
# median 0.725, different people median 0.600. At 0.68 a pair-merge was wrong
# 16% of the time; at 0.72, 7.5%, and the best-match rule cuts that further
# because the true partner is usually the closer one. Merging two people is the
# costly mistake -- it hands one person's name to another -- so this errs strict.
LINK_MIN = 0.72
LINK_LEAD = 0.04


@dataclass
class Sighting:
    """One track, right now: where it is, how it looks, and how each name scores."""
    key: tuple
    cls: str
    room: str
    vec: np.ndarray
    scores: dict[str, float]
    held: str | None = None


@dataclass
class Verdict:
    """What the house-wide pass concluded about one track."""
    name: str | None
    score: float
    margin: float
    partner: tuple | None = None          # the same person in the overlapping camera
    lost_claim: bool = False              # held a name another body held more strongly
    excluded: list[str] = field(default_factory=list)


def rank(scores: dict[str, float]) -> tuple[str | None, float, float]:
    """Best name, its score, and its lead over the runner-up."""
    if not scores:
        return None, 0.0, 0.0
    ordered = sorted(scores.items(), key=lambda kv: -kv[1])
    top, score = ordered[0]
    return top, score, score - (ordered[1][1] if len(ordered) > 1 else 0.0)


def combine(parts: list[dict[str, float]]) -> dict[str, float]:
    """Pool several views of one person: the mean score per name over the views that scored it."""
    pooled: dict[str, list[float]] = {}
    for part in parts:
        for name, score in part.items():
            pooled.setdefault(name, []).append(score)
    return {name: float(np.mean(values)) for name, values in pooled.items()}


def overlapping(a: str, b: str) -> bool:
    return a != b and frozenset({a, b}) in OVERLAPPING_ROOMS


def link(sightings: list[Sighting], minimum: float = LINK_MIN) -> list[list[int]]:
    """Group sightings into people: a pair across overlapping rooms that look alike.

    Greedy on similarity, each track in at most one pair, so two people at two
    desks seen by two cameras pair up as two people, not one.
    """
    pairs = []
    for i, a in enumerate(sightings):
        for j in range(i + 1, len(sightings)):
            b = sightings[j]
            if a.cls == b.cls and overlapping(a.room, b.room):
                sim = float(a.vec @ b.vec)
                if sim >= minimum:
                    pairs.append((sim, i, j))
    # Each side's best alternative partner: a link must beat it clearly, or the
    # pairing is a guess between two similar-looking people.
    rival: dict[int, list[float]] = {}
    for sim, i, j in pairs:
        rival.setdefault(i, []).append(sim)
        rival.setdefault(j, []).append(sim)
    used: set[int] = set()
    people: list[list[int]] = []
    for sim, i, j in sorted(pairs, reverse=True):
        if i in used or j in used:
            continue
        runner_up = max([s for s in rival[i] if s != sim] + [s for s in rival[j] if s != sim] + [-1.0])
        if sim - runner_up < LINK_LEAD:
            continue
        people.append([i, j])
        used.update((i, j))
    people += [[i] for i in range(len(sightings)) if i not in used]
    return people


def resolve(sightings: list[Sighting], min_claim: float = 0.012) -> dict[tuple, Verdict]:
    """Hand out names house-wide, strongest claim first; one body per name.

    A body already holding a name claims first -- it earned it over several
    looks -- then the rest by how clearly they lead. A name is only taken from
    the pool when the claim is at least a narrow win (min_claim): a coin-flip
    guess must not rob another body of its best candidate.
    """
    people = link(sightings)
    claims = []
    for members in people:
        pooled = combine([sightings[i].scores for i in members])
        held = next((sightings[i].held for i in members if sightings[i].held), None)
        _, top_score, margin = rank(pooled)
        claims.append({"members": members, "scores": pooled, "held": held, "cls": sightings[members[0]].cls,
                       "order": (0 if held else 1, -(pooled.get(held, top_score) if held else margin))})
    # name -> the rooms it has been given in, per class. A name is free for a
    # body in `room` unless it was given in that same room or in a room that does
    # not overlap it: the two cameras on one room each see the same person, and
    # the front and the back of Tyler are often too unalike to link, so a
    # house-wide "once" wrongly made one of them not-Tyler (2026-09-19: Tyler
    # side-on in the Game Room and face-on in Game Room 2 pushed the Game Room 2
    # Tyler off his own name, onto Malia's, and her onto Joe).
    taken: dict[str, dict[str, list[str]]] = {}
    verdicts: dict[tuple, Verdict] = {}
    for claim in sorted(claims, key=lambda c: c["order"]):
        given = taken.setdefault(claim["cls"], {})
        rooms = {sightings[i].room for i in claim["members"]}
        gone = {n for n, where in given.items() if any(w in rooms or not all(overlapping(w, r) for r in rooms) for w in where)}
        available = {n: s for n, s in claim["scores"].items() if n not in gone}
        name, score, margin = rank(available)
        lost = bool(claim["held"]) and claim["held"] in gone
        keep = claim["held"] if claim["held"] and not lost else None
        if keep:
            given.setdefault(keep, []).extend(rooms)
        elif name and margin >= min_claim:
            given.setdefault(name, []).extend(rooms)
        members = claim["members"]
        for i in members:
            partner = next((sightings[j].key for j in members if j != i), None)
            verdicts[sightings[i].key] = Verdict(name=name, score=score, margin=margin, partner=partner,
                                                 lost_claim=lost, excluded=sorted(set(claim["scores"]) - set(available)))
    return verdicts


# COCO keypoints the pose model reports: 0 nose, 1-2 eyes, 3-4 ears, 5-6 shoulders.
KP_SEEN = 0.5


def facing(conf: np.ndarray) -> str | None:
    """Which side of a body the camera sees, from pose keypoint confidences.

    The two cameras on a shared room face each other, so this is nearly all the
    director needs to pick between them: the front is the shot.
      front: the nose and both eyes
      side : a nose or an eye, but not the full face -- or an ear alone
      back : shoulders with no face at all
    None when the pose model could not see enough of the body to say.
    """
    seen = [float(c) >= KP_SEEN for c in conf[:7]]
    nose, eyes, ears, shoulders = seen[0], sum(seen[1:3]), sum(seen[3:5]), sum(seen[5:7])
    if nose and eyes == 2:
        return "front"
    if nose or eyes or ears:
        return "side"
    if shoulders:
        return "back"
    return None


def box_iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0
