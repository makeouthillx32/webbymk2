"""Who a track is, decided over time rather than per frame.

The live worker named single frames from a 40-value colour histogram. Measured
2026-09-16 on the 76 reviewed CCTV crops plus 228 background patches cut from
the same frames, that histogram put a housemate's name on 38% of background
patches -- the "server rack labelled Tyler" bug. DINOv2-small named none.

Know the limit before trusting a name: every body-appearance model tested,
DINOv2 included, recognised people only against references from the SAME
camera. With same-room references excluded, DINOv2 named nobody and the
histogram got 13 of 34 names wrong. A name from here is evidence within a room
and a session; following someone between rooms has to come from tracking
continuity, not from recognising them again.

Two structural changes sit on top of the better embedding:

* A name belongs to a TRACK. One track is many looks at the same body from
  different poses, so evidence is averaged across samples and a single bad
  frame cannot rename anyone. Names stop flickering because the thing that
  carries them persists.
* Every identity is scored as the best match among its references, but a track
  is scored on the MEAN of its samples. Averaging is what stops a person with
  many references from winning on volume: one lucky frame against 47 Tyler
  references no longer decides anything.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

import numpy as np


@dataclass(frozen=True)
class IdentityPolicy:
    # Calibrated on the bake-off: 0.799 was the highest score any background
    # patch reached against any identity with DINOv2-small.
    min_score: float = 0.80
    # How far clear of the runner-up the track's mean must be.
    min_margin: float = 0.05
    # Samples before a name can be committed. One look is a guess.
    min_samples: int = 3
    # Share of samples whose best match must agree with the committed name.
    min_vote_share: float = 0.6
    # Samples retained per track; older evidence ages out as poses change.
    window: int = 12
    # A track that has never moved must clear a higher bar (see tracks.py).
    static_penalty: float = 0.05
    # A committed name is released, never swapped, once support falls below this.
    release_below: float = 0.70


def normalise(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


class Gallery:
    """Reference embeddings grouped by detector class, then by member slug.

    Classes never mix: a dog is only compared with enrolled dogs. A strong
    coat-colour resemblance must not turn Molly into a cat.
    """

    def __init__(self) -> None:
        self._refs: dict[str, dict[str, np.ndarray]] = {}

    def add(self, detected_class: str, slug: str, embedding: np.ndarray) -> None:
        by_slug = self._refs.setdefault(detected_class, {})
        row = normalise(np.asarray(embedding, dtype=np.float32))[None, :]
        by_slug[slug] = row if slug not in by_slug else np.vstack([by_slug[slug], row])

    def counts(self) -> dict[str, dict[str, int]]:
        return {c: {s: int(m.shape[0]) for s, m in by_slug.items()} for c, by_slug in self._refs.items()}

    def rank(self, detected_class: str, embedding: np.ndarray) -> list[tuple[str, float]]:
        """Best-reference similarity per identity, highest first."""
        by_slug = self._refs.get(detected_class)
        if not by_slug:
            return []
        probe = normalise(np.asarray(embedding, dtype=np.float32))
        scored = [(slug, float(np.clip((refs @ probe).max(), 0.0, 1.0))) for slug, refs in by_slug.items()]
        scored.sort(key=lambda item: (-item[1], item[0]))
        return scored


@dataclass
class Resolution:
    name: str | None
    confidence: float
    margin: float
    samples: int
    # Leading candidate even when no name is committed -- for diagnostics only,
    # never for display.
    candidate: str | None = None


@dataclass
class TrackIdentity:
    policy: IdentityPolicy = field(default_factory=IdentityPolicy)
    samples: deque = field(default_factory=deque)
    committed: str | None = None

    def add(self, ranked: list[tuple[str, float]]) -> None:
        if not ranked:
            return
        self.samples.append(dict(ranked))
        while len(self.samples) > self.policy.window:
            self.samples.popleft()

    def _means(self) -> dict[str, float]:
        slugs = {s for sample in self.samples for s in sample}
        n = len(self.samples)
        return {s: sum(sample.get(s, 0.0) for sample in self.samples) / n for s in slugs}

    def resolve(self, *, static: bool = False) -> Resolution:
        n = len(self.samples)
        if n == 0:
            return Resolution(None, 0.0, 0.0, 0)
        p = self.policy
        means = self._means()
        ordered = sorted(means.items(), key=lambda kv: (-kv[1], kv[0]))
        top_slug, top = ordered[0]
        runner = ordered[1][1] if len(ordered) > 1 else 0.0
        threshold = p.min_score + (p.static_penalty if static else 0.0)

        if self.committed is not None:
            held = means.get(self.committed, 0.0)
            challenger_wins = (
                top_slug != self.committed and top >= threshold and top - held >= p.min_margin
            )
            if held >= p.release_below and not challenger_wins:
                others = max((v for s, v in means.items() if s != self.committed), default=0.0)
                return Resolution(self.committed, held, held - others, n, self.committed)
            # Released, not swapped: the next resolve has to earn a name again.
            self.committed = None
            return Resolution(None, top, top - runner, n, top_slug)

        votes = sum(1 for sample in self.samples if max(sample, key=sample.get) == top_slug)
        if (
            n >= p.min_samples
            and top >= threshold
            and top - runner >= p.min_margin
            and votes / n >= p.min_vote_share
        ):
            self.committed = top_slug
            return Resolution(top_slug, top, top - runner, n, top_slug)
        return Resolution(None, top, top - runner, n, top_slug)


def exclusive_names(claims: list[tuple[int, Resolution]]) -> dict[int, str | None]:
    """One camera frame cannot contain the same person twice.

    The strongest claim keeps the name for this frame; the others show unnamed.
    They are not demoted permanently, only not displayed as a duplicate.
    """
    out: dict[int, str | None] = {track_id: None for track_id, _ in claims}
    taken: set[str] = set()
    for track_id, res in sorted(claims, key=lambda c: (-c[1].confidence, c[0])):
        if res.name and res.name not in taken:
            taken.add(res.name)
            out[track_id] = res.name
    return out
