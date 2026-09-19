"""The house-wide naming rules, on the exact case that motivated them."""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tank_vision.identity_live import Sighting, combine, link, rank, resolve  # noqa: E402


def unit(*values):
    v = np.array(values, dtype=np.float32)
    return v / np.linalg.norm(v)


def test_the_person_beside_tyler_is_not_offered_tyler():
    # Measured 2026-09-19 at the game-room-2 desks.
    tyler = Sighting(("gr2", 1), "person", "game-room-2", unit(1, 0, 0), {"tyler": 0.764, "joe": 0.722, "guest-andy": 0.712}, held="tyler")
    her = Sighting(("gr2", 2), "person", "game-room-2", unit(0, 1, 0), {"joe": 0.675, "malia": 0.663, "tyler": 0.646})
    v = resolve([tyler, her])
    assert v[("gr2", 1)].name == "tyler"
    assert "tyler" in v[("gr2", 2)].excluded
    # Tyler off her list: Joe vs Malia, a real (narrow) two-way choice now.
    assert v[("gr2", 2)].name == "joe"
    assert abs(v[("gr2", 2)].margin - 0.012) < 1e-6


def test_nobody_is_in_two_rooms_at_once():
    kitchen = Sighting(("kit", 1), "person", "kitchen", unit(1, 0, 0), {"tyler": 0.80, "joe": 0.70}, held="tyler")
    foyer = Sighting(("foy", 1), "person", "foyer", unit(0, 1, 0), {"tyler": 0.74, "malia": 0.72})
    v = resolve([kitchen, foyer])
    assert v[("foy", 1)].name == "malia"


def test_two_bodies_holding_one_name_keep_the_stronger():
    a = Sighting(("a", 1), "person", "kitchen", unit(1, 0, 0), {"tyler": 0.82, "joe": 0.70}, held="tyler")
    b = Sighting(("b", 1), "person", "foyer", unit(0, 1, 0), {"tyler": 0.74, "joe": 0.73}, held="tyler")
    v = resolve([a, b])
    assert not v[("a", 1)].lost_claim
    assert v[("b", 1)].lost_claim and v[("b", 1)].name == "joe"


def test_overlapping_cameras_see_one_person_and_pool_evidence():
    gr = Sighting(("gr", 1), "person", "game-room", unit(1, 0.1, 0), {"tyler": 0.70, "malia": 0.69})
    gr2 = Sighting(("gr2", 1), "person", "game-room-2", unit(1, 0.12, 0), {"tyler": 0.78, "malia": 0.70})
    v = resolve([gr, gr2])
    assert v[("gr", 1)].partner == ("gr2", 1)
    assert v[("gr", 1)].name == v[("gr2", 1)].name == "tyler"
    # Pooled: the weak angle is lifted by the strong one.
    assert v[("gr", 1)].margin > 0.70 - 0.69


def test_two_people_seen_by_two_cameras_stay_two_people():
    a1 = Sighting(("gr", 1), "person", "game-room", unit(1, 0, 0), {"tyler": 0.8})
    b1 = Sighting(("gr", 2), "person", "game-room", unit(0, 1, 0), {"malia": 0.8})
    a2 = Sighting(("gr2", 1), "person", "game-room-2", unit(0.99, 0.05, 0), {"tyler": 0.8})
    b2 = Sighting(("gr2", 2), "person", "game-room-2", unit(0.05, 0.99, 0), {"malia": 0.8})
    people = link([a1, b1, a2, b2])
    assert sorted(sorted(p) for p in people) == [[0, 2], [1, 3]]


def test_rooms_that_do_not_overlap_never_merge_bodies():
    a = Sighting(("kit", 1), "person", "kitchen", unit(1, 0, 0), {"tyler": 0.8})
    b = Sighting(("foy", 1), "person", "foyer", unit(1, 0, 0), {"tyler": 0.8})
    assert len(link([a, b])) == 2


