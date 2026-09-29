"""Pure-logic tests. Run: python tests/test_logic.py  (no pytest needed)."""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tank_vision.framing import FollowCamera, crop_to_ptz  # noqa: E402
from tank_vision.identity import Gallery, IdentityPolicy, Resolution, TrackIdentity, exclusive_names  # noqa: E402
from tank_vision.tracks import CameraTracks  # noqa: E402


def test_one_lucky_frame_cannot_name_a_track():
    t = TrackIdentity()
    t.add([("tyler", 0.95), ("joe", 0.50)])
    assert t.resolve().name is None, "a single sample must never commit a name"


def test_consistent_evidence_commits_a_name():
    t = TrackIdentity()
    for _ in range(4):
        t.add([("tyler", 0.86), ("joe", 0.70)])
    assert t.resolve().name == "tyler"


def test_many_references_do_not_win_on_volume():
    # Tyler scores high on one sample in four (a lucky reference among many),
    # the rest favour nobody strongly: the MEAN must stay below threshold.
    t = TrackIdentity()
    t.add([("tyler", 0.90), ("joe", 0.60)])
    for _ in range(3):
        t.add([("tyler", 0.70), ("joe", 0.66)])
    assert t.resolve().name is None


def test_close_contest_declines():
    t = TrackIdentity()
    for _ in range(5):
        t.add([("tyler", 0.85), ("joe", 0.83)])
    assert t.resolve().name is None, "margin below policy must decline"


def test_committed_name_is_released_not_swapped():
    t = TrackIdentity()
    for _ in range(4):
        t.add([("tyler", 0.88), ("joe", 0.60)])
    assert t.resolve().name == "tyler"
    for _ in range(IdentityPolicy().window):
        t.add([("joe", 0.90), ("tyler", 0.55)])
    first = t.resolve()
    assert first.name is None, "evidence turning must release the name first"
    assert t.resolve().name == "joe", "and only then may a new name be earned"


def test_static_track_needs_stronger_evidence():
    t = TrackIdentity()
    for _ in range(4):
        t.add([("tyler", 0.82), ("joe", 0.70)])
    assert t.resolve(static=True).name is None
    assert t.resolve(static=False).name == "tyler"


def test_same_name_twice_in_one_frame_keeps_strongest():
    out = exclusive_names([
        (1, Resolution("tyler", 0.84, 0.1, 5)),
        (2, Resolution("tyler", 0.91, 0.1, 5)),
        (3, Resolution("joe", 0.88, 0.1, 5)),
    ])
    assert out == {1: None, 2: "tyler", 3: "joe"}


def test_gallery_never_crosses_class():
    g = Gallery()
    g.add("dog", "molly", np.array([1.0, 0.0]))
    g.add("cat", "kitty", np.array([1.0, 0.0]))
    assert [s for s, _ in g.rank("dog", np.array([1.0, 0.0]))] == ["molly"]


def test_rack_that_never_moves_becomes_static_person_who_walked_in_does_not():
    cams = CameraTracks()
    for i in range(100):
        rack = cams.observe(i * 0.5, 1, "person", (0.40, 0.20, 0.10, 0.50), 0.6)
        wx = 0.10 + min(i, 10) * 0.02  # walks in, then sits still
        person = cams.observe(i * 0.5, 2, "person", (wx, 0.30, 0.10, 0.40), 0.9)
    assert rack.is_static(50.0, cams.policy)
    assert not person.is_static(50.0, cams.policy)


def test_follow_camera_zooms_in_and_returns_wide_after_loss():
    cam = FollowCamera()
    box = (0.60, 0.30, 0.08, 0.22)
    for i in range(60):
        crop = cam.update(i * 0.1, 0.1, box)
    assert crop.zoom > 2.0 and abs(crop.cx - 0.64) < 0.08
    ptz = crop_to_ptz(crop)
    assert ptz["panOffsetX"] > 0 and ptz["zoomFactor"] == round(crop.zoom, 4)
    for i in range(60, 200):
        crop = cam.update(i * 0.1, 0.1, None)
    assert crop.zoom < 1.1


def test_small_movement_inside_dead_zone_does_not_move_the_shot():
    cam = FollowCamera()
    for i in range(80):
        cam.update(i * 0.1, 0.1, (0.50, 0.30, 0.08, 0.25))
    before = (cam.crop.cx, cam.crop.cy)
    for i in range(80, 120):
        cam.update(i * 0.1, 0.1, (0.505, 0.302, 0.08, 0.25))
    assert abs(cam.crop.cx - before[0]) < 0.004 and abs(cam.crop.cy - before[1]) < 0.004


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted((n, f) for n, f in globals().items() if n.startswith("test_")):
        try:
            fn()
            print("pass", name)
        except AssertionError as e:
            failed += 1
            print("FAIL", name, "-", e)
    print(f"\n{failed} failed" if failed else "\nall passed")
    sys.exit(1 if failed else 0)
