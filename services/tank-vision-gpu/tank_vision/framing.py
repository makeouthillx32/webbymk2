"""Virtual camera that follows one subject inside a wide fixed shot.

The house cameras are 4K; the programme goes out at 1080p. That headroom is
what makes following possible: a 2x crop of a 3840x2160 frame is still native
1080p, so the viewport can close in on someone without softening the picture.

Motion is deliberately lazy. A camera operator does not re-centre on every step,
so neither does this:

* a dead zone ignores small movement around the centre of the shot,
* pan and zoom approach their target exponentially with separate time constants
  (zoom slower than pan, because zoom pumping is what makes viewers seasick),
* a lost subject holds the last framing briefly before drifting back to wide,
  which covers a detector miss or someone passing behind furniture.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class FramingPolicy:
    # Fraction of the crop height the subject's box should occupy.
    subject_fill: float = 0.55
    max_zoom: float = 2.5
    # Dead zone as a fraction of the crop size.
    dead_zone: float = 0.12
    pan_tau_s: float = 0.7
    zoom_tau_s: float = 1.4
    hold_after_loss_s: float = 2.5
    return_wide_tau_s: float = 2.5


@dataclass
class Crop:
    """Normalised crop of the source frame: centre and zoom (1 = full frame)."""

    cx: float = 0.5
    cy: float = 0.5
    zoom: float = 1.0

    def rect(self) -> tuple[float, float, float, float]:
        # Source and programme share 16:9, so one zoom sets both dimensions.
        w = h = 1.0 / self.zoom
        x = min(max(self.cx - w / 2, 0.0), 1.0 - w)
        y = min(max(self.cy - h / 2, 0.0), 1.0 - h)
        return (x, y, w, h)


def _approach(current: float, target: float, dt: float, tau: float) -> float:
    return current + (target - current) * (1.0 - math.exp(-dt / tau))


class FollowCamera:
    def __init__(self, policy: FramingPolicy | None = None) -> None:
        self.policy = policy or FramingPolicy()
        self.crop = Crop()
        self._lost_since: float | None = None
        self._goal = Crop()

    def update(self, now: float, dt: float, box: tuple[float, float, float, float] | None) -> Crop:
        p = self.policy
        if box is not None:
            self._lost_since = None
            x, y, w, h = box
            zoom = min(p.max_zoom, max(1.0, p.subject_fill / max(h, 1e-3)))
            # Aim a little above the box centre: headroom reads better than a
            # subject whose head touches the top of frame.
            cx, cy = x + w / 2, y + h * 0.45
            half = 0.5 / zoom
            cx = min(max(cx, half), 1 - half)
            cy = min(max(cy, half), 1 - half)
            cur_half = 0.5 / self.crop.zoom
            if (
                abs(cx - self._goal.cx) > p.dead_zone * cur_half * 2
                or abs(cy - self._goal.cy) > p.dead_zone * cur_half * 2
                or abs(zoom - self._goal.zoom) > 0.15
            ):
                self._goal = Crop(cx, cy, zoom)
        else:
            if self._lost_since is None:
                self._lost_since = now
            if now - self._lost_since > p.hold_after_loss_s:
                self._goal = Crop(0.5, 0.5, 1.0)

        returning = self._lost_since is not None and now - self._lost_since > p.hold_after_loss_s
        pan_tau = p.return_wide_tau_s if returning else p.pan_tau_s
        zoom_tau = p.return_wide_tau_s if returning else p.zoom_tau_s
        self.crop = Crop(
            _approach(self.crop.cx, self._goal.cx, dt, pan_tau),
            _approach(self.crop.cy, self._goal.cy, dt, pan_tau),
            _approach(self.crop.zoom, self._goal.zoom, dt, zoom_tau),
        )
        return self.crop


def crop_to_ptz(crop: Crop, source_w: int = 3840, source_h: int = 2160) -> dict:
    """The director's VirtualPtzState shape: zoom plus top-left pan in source pixels."""
    x, y, _, _ = crop.rect()
    return {
        "zoomFactor": round(crop.zoom, 4),
        "panOffsetX": round(x * source_w, 1),
        "panOffsetY": round(y * source_h, 1),
        "zoomSpeed": 5,
        "speedMode": "fine",
    }
