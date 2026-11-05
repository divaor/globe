#!/usr/bin/env python3
"""
End-to-end accuracy check of the shipped paleo data against pygplates.

Takes interior points of the output coastline polygons, finds the ORIGINAL source feature
(and plate id) containing each point with pygplates' own partitioner, then compares
  ours:  slerp of the keyframed quaternions in paleo-rotations.json (as the browser does)
  truth: pygplates RotationModel.get_rotation(t, original_plate_id) applied to the point
at the preview times plus random times in between keyframes.

  python3 -I scripts/data/paleo/compare_pygplates.py --src <Merdith dir> --data public/data/paleo
"""
import argparse
import json
import math
import pathlib
import random

import numpy as np
import pygplates
from shapely.geometry import shape

PREVIEW_TIMES = [0, 66, 150, 200, 250, 300, 600, 1000]


def decode_topojson(topo, name):
    (sx, sy), (tx, ty) = topo["transform"]["scale"], topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(r):
        pts = []
        for i in r:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts.extend(a if not pts else a[1:])
        return pts

    feats = []
    for g in topo["objects"][name]["geometries"]:
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
        coords = [[ring(r) for r in poly] for poly in polys]
        feats.append((g["properties"], shape({"type": "MultiPolygon", "coordinates": coords})))
    return feats


def quat_at(rot, pid, t):
    T = np.asarray(rot["times"], float)
    q = np.asarray(rot["plates"][str(pid)], float).reshape(-1, 4)
    if t <= T[0]:
        return q[0]
    if t >= T[-1]:
        return q[-1]
    i = int(np.searchsorted(T, t, side="right") - 1)
    f = (t - T[i]) / (T[i + 1] - T[i])
    a, b = q[i], q[i + 1]
    d = float(a @ b)
    if d < 0:
        b, d = -b, -d
    if d > 0.9999995:
        r = (1 - f) * a + f * b
    else:
        th = math.acos(d)
        r = (math.sin((1 - f) * th) * a + math.sin(f * th) * b) / math.sin(th)
    return r / np.linalg.norm(r)


def rotate(q, v):
    w, u = q[0], q[1:]
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--points", type=int, default=150)
    ap.add_argument("--random-times", type=int, default=30)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()
    src, data = pathlib.Path(args.src), pathlib.Path(args.data)
    rng = random.Random(args.seed)

    rot = json.loads((data / "paleo-rotations.json").read_text())
    topo = json.loads((data / "paleo-coastlines.json").read_text())
    feats = decode_topojson(topo, "coastlines")
    rm = pygplates.RotationModel(str(src / "1000_0_rotfile_Merdith_et_al.rot"))
    source = pygplates.FeatureCollection(str(src / "shapes_coastlines_Merdith_et_al_v2.gpmlz"))
    partitioner = pygplates.PlatePartitioner(source, rm)

    # discontinuities of the model (rotation jumps at knot times), to label errors
    knots = sorted({round(float(l.split()[1]), 4) for l in open(src / "1000_0_rotfile_Merdith_et_al.rot")
                    if len(l.split()) >= 6 and not l.startswith("999")})

    # one interior point of every feature (largest part), plus extra area-weighted points
    picks = [(p, max(getattr(g, "geoms", [g]), key=lambda x: x.area)) for p, g in feats]
    weighted = [(p, g) for p, g in feats if g.area > 0.05]
    picks += rng.choices(weighted, weights=[g.area for p, g in weighted], k=args.points)
    errs, worst, n_skip = [], [], 0
    for props, g in picks:
        pt = g.representative_point()
        if abs(pt.y) > 85:
            n_skip += 1
            continue
        pos = pygplates.PointOnSphere(pt.y, pt.x)
        part = partitioner.partition_point(pos)
        if part is None:
            n_skip += 1
            continue
        orig = part.get_feature().get_reconstruction_plate_id()
        b = min(float(props["b"]), 1000.0)
        times = [t for t in PREVIEW_TIMES if props["e"] <= t <= b]
        times += [rng.uniform(props["e"], b) for _ in range(args.random_times)]
        v = np.array(pos.to_xyz())
        for t in times:
            truth_rot = rm.get_rotation(t, orig, use_identity_for_missing_plate_ids=False)
            if truth_rot is None:
                continue
            truth = np.array((truth_rot * pos).to_xyz())
            ours = rotate(quat_at(rot, props["p"], t), v)
            ang = math.degrees(math.atan2(np.linalg.norm(np.cross(ours, truth)), float(ours @ truth)))
            near_jump = any(abs(t - k) < 0.5 and k > 0 for k in knots) and ang > 0.3
            errs.append((ang, t, orig, props["p"], near_jump))
    a = np.array([e[0] for e in errs])
    clean = np.array([e[0] for e in errs if not e[4]])
    errs.sort(key=lambda e: -e[0])
    print(f"compared {len(errs)} (point, time) pairs from {len(picks) - n_skip} points "
          f"({len(set(e[2] for e in errs))} original plate ids)")
    print(f"max angular error {clean.max():.4f} deg (mean {clean.mean():.4f}, "
          f"99th pct {np.percentile(clean, 99):.4f}); preview times only: "
          f"{max(e[0] for e in errs if e[1] in PREVIEW_TIMES and not e[4]):.5f} deg")
    print(f"incl. times within 0.5 Myr of a model discontinuity: max {a.max():.3f} deg "
          f"({sum(e[4] for e in errs)} such samples)")
    for e in errs[:5]:
        print(f"  worst: {e[0]:.4f} deg at {e[1]:.2f} Ma, original plate {e[2]} -> track {e[3]}"
              + (" (discontinuity window)" if e[4] else ""))


if __name__ == "__main__":
    main()
