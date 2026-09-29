"""Identity bake-off on the curated Tank crops: which embedding can recognise a
member in a DIFFERENT room?

    python tools/reid_bakeoff.py                   # every method, cached
    python tools/reid_bakeoff.py --methods osnet_ain dinov2

Positives: the operator-reviewed CCTV crops (dataset-index.json).
Negatives: same-size background patches cut from the same frames -- the
"server rack named Tyler" case.

Regimes, per probe crop, choosing which references it may be compared with:
  same-room   references from the same recording but >= 300 s away
  cross-room  references from OTHER recordings only (different camera)

For each regime and class group it reports:
  rank1          best-matching identity is correct, no thresholds at all --
                 "is there any signal?"
  safe correct   names given at the threshold where NO background patch is
                 named, and how many of those are wrong
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tank_vision" / "third_party"))

DATASET = REPO / ".temp/tank-identity-expanded-pass1/dataset-index.json"
CACHE = ROOT / "out" / "bakeoff-cache"
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
SAME_ROOM_GAP_S = 300


# ── embedders ───────────────────────────────────────────────────────────────
def _norm_batch(crops, h, w):
    arr = np.stack([(cv2.resize(c, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255 - MEAN) / STD for c in crops])
    return torch.from_numpy(arr.transpose(0, 3, 1, 2))


def make_dinov2():
    m = torch.hub.load("facebookresearch/dinov2", "dinov2_vits14", trust_repo=True).eval()
    return lambda crops: m(_norm_batch(crops, 224, 224)).numpy()


def _load_osnet(factory, weights):
    model = factory(num_classes=1000, pretrained=False, loss="softmax")
    state = torch.load(weights, map_location="cpu")
    state = state.get("state_dict", state)
    state = {k.removeprefix("module."): v for k, v in state.items() if not k.removeprefix("module.").startswith("classifier")}
    missing, unexpected = model.load_state_dict(state, strict=False)
    real_missing = [k for k in missing if not k.startswith("classifier")]
    if real_missing or unexpected:
        raise RuntimeError(f"weights did not fit: missing={real_missing[:5]} unexpected={unexpected[:5]}")
    return model.eval()


def make_osnet_ain():
    from osnet_ain import osnet_ain_x1_0
    m = _load_osnet(osnet_ain_x1_0, next((ROOT / "models/reid").glob("osnet_ain_x1_0_msmt17*.pth")))
    # OSNet is trained on 256x128 person crops (tall), not squares.
    return lambda crops: m(_norm_batch(crops, 256, 128)).numpy()


def make_osnet():
    from osnet import osnet_x1_0
    m = _load_osnet(osnet_x1_0, next((ROOT / "models/reid").glob("osnet_x1_0_msmt17*.pth")))
    return lambda crops: m(_norm_batch(crops, 256, 128)).numpy()


def make_hsv():
    B, HB, VB = 4, 6, 4

    def one(c):
        rgb = c.astype(np.float32) / 255
        h, w, _ = rgb.shape
        mx, mn = rgb.max(-1), rgb.min(-1)
        d = mx - mn
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        hue = np.zeros_like(mx)
        m = d > 0
        rm = m & (mx == r); gm = m & (mx == g) & ~rm; bm = m & ~rm & ~gm
        hue[rm] = np.mod((g[rm] - b[rm]) / d[rm], 6); hue[gm] = (b[gm] - r[gm]) / d[gm] + 2; hue[bm] = (r[bm] - g[bm]) / d[bm] + 4
        hue /= 6
        sat = np.where(mx == 0, 0, d / np.where(mx == 0, 1, mx))
        sig = np.zeros(B * (HB + VB), dtype=np.float32)
        band = np.minimum(B - 1, (np.arange(h) / (h / B)).astype(int))
        for i in range(B):
            rows = band == i
            if not rows.any():
                continue
            off = i * (HB + VB)
            hb = np.minimum(HB - 1, (hue[rows] * HB).astype(int))[sat[rows] > 0.2]
            vb = np.minimum(VB - 1, (mx[rows] * VB).astype(int)).ravel()
            cnt = rows.sum() * w
            sig[off:off + HB] = np.bincount(hb.ravel(), minlength=HB)[:HB] / cnt
            sig[off + HB:off + HB + VB] = np.bincount(vb, minlength=VB)[:VB] / cnt
        return sig

    return lambda crops: np.stack([one(c) for c in crops])


METHODS = {"hsv": make_hsv, "dinov2": make_dinov2, "osnet": make_osnet, "osnet_ain": make_osnet_ain}


# ── data ────────────────────────────────────────────────────────────────────
def load_crops():
    random.seed(7)
    samples = json.loads(DATASET.read_text(encoding="utf-8"))["samples"]
    pos, neg, caps = [], [], {}
    for s in samples:
        img = cv2.imread(str(REPO / s["cropPath"].replace("\\", "/")))
        if img is None:
            continue
        pos.append(dict(slug=s["targetSlug"], cls=s["detectedClass"], src=s["sourcePath"], off=s["offsetSeconds"],
                        crop=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
        cap = caps.get(s["sourcePath"]) or cv2.VideoCapture(s["sourcePath"])
        caps[s["sourcePath"]] = cap
        cap.set(cv2.CAP_PROP_POS_MSEC, s["offsetSeconds"] * 1000)
        ok, frame = cap.read()
        if not ok:
            continue
        H, W = frame.shape[:2]
        x0, y0, x1, y1 = s["boxXyxy"]
        bw, bh = x1 - x0, y1 - y0
        got = 0
        for _ in range(40):
            if bw >= W or bh >= H or got == 3:
                break
            nx, ny = random.randint(0, W - bw), random.randint(0, H - bh)
            ix = max(0, min(x1, nx + bw) - max(x0, nx)); iy = max(0, min(y1, ny + bh) - max(y0, ny))
            if ix * iy > 0.05 * bw * bh or bw * bh < 24 * 48:
                continue
            neg.append(dict(cls=s["detectedClass"], crop=cv2.cvtColor(frame[ny:ny + bh, nx:nx + bw], cv2.COLOR_BGR2RGB)))
            got += 1
    for c in caps.values():
        c.release()
    return pos, neg


def embeddings(method, crops, tag):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{method}-{tag}.npy"
    if path.exists():
        return np.load(path)
    fn = METHODS[method]()
    out = []
    with torch.no_grad():
        for i in range(0, len(crops), 32):
            out.append(fn(crops[i:i + 32]))
    arr = np.concatenate(out).astype(np.float32)
    arr /= np.maximum(np.linalg.norm(arr, axis=1, keepdims=True), 1e-9)
    np.save(path, arr)
    return arr


# ── evaluation ──────────────────────────────────────────────────────────────
def evaluate(pos, P, neg, N, regime, group):
    classes = {"people": {"person"}, "pets": {"dog", "cat"}}[group]
    idx = [i for i, p in enumerate(pos) if p["cls"] in classes]

    def allowed(i, j):
        if i == j or pos[j]["cls"] != pos[i]["cls"]:
            return False
        same_src = pos[j]["src"] == pos[i]["src"]
        if regime == "same-room":
            return same_src and abs(pos[j]["off"] - pos[i]["off"]) >= SAME_ROOM_GAP_S
        return not same_src

    def ranked(vec, cls, refs):
        by = {}
        for j in refs:
            if pos[j]["cls"] != cls:
                continue
            s = float(vec @ P[j])
            by[pos[j]["slug"]] = max(by.get(pos[j]["slug"], -1), s)
        return sorted(by.items(), key=lambda kv: -kv[1])

    probes = []
    for i in idx:
        refs = [j for j in range(len(pos)) if allowed(i, j)]
        r = ranked(P[i], pos[i]["cls"], refs)
        # A probe whose true identity has no allowed reference cannot be scored.
        if pos[i]["slug"] not in dict(r):
            continue
        probes.append((pos[i]["slug"], r))
    if not probes:
        return None

    everyone = list(range(len(pos)))
    bg_top = [ranked(N[k], neg[k]["cls"], everyone) for k in range(len(neg)) if neg[k]["cls"] in classes]
    safe = max([r[0][1] for r in bg_top if r] + [0]) + 1e-4

    rank1 = sum(1 for slug, r in probes if r[0][0] == slug)
    named = [(slug, r) for slug, r in probes if r[0][1] >= safe and (len(r) < 2 or r[0][1] - r[1][1] >= 0.02)]
    right = sum(1 for slug, r in named if r[0][0] == slug)
    return dict(probes=len(probes), rank1=rank1, safe=safe, named=len(named), right=right, wrong=len(named) - right)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--methods", nargs="*", default=list(METHODS))
    args = ap.parse_args()

    pos, neg = load_crops()
    print(f"positives {len(pos)}  background patches {len(neg)}")
    print(f"\n{'method':10s} {'regime':11s} {'group':6s} | {'rank1':>9s} | safe thr | named right wrong")
    for method in args.methods:
        P = embeddings(method, [p["crop"] for p in pos], "pos")
        N = embeddings(method, [n["crop"] for n in neg], "neg")
        for regime in ("same-room", "cross-room"):
            for group in ("people", "pets"):
                r = evaluate(pos, P, neg, N, regime, group)
                if r is None:
                    print(f"{method:10s} {regime:11s} {group:6s} | (no scorable probes)")
                    continue
                print(f"{method:10s} {regime:11s} {group:6s} | {r['rank1']:3d}/{r['probes']:<3d}   | {r['safe']:.3f}    | "
                      f"{r['named']:5d} {r['right']:5d} {r['wrong']:5d}")


if __name__ == "__main__":
    main()
