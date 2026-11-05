#!/usr/bin/env python3
"""Independent check of koppen.json (planar lon/lat, shapely): decode the TopoJSON,
every polygon must be valid, polygons must not overlap, every class of the grid
must be present, and the class drawn at each 0.5° land cell centre should match
koppen.png for most cells (boundaries are smoothed and coastlines follow
Natural Earth, so a few % of cells differ).

Usage: python3 -I validate_koppen.py koppen.json koppen.png koppen-classes.json
"""
import json
import sys

import numpy as np
from PIL import Image
from shapely import STRtree, points
from shapely.geometry import MultiPolygon, Polygon
from shapely.validation import explain_validity


def decode(topo):
    tr = topo.get("transform")
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for p in arc:
            if tr:
                x += p[0]
                y += p[1]
                pts.append((x * tr["scale"][0] + tr["translate"][0], y * tr["scale"][1] + tr["translate"][1]))
            else:
                pts.append((p[0], p[1]))
        arcs.append(pts)

    def ring(idx):
        out = []
        for i in idx:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(a if not out else a[1:])
        return out

    feats = []
    for g in topo["objects"]["koppen"]["geometries"]:
        polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
        feats.append((g["properties"]["k"], [[ring(r) for r in poly] for poly in polys]))
    return feats


def main():
    topo = json.load(open(sys.argv[1]))
    png = np.array(Image.open(sys.argv[2]).convert("RGBA"))
    legend = json.load(open(sys.argv[3], encoding="utf-8"))
    color_to_code = {tuple(int(v["color"][i:i + 2], 16) for i in (1, 3, 5)): k for k, v in legend.items() if k != "biomes"}

    feats = decode(topo)
    polys, owner = [], []
    invalid = 0
    for k, mp in feats:
        for rings in mp:
            p = Polygon(rings[0], rings[1:])
            if not p.is_valid:
                invalid += 1
                print("invalid", k, explain_validity(p))
            polys.append(p)
            owner.append(k)
    tree = STRtree(polys)
    overlap = 0.0
    for i, p in enumerate(polys):
        for j in tree.query(p):
            if j > i:
                overlap += p.intersection(polys[j]).area
    codes_png = {color_to_code[tuple(c)] for c in png[png[..., 3] > 0][:, :3].reshape(-1, 3)}
    codes_json = {k for k, _ in feats}

    # class at every land cell centre of the 0.5° grid
    H, W = png.shape[:2]
    jj, ii = np.nonzero(png[..., 3] > 0)
    lon = -180 + (ii + 0.5) * 360 / W
    lat = 90 - (jj + 0.5) * 180 / H
    pts = points(np.stack([lon, lat], 1))
    hit = np.full(len(pts), "", object)
    for pi, (idx_pt, idx_poly) in enumerate(zip(*tree.query(pts, predicate="intersects"))):
        hit[idx_pt] = owner[idx_poly]
    truth = np.array([color_to_code[tuple(c)] for c in png[jj, ii, :3]], object)
    covered = hit != ""
    agree = (hit == truth) & covered
    print("polygons %d, invalid %d, total pairwise overlap %.2e deg²" % (len(polys), invalid, overlap))
    print("classes in png %d, in json %d, missing in json: %s" % (len(codes_png), len(codes_json), sorted(codes_png - codes_json) or "none"))
    print("0.5° land cells: %d; centre inside a polygon %.2f%%; same class as koppen.png %.3f%% of those"
          % (len(pts), 100 * covered.mean(), 100 * agree.sum() / max(covered.sum(), 1)))
    ok = invalid == 0 and overlap < 1e-6 and not (codes_png - codes_json) and agree.sum() / max(covered.sum(), 1) > 0.9
    print("OK" if ok else "CHECK FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
