"""Per-camera track bookkeeping: motion history, static detection, sampling.

WHY STATIC MATTERS
------------------
Axis drew a person box around a server rack and named it Tyler. The detector
makes that kind of mistake occasionally and no threshold fixes it completely.
What a rack cannot do is move. A real person who sits still for an hour still
walked in first, so a track that moved at any point in its life is never
treated as static -- only one that has never moved since it appeared.

Static tracks are not deleted (a person can be re-acquired while sitting and
genuinely not move); they must clear a stricter identity bar and are excluded
from the headcount the director scores rooms on.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .identity import IdentityPolicy, TrackIdentity


@dataclass(frozen=True)
class TrackPolicy:
    # Normalised distance (fraction of the frame) the box centre must travel
    # from where the track began before it counts as having moved.
    move_distance: float = 0.03
    # A never-moved track becomes static after this long.
    static_after_s: float = 45.0
    # Minimum seconds between identity samples for one track.
    sample_interval_s: float = 0.5
    # Crops smaller than this say nothing reliable about who someone is.
    min_crop_h_px: int = 72
    min_crop_w_px: int = 28
    min_detector_confidence: float = 0.45
    # Tracks unseen for this long are forgotten.
    forget_after_s: float = 10.0


@dataclass
class Track:
    track_id: int
    detected_class: str
    first_t: float
    first_center: tuple[float, float]
    last_t: float
    box: tuple[float, float, float, float]  # normalised x, y, w, h
    confidence: float
    identity: TrackIdentity
    moved: bool = False
    last_sample_t: float = -1e9
    name: str | None = None
    name_confidence: float = 0.0

    def center(self) -> tuple[float, float]:
        x, y, w, h = self.box
        return (x + w / 2, y + h / 2)

    def is_static(self, now: float, policy: TrackPolicy) -> bool:
        return not self.moved and now - self.first_t >= policy.static_after_s


@dataclass
class CameraTracks:
    policy: TrackPolicy = field(default_factory=TrackPolicy)
    identity_policy: IdentityPolicy = field(default_factory=IdentityPolicy)
    tracks: dict[int, Track] = field(default_factory=dict)

    def observe(
        self,
        now: float,
        track_id: int,
        detected_class: str,
        box: tuple[float, float, float, float],
        confidence: float,
    ) -> Track:
        x, y, w, h = box
        center = (x + w / 2, y + h / 2)
        track = self.tracks.get(track_id)
        if track is None or track.detected_class != detected_class:
            track = Track(
                track_id=track_id,
                detected_class=detected_class,
                first_t=now,
                first_center=center,
                last_t=now,
                box=box,
                confidence=confidence,
                identity=TrackIdentity(policy=self.identity_policy),
            )
            self.tracks[track_id] = track
        track.last_t = now
        track.box = box
        track.confidence = confidence
        dx = center[0] - track.first_center[0]
        dy = center[1] - track.first_center[1]
        if (dx * dx + dy * dy) ** 0.5 >= self.policy.move_distance:
            track.moved = True
        return track

    def wants_sample(self, track: Track, now: float, frame_w: int, frame_h: int) -> bool:
        p = self.policy
        _, _, w, h = track.box
        return (
            now - track.last_sample_t >= p.sample_interval_s
            and track.confidence >= p.min_detector_confidence
            and h * frame_h >= p.min_crop_h_px
            and w * frame_w >= p.min_crop_w_px
        )

    def forget_stale(self, now: float) -> None:
        for track_id in [t for t, tr in self.tracks.items() if now - tr.last_t > self.policy.forget_after_s]:
            del self.tracks[track_id]
