#!/usr/bin/env python3
"""Population intensity (population.png) and night-lights style (citylights.png).

Input: GeoNames populated places with >= 500 inhabitants (cities500, CC BY 4.0) and
GeoNames country populations, both bundled by the PyPI package geonamescache
(data/cities500.json, data/countries.json). Every place is splatted (bilinear) on
a lon/lat grid with its population and convolved with a Gaussian whose width is
fixed in kilometres: sigma_y is constant in degrees, sigma_x = sigma_y / cos(lat)
of the place's row (anisotropic in lon/lat = isotropic on the sphere, wrapping
across the antimeridian). Dividing by the pixel area gives a kernel density in
people/km^2, which is log-scaled to 1..255 (0 = below the floor = empty).

Places only hold ~4.5 of ~7.6 billion people (India 29 %, Bangladesh 23 %,
Ethiopia 17 % listed, against ~90 % in Europe or the US), so each country's
unlisted population (country total minus its listed places, if positive) is
shared equally among that country's places and spread with a wider kernel:
dense rural plains (Ganges, Nile, Java, eastern China) get their weight back.

population.png  2048x1024, sigma 25 km (places) + 60 km (unlisted remainder),
                log10 scale between --pop-min and --pop-max
citylights.png  2048x1024, rendered at 4x (8192x4096) with sigma 6 km plus a 30 km
                glow (weight 0.25), box-downsampled, plus 0.1 x the unlisted (rural)
                density for a faint village glow; log scale

Usage: python3 -I build_population.py cities500.json countries.json OUT_DIR META_DIR
"""
import argparse
import json
import math
import os

import numpy as np
from PIL import Image
from scipy import ndimage

R_KM = 6371.0088
KM_PER_DEG = math.pi * R_KM / 180


def load_places(path):
    d = json.load(open(path, encoding="utf-8"))
    vals = d.values() if isinstance(d, dict) else d
    lat, lon, pop, cc = [], [], [], []
    for c in vals:
        lat.append(float(c["latitude"]))
        lon.append(float(c["longitude"]))
        pop.append(float(c.get("population") or 0))
        cc.append(c.get("countrycode") or "")
    return np.array(lat), np.array(lon), np.array(pop), np.array(cc)


def unlisted_weights(pop, cc, countries_path):
    """Per-place share of the country's population that is not in any listed place."""
    countries = json.load(open(countries_path, encoding="utf-8"))
    w = np.zeros(len(pop))
    missing_total = 0.0
    for code, info in countries.items():
        m = cc == code
        n = int(m.sum())
        if not n:
            continue
        missing = max(0.0, float(info.get("population") or 0) - float(pop[m].sum()))
        w[m] = missing / n
        missing_total += missing
    return w, missing_total


def splat(lat, lon, w, W, H):
    fx = (lon + 180.0) / 360.0 * W - 0.5
    fy = (90.0 - lat) / 180.0 * H - 0.5
    x0 = np.floor(fx).astype(int)
    y0 = np.floor(fy).astype(int)
    tx = fx - x0
    ty = fy - y0
    grid = np.zeros((H, W), np.float64)
    for dx, dy, ww in ((0, 0, (1 - tx) * (1 - ty)), (1, 0, tx * (1 - ty)), (0, 1, (1 - tx) * ty), (1, 1, tx * ty)):
        xi = (x0 + dx) % W
        yi = np.clip(y0 + dy, 0, H - 1)
        np.add.at(grid, (yi, xi), w * ww)
    return grid


def blur_km(grid, sigma_km):
    """Gaussian of sigma_km on the sphere: per-row sigma_x in pixels, then constant sigma_y."""
    H, W = grid.shape
    deg_px_x = 360.0 / W
    deg_px_y = 180.0 / H
    lat_c = 90.0 - (np.arange(H) + 0.5) * deg_px_y
    out = np.empty_like(grid)
    for j in range(H):
        row = grid[j]
        if not row.any():
            out[j] = 0.0
            continue
        coslat = max(math.cos(math.radians(lat_c[j])), 1e-3)
        sx = sigma_km / (KM_PER_DEG * coslat * deg_px_x)
        if sx >= W / 3:  # kernel wider than the circle of latitude: spread evenly
            out[j] = row.sum() / W
        else:
            out[j] = ndimage.gaussian_filter1d(row, sx, mode="wrap", truncate=4.0)
    sy = sigma_km / (KM_PER_DEG * deg_px_y)
    return ndimage.gaussian_filter1d(out, sy, axis=0, mode="constant", truncate=4.0)


def pixel_area_km2(W, H):
    lat_edges = np.radians(90.0 - np.arange(H + 1) * 180.0 / H)
    band = (np.sin(lat_edges[:-1]) - np.sin(lat_edges[1:])) * R_KM ** 2 * math.radians(360.0 / W)
    return band[:, None]


def density(lat, lon, pop, W, H, sigma_km):
    people = blur_km(splat(lat, lon, pop, W, H), sigma_km)
    return people / pixel_area_km2(W, H)


