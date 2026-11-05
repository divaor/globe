#!/usr/bin/env python3
"""Köppen–Geiger 0.5° grid -> koppen.png fallback + smoothed polygons (GeoJSON).

Input grid: the CSV string embedded in the npm package koppen-climate-lookup
(dist/index.mjs; Latitude,Longitude,KoppenClass at 0.5° cell centres, land only,
1986–2010, after Kottek et al. 2006 / Rubel et al. 2017).

1. koppen.png: the native grid, 720×360 RGBA, one pixel per 0.5° cell,
   x = lon −180→180, y = lat 90→−90, ocean/no data transparent.
2. Polygons: every class indicator is lightly Gaussian-smoothed on the 0.5°
   grid, bilinearly upsampled ×SCALE and the fine class is the arg-max over
   classes (a soft majority vote, so the classes tile the plane exactly and the
   boundaries are smooth curves instead of 0.5° stair steps). Land classes are
   first extended a few cells offshore (nearest class) and the result is
   clipped to Natural Earth 50m land minus the largest lakes, so coastlines
   match the rest of the app (Antarctic ice shelves count as land, as in the
   grid). The fine raster is polygonised with rasterio
   (exact pixel-edge polygons that tile without gaps) and written as GeoJSON
   in plain lon/lat; simplification, winding and validation happen in
   koppen_topology.mjs.

Usage: python3 -I koppen_raster.py --mjs index.mjs --land ne_50m_land.geojson \
         --lakes ne_50m_lakes.geojson --ice-shelves ne_50m_antarctic_ice_shelves_polys.geojson \
         --classes koppen-classes.json \
         --png koppen.png --geojson work/koppen-fine.geojson [--scale 8]
"""
import argparse
import json
import re

import numpy as np
from PIL import Image
from scipy import ndimage, sparse

NX, NY = 720, 360  # 0.5° grid


def read_grid(mjs_path, codes):
    src = open(mjs_path, encoding="utf-8").read()
    m = re.search(r'var koppen_default = "(Latitude,Longitude,KoppenClass\\n.*?)";', src, re.S)
    if not m:
        raise SystemExit("CSV literal not found in " + mjs_path)
    text = m.group(1).replace("\\n", "\n")
    lines = text.strip().split("\n")[1:]
    grid = np.zeros((NY, NX), np.uint8)
    idx = {c: i + 1 for i, c in enumerate(codes)}
    unknown = set()
    for ln in lines:
        lat, lon, k = ln.split(",")
        lat, lon = float(lat), float(lon)
        r = int(round((89.75 - lat) / 0.5))
        c = int(round((lon + 179.75) / 0.5))
        if k not in idx:
            unknown.add(k)
            continue
        grid[r, c] = idx[k]
    if unknown:
        raise SystemExit("unknown classes: %s" % sorted(unknown))
    return grid, len(lines)


def write_png(grid, colors, path):
    rgba = np.zeros((NY, NX, 4), np.uint8)
    for i, col in enumerate(colors):
        m = grid == i + 1
        rgba[m, :3] = col
        rgba[m, 3] = 255
    Image.fromarray(rgba, "RGBA").save(path, optimize=True)


def interp_matrix(n_coarse, scale, pad, periodic):
    """Sparse (n_coarse*scale) x (n_coarse+2*pad) bilinear matrix, cell-centred."""
    n_fine = n_coarse * scale
    xf = (np.arange(n_fine) + 0.5) / scale - 0.5 + pad  # coarse index space (padded)
    x0 = np.floor(xf).astype(int)
    w1 = xf - x0
    rows = np.repeat(np.arange(n_fine), 2)
    cols = np.stack([x0, x0 + 1], 1).ravel()
    vals = np.stack([1 - w1, w1], 1).ravel()
    ncols = n_coarse + 2 * pad
    cols = np.clip(cols, 0, ncols - 1)
    return sparse.csr_matrix((vals, (rows, cols)), shape=(n_fine, ncols))


