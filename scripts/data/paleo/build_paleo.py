#!/usr/bin/env python3
"""
Build the "Pangea to modern continents" data for Atlas Globe from the
Merdith et al. (2021) full-plate model (1000-0 Ma, CC BY 4.0).

Outputs (written to --out):
  paleo-coastlines.json  TopoJSON, object "coastlines" (present-day coastline polygons)
  paleo-continents.json  TopoJSON, object "continents" (continental crust / shelf polygons)
  paleo-rotations.json   keyframed unit quaternions (total rotation to anchor plate 0)

Each polygon feature carries {p, b, e}: p = plate id whose rotation track moves it
(a key of paleo-rotations.json "plates"), b = appearance age (Ma, 4000 = present for
the whole 1000 Ma range), e = end age (Ma). Show a feature at time t only when e <= t <= b.

Needs pygplates, numpy and shapely (pip) plus Node with the repo's devDependencies
(mapshaper, topojson-server/-client, d3-geo, d3-geo-projection).
Run with the isolated flag so nothing is imported from the data directory:

  python3 -I scripts/data/paleo/build_paleo.py --src <dir with the Merdith files> \
      --out public/data/paleo [--work <scratch dir>]
"""
import argparse
import collections
import json
import math
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time as _time

import numpy as np
import pygplates
import shapely
from shapely.geometry import MultiPolygon, Polygon, mapping
from shapely.geometry.polygon import orient

ROT_FILE = "1000_0_rotfile_Merdith_et_al.rot"
COAST_FILE = "shapes_coastlines_Merdith_et_al_v2.gpmlz"
STATIC_FILE = "shapes_static_polygons_Merdith_et_al.gpmlz"

T_MAX = 1000.0          # oldest time we animate (Ma)
ALWAYS = 4000.0         # "b" value for features present over the whole range
FINE_STEP = 0.5         # Myr; candidate keyframes = this grid + every knot time in the .rot file
VERIFY_STEP = 0.1       # Myr; grid used to measure the final interpolation error
SAMPLE_POINTS = 32      # points per plate used to measure displacement errors
EARTH_R = 6371.0

MODEL = "Merdith et al. 2021"
CITATION = (
    "Merdith, A. S., Williams, S. E., Collins, A. S., Tetley, M. G., Mulder, J. A., "
    "Blades, M. L., Young, A., Armistead, S. E., Cannon, J., Zahirovic, S., Müller, R. D. "
    "(2021). Extending full-plate tectonic models into deep time: Linking the "
    "Neoproterozoic and the Phanerozoic. Earth-Science Reviews, 214, 103477. "
    "https://doi.org/10.1016/j.earscirev.2020.103477"
)


def log(*a):
    print(*a, flush=True)


# --------------------------------------------------------------------------- quaternions

def rot_to_quat(r):
    """pygplates FiniteRotation -> unit quaternion (w, x, y, z); P_t = q P q^-1."""
    if r.represents_identity_rotation():
        return np.array([1.0, 0.0, 0.0, 0.0])
    pole, ang = r.get_euler_pole_and_angle()
    return np.r_[math.cos(ang / 2.0), math.sin(ang / 2.0) * np.asarray(pole.to_xyz())]


def qmul(a, b):
    w1, x1, y1, z1 = np.moveaxis(a, -1, 0)
    w2, x2, y2, z2 = np.moveaxis(b, -1, 0)
    return np.stack([
        w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
        w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
        w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
        w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
    ], -1)


def qconj(a):
    return a * np.array([1.0, -1.0, -1.0, -1.0])


def slerp(qa, qb, f):
    """Shortest-path slerp, exactly what the browser does."""
    dot = np.sum(qa * qb, axis=-1, keepdims=True)
    qb = np.where(dot < 0, -qb, qb)
    dot = np.abs(dot).clip(0.0, 1.0)
    th = np.arccos(dot)
    s = np.sin(th)
    small = s < 1e-9
    wa = np.where(small, 1.0 - f, np.sin((1.0 - f) * th) / np.where(small, 1.0, s))
    wb = np.where(small, f, np.sin(f * th) / np.where(small, 1.0, s))
    q = wa * qa + wb * qb
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def displacement_deg(q_approx, q_true, pts):
    """Max angular distance (deg) between q_approx·P and q_true·P over sample points.

    q_*: (..., P, 4); pts: (P, N, 3). Uses D = q_true^-1 q_approx: |vec(D) x P| = sin(phi/2).
    """
    d = qmul(qconj(q_true), q_approx)
    v = d[..., 1:] * np.where(d[..., :1] < 0, -1.0, 1.0)
    cr = np.cross(v[..., None, :], pts)
    return np.degrees(2.0 * np.arcsin(np.linalg.norm(cr, axis=-1).clip(0.0, 1.0))).max(-1)


