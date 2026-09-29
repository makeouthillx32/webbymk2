"""The Label Lab's Identity Map: how the director's model sees everyone it knows.

    .venv/Scripts/python tools/build_identity_map.py

One dot per graded sighting (a group's crops averaged), laid out in 2-D so that
dots the model finds alike sit close together. Coloured by the name the operator
gave it. Three things fall out that are worth a person's attention:

  * clouds that overlap: pairs the director confuses;
  * outliers: a sighting whose nearest neighbours mostly carry a DIFFERENT name
    than its own -- very likely a grading mistake;
  * a confusion grid: for each name, which name the model would pick instead
    when it is wrong (naming each sighting from all the others).

Written to tank_platform_settings key label_lab_identity_map (the Tank app reads
it) and to out/gallery/identity-map.json. Machine view only: coordinates and
names, no crops or vectors leave this machine.
"""

from __future__ import annotations

import collections
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from build_gallery_from_grades import fetch_rows  # noqa: E402
from live_learner import Rest  # noqa: E402

GALLERY = ROOT / "out" / "gallery"
NEIGHBOURS = 7
MAP_KEY = "label_lab_identity_map"


def layout(vectors: np.ndarray) -> np.ndarray:
    """2-D positions that keep look-alikes together (t-SNE on cosine distance)."""
    from sklearn.manifold import TSNE

    n = len(vectors)
    perplexity = max(5, min(40, (n - 1) // 3))
    xy = TSNE(n_components=2, metric="cosine", perplexity=perplexity, init="pca", random_state=7).fit_transform(vectors)
    xy -= xy.min(0)
    xy /= np.maximum(xy.max(0), 1e-9)
    return xy


def main() -> None:
    rest = Rest(dry_run=False)
    rows = fetch_rows(rest)
    with np.load(GALLERY / "cache.npz") as data:
        body = {k: data[k] for k in data.files}

    out = {"builtAt": datetime.now(timezone.utc).isoformat(), "classes": {}}
    for cls in ("person", "dog", "cat"):
        groups: dict[str, list[dict]] = collections.defaultdict(list)
        for r in rows:
            if r["detected_class"] == cls and r["sample_id"] in body and not r["target_slug"].startswith("not-"):
                groups[r["cluster_key"]].append(r)
        keys, names, vecs, rooms = [], [], [], []
        for key, members in groups.items():
            # A group is a sighting; its name is what most of its crops carry
            # (a crop handed to somebody else does not rename the group).
            name = collections.Counter(m["target_slug"] for m in members).most_common(1)[0][0]
            v = np.mean([body[m["sample_id"]] for m in members], axis=0)
            vecs.append(v / max(float(np.linalg.norm(v)), 1e-9))
            keys.append(key)
            names.append(name)
            rooms.append(collections.Counter((m.get("room_scope") or "?") for m in members).most_common(1)[0][0])
        if len(vecs) < 10:
            continue
        mat = np.stack(vecs)
        sims = mat @ mat.T
        np.fill_diagonal(sims, -2)

        # Outliers and the confusion grid both come from each sighting's
        # nearest neighbours: who the model thinks this looks like.
        points, confusion = [], collections.defaultdict(collections.Counter)
        order = np.argsort(-sims, axis=1)[:, :NEIGHBOURS]
        for i, key in enumerate(keys):
            votes = collections.Counter(names[j] for j in order[i])
            top, count = votes.most_common(1)[0]
            agree = votes.get(names[i], 0) / NEIGHBOURS
            confusion[names[i]][top] += 1
            points.append({
                "key": key, "name": names[i], "room": rooms[i],
                # Most neighbours carry another name: probably graded wrong.
                "outlier": top != names[i] and count >= (NEIGHBOURS // 2 + 1),
                "looksLike": top if top != names[i] else None,
                "agree": round(agree, 2),
            })
        xy = layout(mat)
        for p, (x, y) in zip(points, xy):
            p["x"], p["y"] = round(float(x), 4), round(float(y), 4)
        out["classes"][cls] = {
            "points": points,
            "confusion": {n: dict(c) for n, c in confusion.items()},
            "outliers": sum(p["outlier"] for p in points),
        }
        print(f"{cls}: {len(points)} sightings, {out['classes'][cls]['outliers']} probable mislabels", flush=True)

    (GALLERY / "identity-map.json").write_text(json.dumps(out), encoding="utf-8")
    rest.upsert("tank_platform_settings", [{"key": MAP_KEY, "value": out, "updated_at": out["builtAt"]}], "key")
    print("identity map published", flush=True)


if __name__ == "__main__":
    main()