def log_encode(d, dmin, dmax, gamma=1.0):
    v = np.zeros(d.shape, np.uint8)
    m = d >= dmin
    t = (np.log10(np.minimum(d[m], dmax)) - math.log10(dmin)) / (math.log10(dmax) - math.log10(dmin))
    v[m] = np.round(np.clip(t, 0, 1) ** gamma * 254 + 1).astype(np.uint8)
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cities")
    ap.add_argument("countries")
    ap.add_argument("out_dir")
    ap.add_argument("meta_dir")
    ap.add_argument("--width", type=int, default=2048)
    ap.add_argument("--sigma", type=float, default=25.0)
    ap.add_argument("--rural-sigma", type=float, default=60.0)
    ap.add_argument("--pop-min", type=float, default=3.0)
    ap.add_argument("--pop-max", type=float, default=3000.0)
    ap.add_argument("--lights-sigma", type=float, default=6.0)
    ap.add_argument("--lights-glow", type=float, default=30.0)
    ap.add_argument("--lights-min", type=float, default=3.0)
    ap.add_argument("--lights-max", type=float, default=3000.0)
    ap.add_argument("--lights-gamma", type=float, default=1.0)
    ap.add_argument("--lights-rural", type=float, default=0.1)
    a = ap.parse_args()

    lat, lon, pop, cc = load_places(a.cities)
    rural, missing = unlisted_weights(pop, cc, a.countries)
    print("places: %d (%d with population), listed %.2f billion, unlisted remainder %.2f billion"
          % (len(pop), (pop > 0).sum(), pop.sum() / 1e9, missing / 1e9))
    W, H = a.width, a.width // 2

    d_places = density(lat, lon, pop, W, H, a.sigma)
    d_rural = density(lat, lon, rural, W, H, a.rural_sigma)
    d = d_places + d_rural
    print("population density: max %.0f /km², p99.9 %.0f, share of pixels >= floor %.1f%%"
          % (d.max(), np.percentile(d, 99.9), 100 * (d >= a.pop_min).mean()))
    Image.fromarray(log_encode(d, a.pop_min, a.pop_max), "L").save(os.path.join(a.out_dir, "population.png"), optimize=True)

    S = 4
    core = density(lat, lon, pop, W * S, H * S, a.lights_sigma)
    glow = density(lat, lon, pop, W * S, H * S, a.lights_glow)
    lights = (core + 0.25 * glow).reshape(H, S, W, S).mean(axis=(1, 3))
    # faint village glow where the unlisted (rural) population is dense
    lights += a.lights_rural * d_rural
    print("lights: max %.0f, p99.9 %.0f" % (lights.max(), np.percentile(lights, 99.9)))
    Image.fromarray(log_encode(lights, a.lights_min, a.lights_max, a.lights_gamma), "L").save(
        os.path.join(a.out_dir, "citylights.png"), optimize=True)

    src = ("GeoNames populated places >= 500 inhabitants (cities500, %d places) and GeoNames country "
           "populations, via the geonamescache 3.0.2 PyPI package" % len(pop))
    meta = {
        "population.png": {
            "encoding": "gray-log", "min": a.pop_min, "max": a.pop_max, "units": "people/km² (kernel density)",
            "decode": "v == 0: below min (empty); else density = 10^(log10(min) + (v-1)/254 * (log10(max) - log10(min)))",
            "period": "GeoNames snapshot bundled with geonamescache 3.0.2 (populations of mixed census years)",
            "method": ("Gaussian kernel density on the sphere: listed place populations with sigma %g km plus each country's "
                       "unlisted remainder (country total minus listed places) shared equally among its places with sigma %g km; "
                       "values above max clipped" % (a.sigma, a.rural_sigma)),
            "source": src, "license": "CC BY 4.0",
            "attribution": "Population data © GeoNames (geonames.org), CC BY 4.0",
            "note": "Modelled from settlement points and national totals, not a census grid: good for the global pattern, not for local values.",
        },
        "citylights.png": {
            "encoding": "gray-log", "min": a.lights_min, "max": a.lights_max, "gamma": a.lights_gamma,
            "units": "relative brightness (people/km² of a 6 km + 30 km kernel mix)",
            "decode": "v == 0: dark; else t = ((v-1)/254)^(1/gamma), value = 10^(log10(min) + t*(log10(max)-log10(min)))",
            "period": "GeoNames snapshot bundled with geonamescache 3.0.2",
            "method": ("Synthetic night lights: listed place populations with a sigma %g km kernel plus 0.25 x a sigma %g km glow "
                       "(computed at 4x resolution, box-downsampled) plus %g x the unlisted rural density" % (a.lights_sigma, a.lights_glow, a.lights_rural)),
            "source": src, "license": "CC BY 4.0",
            "attribution": "Population data © GeoNames (geonames.org), CC BY 4.0",
            "note": "Not satellite night-light data: brightness follows population only.",
        },
    }
    for k, v in meta.items():
        with open(os.path.join(a.meta_dir, k + ".json"), "w", encoding="utf-8") as f:
            json.dump(v, f, ensure_ascii=False, indent=1)
    print("wrote population.png, citylights.png")


if __name__ == "__main__":
    main()