# --------------------------------------------------------------------------- features

def valid_time(f):
    b, e = f.get_valid_time()
    b = ALWAYS if pygplates.GeoTimeInstant(b).is_distant_past() else float(b)
    e = 0.0 if pygplates.GeoTimeInstant(e).is_distant_future() else float(e)
    return b, max(e, 0.0)


MAX_SEG = math.radians(0.5)   # densify great-circle edges longer than this


def _edge_points(a, b):
    """Intermediate (lon, lat) points along the great circle a->b (endpoints excluded).

    GPlates edges are great-circle arcs, while shapely works in planar lon/lat, so long
    edges (and especially edges near the poles) are densified before any planar step.
    Computed from a canonical endpoint so a shared edge yields bit-identical points from
    both neighbouring polygons; longitudes are unwrapped so ±180° seams stay on their side.
    """
    lo, hi = (a, b) if a <= b else (b, a)
    va, vb = lonlat_to_xyz([lo])[0], lonlat_to_xyz([hi])[0]
    ang = math.acos(max(-1.0, min(1.0, float(va @ vb))))
    n = int(math.ceil(ang / MAX_SEG))
    if n <= 1:
        return []
    s = math.sin(ang)
    pts, prev = [], lo[0]
    for j in range(1, n):
        f = j / n
        v = (math.sin((1 - f) * ang) * va + math.sin(f * ang) * vb) / s
        lon = math.degrees(math.atan2(v[1], v[0]))
        lon += 360.0 * round((prev - lon) / 360.0)
        prev = lon
        pts.append((lon, math.degrees(math.asin(max(-1.0, min(1.0, v[2]))))))
    return pts if a <= b else pts[::-1]


def densify(ring):
    out = []
    for i, a in enumerate(ring):
        out.append(a)
        out.extend(_edge_points(a, ring[(i + 1) % len(ring)]))
    # A vertex on a pole has no meaningful longitude: in planar lon/lat it becomes an edge
    # along lat = ±90 between its neighbours' meridians (as in Natural Earth's Antarctica).
    res = []
    for i, (lon, lat) in enumerate(out):
        if abs(lat) > 89.99999:
            pole = math.copysign(90.0, lat)
            l0, l1 = out[i - 1][0], out[(i + 1) % len(out)][0]
            res.append((l0, pole))
            if l1 != l0:
                res.append((l1, pole))
        else:
            res.append((lon, lat))
    return res


def to_shapely(g):
    """PolygonOnSphere -> shapely Polygon in lon/lat (source data is already cut at ±180°)."""
    def ring(points):
        return densify([(lon, lat) for lat, lon in (pt.to_lat_lon() for pt in points)])

    ext = ring(g.get_exterior_ring_points())
    holes = [ring(g.get_interior_ring_points(i)) for i in range(g.get_number_of_interior_rings())]
    if len(ext) < 3:
        return []
    poly = Polygon(ext, [h for h in holes if len(h) >= 3])
    if not poly.is_valid:
        poly = shapely.make_valid(poly)
    return [p for p in getattr(poly, "geoms", [poly]) if isinstance(p, Polygon) and p.area > 0]


def collect(fc, layer, keep, fixes):
    recs = []
    for f in fc:
        ftype = str(f.get_feature_type())
        b, e = valid_time(f)
        if not keep(ftype, b):
            continue
        if b == 0.0 and ftype != "gpml:Basin":
            # FROMAGE=0 placeholders on continental crust (Benue Trough, Ahnet, Barghot,
            # North Bismarck arc): would vanish for any t > 0 and punch holes in Africa.
            fixes[(f.get_name(), f.get_reconstruction_plate_id())] += 1
            b = ALWAYS
        polys = []
        for g in f.get_geometries():
            if isinstance(g, pygplates.PolygonOnSphere):
                polys += to_shapely(g)
        if polys:
            recs.append(dict(layer=layer, plate=int(f.get_reconstruction_plate_id()), b=b, e=e,
                             polys=polys, name=f.get_name(), type=ftype))
    return recs