def test_dogs_are_exclusive_among_dogs_only():
    molly = Sighting(("foy", 1), "dog", "foyer", unit(1, 0, 0), {"molly": 0.9, "olly": 0.7}, held="molly")
    other = Sighting(("kit", 1), "dog", "kitchen", unit(0, 1, 0), {"molly": 0.85, "olly": 0.80})
    person = Sighting(("gr", 1), "person", "game-room", unit(0, 0, 1), {"tyler": 0.8, "joe": 0.7})
    v = resolve([molly, other, person])
    assert v[("kit", 1)].name == "olly"
    assert v[("gr", 1)].name == "tyler"


def test_a_coin_flip_guess_does_not_rob_another_body():
    shaky = Sighting(("a", 1), "person", "kitchen", unit(1, 0, 0), {"joe": 0.700, "malia": 0.699})
    clear = Sighting(("b", 1), "person", "foyer", unit(0, 1, 0), {"joe": 0.80, "tyler": 0.70})
    v = resolve([shaky, clear])
    assert v[("b", 1)].name == "joe"


def test_helpers():
    assert rank({}) == (None, 0.0, 0.0)
    assert rank({"a": 0.9, "b": 0.7})[0] == "a"
    assert combine([{"a": 0.8}, {"a": 0.6, "b": 0.5}]) == {"a": 0.7, "b": 0.5}


def test_an_ambiguous_pairing_is_left_unlinked():
    # Two similar-looking people: gr#1 is almost as close to gr2#2 as to gr2#1.
    a = Sighting(("gr", 1), "person", "game-room", unit(1, 0.30, 0), {"tyler": 0.8})
    b1 = Sighting(("gr2", 1), "person", "game-room-2", unit(1, 0.32, 0), {"tyler": 0.8})
    b2 = Sighting(("gr2", 2), "person", "game-room-2", unit(1, 0.36, 0), {"joe": 0.8})
    assert all(len(p) == 1 for p in link([a, b1, b2]))


def test_facing_from_keypoints():
    from tank_vision.identity_live import box_iou, facing
    c = lambda *v: np.array(v + (0.0,) * (17 - len(v)))  # noqa: E731
    assert facing(c(.9, .9, .9, .2, .2, .9, .9)) == "front"
    assert facing(c(.9, .9, .1, .9, .1, .9, .9)) == "side"
    assert facing(c(.1, .1, .1, .8, .1, .9, .9)) == "side"
    assert facing(c(.1, .1, .1, .1, .1, .9, .9)) == "back"
    assert facing(c()) is None
    assert abs(box_iou((0, 0, 2, 2), (1, 0, 3, 2)) - 1 / 3) < 1e-9


def test_the_two_cameras_on_one_room_may_both_see_tyler():
    # 2026-09-19: side-on in the Game Room, face-on in Game Room 2 -- too unalike to link.
    side = Sighting(("gr", 1), "person", "game-room", unit(1, 0, 0), {"tyler": 0.883, "joe": 0.771, "malia": 0.762}, held="tyler")
    front = Sighting(("gr2", 1), "person", "game-room-2", unit(0, 1, 0), {"tyler": 0.792, "malia": 0.749, "joe": 0.731})
    her = Sighting(("gr2", 2), "person", "game-room-2", unit(0, 0, 1), {"malia": 0.745, "joe": 0.706, "tyler": 0.674})
    v = resolve([side, front, her])
    assert v[("gr", 1)].name == "tyler"
    assert v[("gr2", 1)].name == "tyler"
    assert v[("gr2", 2)].name == "malia"


def test_but_one_camera_never_shows_two_tylers():
    a = Sighting(("gr2", 1), "person", "game-room-2", unit(1, 0, 0), {"tyler": 0.80, "joe": 0.70}, held="tyler")
    gr = Sighting(("gr", 1), "person", "game-room", unit(0, 0, 1), {"tyler": 0.78, "joe": 0.70})
    b = Sighting(("gr", 2), "person", "game-room", unit(0, 1, 0), {"tyler": 0.77, "malia": 0.72})
    v = resolve([a, gr, b])
    assert [v[("gr", 1)].name, v[("gr", 2)].name].count("tyler") == 1
