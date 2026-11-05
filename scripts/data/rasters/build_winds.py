#!/usr/bin/env python3
"""ERA-Interim 850 hPa wind (January and July monthly means) -> winds.json.

Input: eraint_uvz.nc from github.com/pydata/xarray-data (u, v, z at 200/500/850 hPa
on a 0.75° grid, months 1 and 7). The lowest level (850 hPa) is smoothed with a
Gaussian of ~0.8° (anti-aliasing), sampled bilinearly every DEG degrees and
rounded to 0.1 m/s. Rows run north -> south (lat = lat0 - j*dy), columns west ->
east (lon = lon0 + i*dx), row-major: index = j*nx + i.

Usage: python3 -I build_winds.py eraint_uvz.nc OUT.json [--deg 2]
"""
import argparse
import json

import netCDF4
import numpy as np
from scipy import ndimage
from scipy.interpolate import RegularGridInterpolator

MONTHS = {1: "jan", 2: "feb", 3: "mar", 4: "apr", 5: "may", 6: "jun",
          7: "jul", 8: "aug", 9: "sep", 10: "oct", 11: "nov", 12: "dec"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("nc")
    ap.add_argument("out")
    ap.add_argument("--deg", type=float, default=2.0)
    a = ap.parse_args()

    ds = netCDF4.Dataset(a.nc)
    levels = [int(x) for x in ds["level"][:]]
    k = int(np.argmax(levels))  # highest pressure = lowest level
    lat = ds["latitude"][:].astype(float)
    lon = ds["longitude"][:].astype(float)
    res = abs(lat[1] - lat[0])
    if lat[0] < lat[-1]:
        raise SystemExit("expected latitudes north -> south")
    nx = int(round(360 / a.deg))
    ny = int(round(180 / a.deg)) + 1
    lon_out = -180 + np.arange(nx) * a.deg
    lat_out = 90 - np.arange(ny) * a.deg
    LA, LO = np.meshgrid(lat_out, lon_out, indexing="ij")

    months = {}
    stats = []
    for mi, m in enumerate(ds["month"][:]):
        rec = {}
        for comp in ("u", "v"):
            var = ds[comp]
            var.set_auto_mask(False)  # packed int16 with a NaN _FillValue: unpack only
            f = var[mi, k].astype(np.float64)
            assert np.isfinite(f).all()
            f = ndimage.gaussian_filter(f, 0.8 / res, mode=("nearest", "wrap"))
            # periodic padding, latitude ascending for the interpolator
            lonp = np.concatenate([lon[-2:] - 360, lon, lon[:2] + 360])
            fp = np.concatenate([f[:, -2:], f, f[:, :2]], axis=1)[::-1]
            interp = RegularGridInterpolator((lat[::-1], lonp), fp, method="linear")
            g = interp(np.stack([LA.ravel(), LO.ravel()], -1))
            vals = [round(float(x), 1) + 0.0 for x in g]  # + 0.0 turns -0.0 into 0.0
            rec[comp] = vals
        speed = np.hypot(rec["u"], rec["v"])
        stats.append("%s max %.1f m/s mean %.1f" % (MONTHS[int(m)], speed.max(), speed.mean()))
        months[MONTHS[int(m)]] = rec

    out = {
        "source": "ECMWF ERA-Interim reanalysis, monthly-mean wind at 850 hPa for January and July "
                  "(eraint_uvz.nc from github.com/pydata/xarray-data; the averaging years are not stated in the file)",
        "license": "CC BY 4.0 (ECMWF public datasets licence)",
        "attribution": "Contains modified ECMWF ERA-Interim data (Dee et al., 2011)",
        "level": levels[k],
        "level_units": "hPa",
        "units": "m/s",
        "nx": nx, "ny": ny,
        "lon0": -180, "lat0": 90, "dx": a.deg, "dy": a.deg,
        "order": "row-major from north to south: value[j*nx + i] is at lon = lon0 + i*dx, lat = lat0 - j*dy",
        "method": "0.75° monthly means smoothed with a %.1f° Gaussian, sampled bilinearly, rounded to 0.1 m/s" % 0.8,
        "note": "850 hPa lies below the ground over high terrain (Tibet, Andes, Rockies, Greenland, Antarctica); "
                "the reanalysis extrapolates winds there",
        "months": months,
    }
    with open(a.out, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print("wrote", a.out, "level", levels[k], "hPa, grid", nx, "x", ny, ";", "; ".join(stats))


if __name__ == "__main__":
    main()