# --------------------------------------------------------------------------- rotations

def rotation_knots(rot_path):
    knots = set()
    with open(rot_path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            s = line.split()
            if len(s) >= 6 and not s[0].startswith("999"):
                try:
                    knots.add(round(float(s[1]), 4))
                except ValueError:
                    pass
    return knots


def sample_rotations(rm, plates, times):
    """Q[t, plate] quaternion and M[t, plate] = rotation missing (plate not in the tree)."""
    Q = np.zeros((len(times), len(plates), 4))
    M = np.zeros((len(times), len(plates)), bool)
    for i, t in enumerate(times):
        for j, p in enumerate(plates):
            r = rm.get_rotation(float(t), int(p), anchor_plate_id=0,
                                use_identity_for_missing_plate_ids=False)
            if r is None:
                M[i, j] = True
                Q[i, j] = (1.0, 0.0, 0.0, 0.0)
            else:
                Q[i, j] = rot_to_quat(r)
    return Q, M


def hold_and_align(Q, M):
    """Hold the last valid rotation where missing; make consecutive quaternions sign-consistent."""
    Q = Q.copy()
    for i in range(1, Q.shape[0]):
        Q[i][M[i]] = Q[i - 1][M[i]]
        s = np.where(np.sum(Q[i] * Q[i - 1], axis=1) < 0, -1.0, 1.0)
        Q[i] *= s[:, None]
    return Q


def farthest_points(xyz, n):
    xyz = np.unique(np.round(xyz, 7), axis=0)
    c = xyz.mean(0)
    sel = [int(np.argmax(np.linalg.norm(xyz - c, axis=1)))]
    dmin = np.linalg.norm(xyz - xyz[sel[0]], axis=1)
    while len(sel) < min(n, len(xyz)):
        k = int(np.argmax(dmin))
        sel.append(k)
        dmin = np.minimum(dmin, np.linalg.norm(xyz - xyz[k], axis=1))
    sel = (sel * n)[:n]
    return xyz[sel]


def d3_ring_sum(ring):
    """Port of d3-geo's area accumulator for one ring; summed over a polygon's rings it is
    > 0 for d3's winding (clockwise exterior) and < 0 when d3 would see the polygon inverted."""
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 3:
        return 0.0
    lam0 = math.radians(ring[0][0])
    phi = math.radians(ring[0][1]) / 2 + math.pi / 4
    cos0, sin0 = math.cos(phi), math.sin(phi)
    terms = []
    for lon, lat in ring[1:] + ring[:1]:
        lam = math.radians(lon)
        phi = math.radians(lat) / 2 + math.pi / 4
        d = lam - lam0
        sd = 1.0 if d >= 0 else -1.0
        ad = sd * d
        c, s = math.cos(phi), math.sin(phi)
        k = sin0 * s
        terms.append(math.atan2(k * sd * math.sin(ad), cos0 * c + k * math.cos(ad)))
        lam0, cos0, sin0 = lam, c, s
    return math.fsum(terms)


def fix_topojson_winding(path, objname):
    """Make every polygon wind the way d3-geo expects (reverse inverted ones in place)."""
    topo = json.load(open(path))
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

    def ring_coords(ring):
        pts = []
        for i in ring:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts.extend(a if not pts else a[1:])
        return pts

    flipped, bad = 0, 0
    for g in topo["objects"][objname]["geometries"]:
        if g["type"] not in ("Polygon", "MultiPolygon"):
            continue
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
        for poly in polys:
            s = sum(d3_ring_sum(ring_coords(r)) for r in poly)
            if s < 0:
                for k, r in enumerate(poly):
                    poly[k] = [~i for i in reversed(r)]
                flipped += 1
                if sum(d3_ring_sum(ring_coords(r)) for r in poly) < 0:
                    bad += 1
    with open(path, "w") as fh:
        json.dump(topo, fh, separators=(",", ":"))
    return flipped, bad


def lonlat_to_xyz(coords):
    a = np.radians(np.asarray(coords, float))
    lon, lat = a[:, 0], a[:, 1]
    return np.c_[np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)]