def rasterize_land(land_path, lakes_path, w, h, min_lake_area, shelves_path=None):
    import rasterio.features
    from rasterio.transform import from_bounds
    from shapely.geometry import shape
    tr = from_bounds(-180, -90, 180, 90, w, h)
    land = [shape(f["geometry"]) for f in json.load(open(land_path))["features"]]
    if shelves_path:  # the Köppen grid classifies Antarctic ice shelves (EF)
        land += [shape(f["geometry"]) for f in json.load(open(shelves_path))["features"]]
    mask = rasterio.features.rasterize(((g, 1) for g in land), out_shape=(h, w), transform=tr,
                                       fill=0, dtype="uint8").astype(bool)
    lakes = [shape(f["geometry"]) for f in json.load(open(lakes_path))["features"]]
    lakes = [g for g in lakes if g.area >= min_lake_area]
    if lakes:
        lk = rasterio.features.rasterize(((g, 1) for g in lakes), out_shape=(h, w), transform=tr,
                                         fill=0, dtype="uint8").astype(bool)
        mask &= ~lk
    # Antarctica's NE ring stops at −89.9989°; make sure the polar row is land.
    mask[-1, :] |= mask[-2, :]
    return mask, len(lakes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mjs", required=True)
    ap.add_argument("--land", required=True)
    ap.add_argument("--lakes", required=True)
    ap.add_argument("--ice-shelves", help="Natural Earth Antarctic ice shelves (added to land)")
    ap.add_argument("--classes", required=True)
    ap.add_argument("--png", required=True)
    ap.add_argument("--geojson", required=True)
    ap.add_argument("--fine-png", help="optional preview of the fine class raster")
    ap.add_argument("--scale", type=int, default=8)
    ap.add_argument("--sigma", type=float, default=0.4, help="pre-smoothing (0.5° cells)")
    ap.add_argument("--extend", type=float, default=3.0, help="offshore extension (cells)")
    ap.add_argument("--min-lake-area", type=float, default=0.25, help="square degrees")
    a = ap.parse_args()

    legend = json.load(open(a.classes, encoding="utf-8"))
    codes = [k for k in legend if k != "biomes"]
    colors = [tuple(int(legend[k]["color"][i:i + 2], 16) for i in (1, 3, 5)) for k in codes]

    grid, n = read_grid(a.mjs, codes)
    counts = {codes[i]: int((grid == i + 1).sum()) for i in range(len(codes))}
    print("cells:", n, "land cells in grid:", int((grid > 0).sum()))
    print("class counts:", counts)
    write_png(grid, colors, a.png)
    print("wrote", a.png)

    # --- extend classes offshore (nearest land cell, periodic in longitude) ---
    pad = 16
    gp = np.concatenate([grid[:, -pad:], grid, grid[:, :pad]], axis=1)
    dist, (iy, ix) = ndimage.distance_transform_edt(gp == 0, return_indices=True)
    ext = gp[iy, ix]
    ext[dist > a.extend] = 0

    # --- soft majority: smoothed indicators, bilinear upsampling, argmax ---
    S = a.scale
    W, H = NX * S, NY * S
    Wx = interp_matrix(NX, S, pad, True)          # W x (NX+2pad)
    # rows: pad by edge replication (poles) -> handle with a 1-cell pad
    rpad = 1
    Wy = interp_matrix(NY, S, rpad, False)        # H x (NY+2)
    best = np.zeros((H, W), np.float32)
    cls = np.zeros((H, W), np.uint8)
    for i in range(len(codes)):
        ind = (ext == i + 1).astype(np.float32)
        if not ind.any():
            continue
        if a.sigma > 0:
            ind = ndimage.gaussian_filter(ind, a.sigma, mode=("nearest", "wrap"))
        ind = np.pad(ind, ((rpad, rpad), (0, 0)), mode="edge")
        fine = (Wy @ (Wx @ ind.T).T).astype(np.float32)  # H x W
        upd = fine > best
        best[upd] = fine[upd]
        cls[upd] = i + 1
    cls[best < 0.05] = 0

    land, nlakes = rasterize_land(a.land, a.lakes, W, H, a.min_lake_area, a.ice_shelves)
    print("land mask: %.1f%% of pixels, %d lakes removed" % (100 * land.mean(), nlakes))
    cls[~land] = 0
    if a.ice_shelves:
        # inner parts of the big ice shelves (Ross, Ronne-Filchner) lie > 1.5° from any grid
        # cell: give them the nearest class south of 60°S (EF along the whole coast)
        j0 = int(H * 150 / 180)
        sub = cls[j0:]
        gap = land[j0:] & (sub == 0)
        if gap.any():
            _, (iy, ix) = ndimage.distance_transform_edt(sub == 0, return_indices=True)
            sub[gap] = sub[iy[gap], ix[gap]]
            print("ice-shelf pixels filled with the nearest class: %d (%s)" % (
                int(gap.sum()), ", ".join(sorted({codes[v - 1] for v in np.unique(sub[gap])}))))
    uncovered = land & (cls == 0)
    print("NE land pixels without a class (far from any grid cell, dropped): %d" % int(uncovered.sum()))

    if a.fine_png:
        pal = np.zeros((256, 3), np.uint8)
        pal[0] = (20, 40, 70)
        for i, col in enumerate(colors):
            pal[i + 1] = col
        Image.fromarray(pal[cls]).resize((W // 2, H // 2), Image.NEAREST).save(a.fine_png)

    # --- polygonise ---
    import rasterio.features
    from rasterio.transform import from_bounds
    tr = from_bounds(-180, -90, 180, 90, W, H)
    per_class = {}
    for geom, val in rasterio.features.shapes(cls, mask=cls > 0, connectivity=4, transform=tr):
        per_class.setdefault(int(val), []).append(geom["coordinates"])
    feats = []
    for v in sorted(per_class):
        polys = per_class[v]
        feats.append({"type": "Feature", "properties": {"k": codes[v - 1]},
                      "geometry": {"type": "MultiPolygon", "coordinates": polys}})
    nverts = sum(len(r) for f in feats for p in f["geometry"]["coordinates"] for r in p)
    with open(a.geojson, "w") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, separators=(",", ":"))
    # expected spherical areas (steradians) per class from the fine raster, for validation
    lat_c = 90 - (np.arange(H) + 0.5) * 180 / H
    pix_sr = np.radians(360 / W) * (np.sin(np.radians(lat_c + 90 / H)) - np.sin(np.radians(lat_c - 90 / H)))
    areas = {}
    for v in sorted(per_class):
        areas[codes[v - 1]] = float((pix_sr[:, None] * (cls == v)).sum())
    with open(a.geojson.replace(".geojson", "-areas.json"), "w") as f:
        json.dump(areas, f, indent=0)
    print("wrote", a.geojson, len(feats), "features,", nverts, "vertices")


if __name__ == "__main__":
    main()