# --------------------------------------------------------------------------- main

def main():
    here = pathlib.Path(__file__).resolve()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="directory holding the three Merdith 2021 files")
    ap.add_argument("--out", required=True, help="output directory (public/data/paleo)")
    ap.add_argument("--work", help="scratch directory for intermediate GeoJSON")
    ap.add_argument("--mapshaper", default=str(here.parents[3] / "node_modules" / ".bin" / "mapshaper"))
    ap.add_argument("--node", default=shutil.which("node") or "node")
    ap.add_argument("--tolerance", type=float, default=0.25, help="max slerp error (deg)")
    ap.add_argument("--tolerance-deep", type=float, default=None,
                    help="max slerp error (deg) for times older than --deep-after (default: --tolerance)")
    ap.add_argument("--deep-after", type=float, default=541.0, help="Ma; start of 'deep time'")
    ap.add_argument("--coast-interval", default="4km", help="mapshaper simplify interval, coastlines")
    ap.add_argument("--coast-min-island", default="40km2", help="drop detached islands below this")
    ap.add_argument("--cont-interval", default="9km", help="mapshaper simplify interval, continents")
    ap.add_argument("--cont-min-island", default="150km2")
    args = ap.parse_args()

    src, out = pathlib.Path(args.src), pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    work = pathlib.Path(args.work or tempfile.mkdtemp(prefix="paleo-"))
    work.mkdir(parents=True, exist_ok=True)
    t_start = _time.time()

    rm = pygplates.RotationModel(str(src / ROT_FILE), reconstruction_tree_cache_size=4)
    coast_fc = pygplates.FeatureCollection(str(src / COAST_FILE))
    static_fc = pygplates.FeatureCollection(str(src / STATIC_FILE))

    fixes = collections.Counter()
    recs = collect(coast_fc, "coastlines", lambda ty, b: True, fixes)
    # Continental crust = static polygons minus oceanic crust ("gpml:Basin"). The only two Basin
    # polygons older than 300 Ma (East Greenland margin, 600 Ma; south of Java, 410 Ma) are kept.
    recs += collect(static_fc, "continents", lambda ty, b: ty != "gpml:Basin" or b >= 300.0, fixes)
    log(f"features: coastlines {sum(r['layer'] == 'coastlines' for r in recs)}, "
        f"continents {sum(r['layer'] == 'continents' for r in recs)}")
    for (name, pid), n in sorted(fixes.items()):
        log(f"  data fix: FROMAGE=0 on non-oceanic feature '{name}' (plate {pid}) x{n} -> always present")

    # ---- rotation coverage on the fine grid --------------------------------------------
    knots = rotation_knots(src / ROT_FILE)
    grid = np.array(sorted(set(np.round(np.arange(0.0, T_MAX + 1e-9, FINE_STEP), 4))
                           | {k for k in knots if 0.0 <= k <= T_MAX}))
    plates_all = sorted({r["plate"] for r in recs})
    log(f"sampling {len(plates_all)} plates x {len(grid)} times ...")
    Q, M = sample_rotations(rm, plates_all, grid)
    col = {p: j for j, p in enumerate(plates_all)}
    nonid = [p for p in plates_all if abs(abs(Q[0, col[p], 0]) - 1.0) > 1e-9]
    if nonid:
        log(f"  WARNING plates with a non-identity present-day rotation: {nonid}")
    coverage = {}
    for p, j in col.items():
        miss = np.flatnonzero(M[:, j])
        if len(miss) and miss[0] == 0:
            coverage[p] = -1.0
        else:
            coverage[p] = float(grid[miss[0] - 1]) if len(miss) else T_MAX

    # ---- effective validity: clip appearance to how far back the plate has rotations ----
    kept = []
    clipped = collections.Counter()
    for r in recs:
        cov = coverage[r["plate"]]
        b = r["b"]
        if b >= T_MAX and cov >= T_MAX:
            b = ALWAYS
        elif b > cov:
            clipped[r["layer"]] += 1
            b = cov
        if b < r["e"] or b < 0:
            continue
        r["b"] = round(b, 3)
        r["e"] = round(r["e"], 3)
        kept.append(r)
    recs = kept
    log(f"  features clipped to rotation coverage: {dict(clipped)}; kept {len(recs)}")

    # ---- share identical rotation tracks ---------------------------------------------
    Qh = hold_and_align(Q, M)
    vmax = collections.defaultdict(float)
    for r in recs:
        vmax[r["plate"]] = max(vmax[r["plate"]], min(r["b"], T_MAX))
    order = sorted(vmax, key=lambda p: (-vmax[p], p))
    canon, reps = {}, []
    for p in order:
        w = grid <= vmax[p] + 1e-9
        hit = None
        for c in reps:
            if vmax[c] + 1e-9 < vmax[p]:
                continue
            d = qmul(qconj(Qh[w, col[c]]), Qh[w, col[p]])
            if np.max(np.linalg.norm(d[:, 1:], axis=1)) < 5e-7:   # < 0.00006 deg everywhere
                hit = c
                break
        if hit is None:
            reps.append(p)
            canon[p] = p
        else:
            canon[p] = hit
    log(f"  rotation tracks: {len(reps)} distinct for {len(vmax)} plate ids")
    for r in recs:
        r["p"] = canon[r["plate"]]

    # ---- dissolve pieces that move together and share validity ----------------------
    groups = collections.defaultdict(list)
    for r in recs:
        groups[(r["layer"], r["p"], r["b"], r["e"])].extend(r["polys"])
    layers = collections.defaultdict(list)
    for (layer, p, b, e), polys in sorted(groups.items()):
        u = shapely.unary_union(polys)
        parts = [g for g in getattr(u, "geoms", [u]) if isinstance(g, Polygon) and not g.is_empty]
        if not parts:
            continue
        parts = [orient(g, sign=-1.0) for g in parts]   # d3-geo: clockwise exterior rings
        geom = parts[0] if len(parts) == 1 else MultiPolygon(parts)
        props = {"p": p, "b": int(b) if float(b).is_integer() else b, "e": int(e) if float(e).is_integer() else e}
        layers[layer].append({"type": "Feature", "properties": props, "geometry": mapping(geom)})
    for layer, feats in layers.items():
        log(f"  {layer}: {len(feats)} dissolved features")
        with open(work / f"{layer}.geojson", "w") as fh:
            json.dump({"type": "FeatureCollection", "features": feats}, fh, separators=(",", ":"))

    # ---- simplify + TopoJSON with mapshaper ------------------------------------------
    settings = {
        "coastlines": (args.coast_min_island, args.coast_interval, "paleo-coastlines.json"),
        "continents": (args.cont_min_island, args.cont_interval, "paleo-continents.json"),
    }
    used_plates = set()
    for layer, (min_island, interval, fname) in settings.items():
        cmd = [args.mapshaper, "-i", str(work / f"{layer}.geojson"), f"name={layer}",
               "-filter-islands", f"min-area={min_island}", "remove-empty",
               "-simplify", f"interval={interval}", "keep-shapes",
               "-filter", "!this.isNull",
               "-o", str(out / fname), "format=topojson", "quantization=100000", "force"]
        log("  $ " + " ".join(cmd[1:]))
        subprocess.run(cmd, check=True)
        # remove ±180°/pole cut lines and rebuild the topology (Node: d3-geo-projection geoStitch)
        subprocess.run([args.node, str(here.parent / "stitch_paleo.mjs"), str(out / fname), layer,
                        str(out / fname)], check=True, cwd=str(here.parents[3]))
        flipped, bad = fix_topojson_winding(out / fname, layer)
        log(f"  winding: {flipped} polygon(s) reversed for d3" + (f", {bad} STILL INVERTED" if bad else ""))
        topo = json.load(open(out / fname))
        geoms = topo["objects"][layer]["geometries"]
        used_plates |= {g["properties"]["p"] for g in geoms}
        log(f"  {fname}: {os.path.getsize(out / fname) / 1024:.0f} KB, {len(geoms)} features, "
            f"{sum(len(a) for a in topo['arcs'])} points")

    # ---- keyframes ------------------------------------------------------------------
    plates = sorted(used_plates)
    cols = np.array([col[p] for p in plates])
    Qp = Qh[:, cols]
    win = np.array([vmax[p] for p in plates])       # plate is visible somewhere in [0, win]
    pts = collections.defaultdict(list)
    for layer, feats in layers.items():
        for ft in feats:
            g = ft["geometry"]
            rings = [g["coordinates"][0]] if g["type"] == "Polygon" else [pp[0] for pp in g["coordinates"]]
            for ring in rings:
                pts[ft["properties"]["p"]].append(lonlat_to_xyz(ring))
    S = np.stack([farthest_points(np.concatenate(pts[p]), SAMPLE_POINTS) for p in plates])

    def interval_error(a, b):
        if b - a < 2:
            return 0.0
        ks = np.arange(a + 1, b)
        active = grid[a] <= win + 1e-9            # plates visible somewhere in the interval
        if not active.any():
            return 0.0
        f = ((grid[ks] - grid[a]) / (grid[b] - grid[a]))[:, None, None]
        qi = slerp(Qp[a, active][None], Qp[b, active][None], f)
        e = displacement_deg(qi, Qp[ks][:, active], S[active][None])
        e = np.where(grid[ks][:, None] <= win[active][None] + 1e-9, e, 0.0)
        return float((e / tol_at(grid[ks])[:, None]).max())   # <= 1 means within tolerance

    tol = args.tolerance
    tol_deep = args.tolerance_deep if args.tolerance_deep is not None else tol

    def tol_at(t):
        return np.where(t > args.deep_after, tol_deep, tol)

    max_span = 50.0
    keys, a, T = [0], 0, len(grid)
    while a < T - 1:
        lo, step, hi = a + 1, 1, None
        while True:
            bb = min(a + step, T - 1)
            if grid[bb] - grid[a] <= max_span and interval_error(a, bb) <= 1.0:
                lo = bb
                if bb == T - 1:
                    break
                step *= 2
            else:
                hi = bb
                break
        if hi is not None:
            while hi - lo > 1:
                mid = (lo + hi) // 2
                if grid[mid] - grid[a] <= max_span and interval_error(a, mid) <= 1.0:
                    lo = mid
                else:
                    hi = mid
        keys.append(lo)
        a = lo
    times = grid[keys]
    log(f"keyframes: {len(times)} (tolerance {tol} deg, {tol_deep} deg before {args.deep_after:g} Ma)")

    # ---- rotations JSON -----------------------------------------------------------------
    def num(x):
        x = round(float(x), 5)
        if x == 0:
            return "0"
        s = f"{x:.5f}".rstrip("0").rstrip(".")
        return s

    def tnum(t):
        t = round(float(t), 3)
        return str(int(t)) if t.is_integer() else repr(t)

    plate_json = []
    padded = 0
    for j, p in enumerate(plates):
        vals, prev = [], None
        for i, k in enumerate(keys):
            if i > 0 and times[i - 1] >= win[j] - 1e-9 and win[j] < T_MAX:
                q = np.array([1.0, 0.0, 0.0, 0.0])      # never shown: all features hidden
                padded += 1
            else:
                q = Qp[k, j]
            if prev is not None and np.dot(q, prev) < 0:
                q = -q
            prev = q
            vals.append(",".join(num(c) for c in q))
        plate_json.append(f'"{p}":[' + ",".join(vals) + "]")
    head = {
        "model": MODEL,
        "citation": CITATION,
        "license": "CC BY 4.0",
        "source": "1000_0_rotfile_Merdith_et_al.rot (GPlates web service repository)",
        "anchor": 0,
        "note": ("Unit quaternions [w,x,y,z] per entry of times (Ma, ascending, non-uniform). "
                 "P_t = q P q^-1 with P = (cos lat cos lon, cos lat sin lon, sin lat). "
                 "Slerp between neighbouring keyframes; error <= " + str(tol) + " deg"
                 + (f" ({tol_deep} deg before {args.deep_after:g} Ma)" if tol_deep != tol else "")
                 + " except within "
                 "0.5 Myr of model discontinuities. Entries older than all of a plate's features "
                 "are identity padding (those features are hidden then)."),
    }
    body = json.dumps(head, ensure_ascii=False, separators=(",", ":"))[:-1]
    body += ',"times":[' + ",".join(tnum(t) for t in times) + '],"plates":{' + ",".join(plate_json) + "}}"
    (out / "paleo-rotations.json").write_text(body, encoding="utf-8")
    log(f"paleo-rotations.json: {len(body) / 1024:.0f} KB, {len(plates)} plates x {len(times)} times "
        f"({padded} padded entries)")

    # ---- verification against pygplates on a fine grid ---------------------------------
    vgrid = np.round(np.arange(0.0, T_MAX + 1e-9, VERIFY_STEP), 4)
    log(f"verifying on {len(vgrid)} times ...")
    Qv, Mv = sample_rotations(rm, plates, vgrid)
    Qv = hold_and_align(Qv, Mv)
    rq = json.loads(body)
    tk = np.array(rq["times"], float)
    K = np.stack([np.array(rq["plates"][str(p)], float).reshape(-1, 4) for p in plates], axis=1)
    idx = np.clip(np.searchsorted(tk, vgrid, side="right") - 1, 0, len(tk) - 2)
    f = ((vgrid - tk[idx]) / (tk[idx + 1] - tk[idx]))[:, None, None]
    errs = np.zeros((len(vgrid), len(plates)))
    for c0 in range(0, len(vgrid), 500):
        sl = slice(c0, c0 + 500)
        qi = slerp(K[idx[sl]], K[idx[sl] + 1], f[sl])
        errs[sl] = displacement_deg(qi, Qv[sl], S[None])
    errs[vgrid[:, None] > win[None, :] + 1e-9] = 0.0
    # discontinuities in the model itself: rotation jumps at a knot time
    jumps = []
    for k in sorted(knots):
        if not 0.0 < k < T_MAX:
            continue
        for j, p in enumerate(plates):
            if k > win[j]:
                continue
            r1 = rm.get_rotation(k - 1e-3, p, use_identity_for_missing_plate_ids=False)
            r2 = rm.get_rotation(k + 1e-3, p, use_identity_for_missing_plate_ids=False)
            if r1 is None or r2 is None:
                continue
            d = qmul(qconj(rot_to_quat(r1)), rot_to_quat(r2))
            ang = math.degrees(2 * math.asin(min(1.0, float(np.linalg.norm(d[1:])))))
            if ang > 0.05:
                jumps.append((k, p, ang))
    # a jump is confined to one fine-grid step next to its knot (keyframes bracket it), so
    # only the plate's samples within FINE_STEP of the knot are reported separately
    near_jump = np.zeros_like(errs, bool)
    for k, p, ang in jumps:
        near_jump[np.abs(vgrid - k) < FINE_STEP + 1e-9, plates.index(p)] = True
    clean = np.where(near_jump, 0.0, errs)
    worst = np.unravel_index(np.argmax(clean), clean.shape)
    stats = {
        "max_error_deg": round(float(clean.max()), 4),
        "max_error_at": [float(vgrid[worst[0]]), plates[worst[1]]],
        "p99_9_error_deg": round(float(np.percentile(clean[clean > 0], 99.9)), 4) if (clean > 0).any() else 0,
        "mean_error_deg": round(float(clean[clean > 0].mean()), 5) if (clean > 0).any() else 0,
        "discontinuities": sorted({(round(k, 3), round(max(a for kk, pp, a in jumps if kk == k), 2))
                                   for k, p, ang in jumps}),
        "max_error_young_deg": round(float(clean[vgrid <= args.deep_after].max()), 4),
        "max_error_deep_deg": round(float(clean[vgrid > args.deep_after].max()), 4),
        "max_error_incl_discontinuity_windows_deg": round(float(errs.max()), 3),
        "keyframes": len(times),
        "plates": len(plates),
    }
    (work / "verify.json").write_text(json.dumps(stats, indent=1))
    log("verification:", json.dumps(stats))
    log(f"done in {_time.time() - t_start:.0f} s; intermediates in {work}")


if __name__ == "__main__":
    sys.exit(main())
