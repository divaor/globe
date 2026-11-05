#!/usr/bin/env python3
"""Gridded climate fields -> 1440x720 8-bit equirectangular PNGs (+ metadata).

sst.png            NOAA ERSST v5 (pydata/xarray-data ersstv5.nc), annual mean of the
                   1991-2020 monthly means (WMO 30-year normal), °C. Ocean only:
                   0 = land / no data, ocean mask from Natural Earth 50m land.
temperature.png    ERA-Interim 2 m temperature, mean of the 12 monthly means of 2005
                   (NCAR geocat-datafiles T2M_ERAINT_rectilinear_grid_2D.nc), °C,
                   land + ocean.
precipitation.png  GPCP v2.2 monthly precipitation (NCAR geocat-datafiles
                   V22_GPCP.1979-2010.nc), mean annual total 1981-2010, mm/year,
                   log-encoded.

Encoding (gray-linear): v = round((x - min) / (max - min) * 254) + 1, 0 = no data.
Encoding (gray-log):    v = round((log10 x - log10 min) / (log10 max - log10 min) * 254) + 1,
                        x clamped to [min, max], 0 = no data.
All fields are filled under land/gaps (nearest valid value) before a smooth
bilinear upsampling to 0.25° pixel centres, periodic in longitude.

Usage: python3 -I build_climate.py --ersst ersstv5.nc --t2m T2M_ERAINT_rectilinear_grid_2D.nc \
         --gpcp V22_GPCP.1979-2010.nc --land ne_50m_land.geojson --lakes ne_50m_lakes.geojson \
         --ice-shelves ne_50m_antarctic_ice_shelves_polys.geojson OUT_DIR META_DIR
"""
import argparse
import calendar
import json
import math
import os

import netCDF4
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.interpolate import RegularGridInterpolator

W, H = 1440, 720
LON_OUT = -180 + (np.arange(W) + 0.5) * 360 / W
LAT_OUT = 90 - (np.arange(H) + 0.5) * 180 / H


def fill_nearest(a):
    """Replace NaN by the nearest valid value (periodic in longitude)."""
    pad = a.shape[1] // 4
    ap = np.concatenate([a[:, -pad:], a, a[:, :pad]], axis=1)
    bad = np.isnan(ap)
    if not bad.any():
        return a
    _, (iy, ix) = ndimage.distance_transform_edt(bad, return_indices=True)
    return ap[iy, ix][:, pad:-pad]


def to_grid(field, lat, lon):
    """Bilinear interpolation of a global lat/lon field (any lon convention) to the output grid."""
    lon = np.asarray(lon, float)
    lon = (lon + 180) % 360 - 180
    order = np.argsort(lon)
    lon, field = lon[order], field[:, order]
    if lat[0] > lat[-1]:
        lat, field = lat[::-1], field[::-1]
    # periodic padding in longitude
    lonp = np.concatenate([lon[-2:] - 360, lon, lon[:2] + 360])
    fp = np.concatenate([field[:, -2:], field, field[:, :2]], axis=1)
    f = RegularGridInterpolator((np.asarray(lat, float), lonp), fp, method="linear", bounds_error=False, fill_value=None)
    la = np.clip(LAT_OUT, lat[0], lat[-1])  # constant beyond the outermost rows
    LA, LO = np.meshgrid(la, LON_OUT, indexing="ij")
    return f(np.stack([LA.ravel(), LO.ravel()], -1)).reshape(H, W)


def rasterize(path, min_area=0.0):
    import rasterio.features
    from rasterio.transform import from_bounds
    from shapely.geometry import shape
    geoms = [shape(f["geometry"]) for f in json.load(open(path))["features"]]
    geoms = [g for g in geoms if g.area >= min_area]
    return rasterio.features.rasterize(((g, 1) for g in geoms), out_shape=(H, W),
                                       transform=from_bounds(-180, -90, 180, 90, W, H),
                                       fill=0, dtype="uint8").astype(bool)


def encode_linear(x, lo, hi, valid):
    v = np.zeros(x.shape, np.uint8)
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    v[valid] = np.round(t[valid] * 254).astype(np.uint8) + 1
    return v


def encode_log(x, lo, hi, valid):
    v = np.zeros(x.shape, np.uint8)
    t = (np.log10(np.clip(x, lo, hi)) - math.log10(lo)) / (math.log10(hi) - math.log10(lo))
    v[valid] = np.round(t[valid] * 254).astype(np.uint8) + 1
    return v


def floor1(x):
    return math.floor(x * 10) / 10


def ceil1(x):
    return math.ceil(x * 10) / 10


def save(path, v):
    Image.fromarray(v, "L").save(path, optimize=True)
    print("wrote", path, "nonzero %.1f%%" % (100 * (v > 0).mean()))


def sst(path, land, lakes, out_dir, meta):
    ds = netCDF4.Dataset(path)
    t = ds["time"]
    dates = netCDF4.num2date(t[:], t.units, getattr(t, "calendar", "standard"))
    sel = np.array([1991 <= d.year <= 2020 for d in dates])
    assert sel.sum() == 360, sel.sum()
    a = ds["sst"][sel].astype(np.float64).filled(np.nan)
    valid_frac = np.isfinite(a).mean(0)
    days = np.array([calendar.monthrange(d.year, d.month)[1] for d, s in zip(dates, sel) if s], float)
    w = days[:, None, None] * np.isfinite(a)
    clim = np.nansum(np.nan_to_num(a) * days[:, None, None], 0) / np.maximum(w.sum(0), 1)
    clim[valid_frac < 0.9] = np.nan
    lat, lon = ds["lat"][:].astype(float), ds["lon"][:].astype(float)
    valid = np.isfinite(clim)
    # ERSST cells within one 2° cell of valid ocean may be used near the coast
    near = ndimage.binary_dilation(valid, structure=np.ones((3, 3)), iterations=1)
    near_out = to_grid(near.astype(float), lat, lon) > 0.01
    covered = to_grid(valid.astype(float), lat, lon) >= 0.5
    field = to_grid(fill_nearest(clim), lat, lon)
    # ocean + big lakes that ERSST itself covers (Caspian, Great Lakes)
    mask = (~land & near_out) | (lakes & covered)
    lo, hi = floor1(np.nanmin(field[mask])), ceil1(np.nanmax(field[mask]))
    save(os.path.join(out_dir, "sst.png"), encode_linear(field, lo, hi, mask))
    meta["sst.png"] = {
        "encoding": "gray-linear", "min": lo, "max": hi, "units": "°C",
        "decode": "v == 0: land / no data; else T = min + (v-1)/254 * (max - min)",
        "period": "1991-2020 annual mean (mean of 360 monthly means, day-weighted)",
        "method": "ERSST v5 2° grid, gaps under land filled with the nearest ocean value, bilinear upsampling to 0.25°, masked with Natural Earth 50m land and Antarctic ice shelves (large lakes kept where ERSST has values: Caspian, Great Lakes)",
        "source": "NOAA Extended Reconstructed SST v5 (ERSST v5; Huang et al. 2017), monthly 1970-2021 file from github.com/pydata/xarray-data (ersstv5.nc)",
        "license": "Public domain (NOAA; no constraints on data access or use)",
        "attribution": "NOAA ERSST v5 (Huang et al., 2017, doi:10.1175/JCLI-D-16-0836.1)",
    }


def temperature(path, out_dir, meta):
    ds = netCDF4.Dataset(path)
    t = ds["time"]
    dates = netCDF4.num2date(t[:], t.units, getattr(t, "calendar", "standard"))
    years = sorted({d.year for d in dates})
    assert len(dates) == 12 and len(years) == 1, (len(dates), years)
    days = np.array([calendar.monthrange(d.year, d.month)[1] for d in dates], float)
    a = ds["T2M"][:].astype(np.float64).filled(np.nan) - 273.15
    ann = (a * days[:, None, None]).sum(0) / days.sum()
    field = to_grid(ann, ds["lat"][:].astype(float), ds["lon"][:].astype(float))
    lo, hi = floor1(field.min()), ceil1(field.max())
    save(os.path.join(out_dir, "temperature.png"), encode_linear(field, lo, hi, np.ones(field.shape, bool)))
    meta["temperature.png"] = {
        "encoding": "gray-linear", "min": lo, "max": hi, "units": "°C",
        "decode": "T = min + (v-1)/254 * (max - min) (no 0 values: global coverage)",
        "period": "%d annual mean (mean of the 12 monthly means of a single year, not a 30-year normal)" % years[0],
        "method": "ERA-Interim 2 m temperature on its ~0.7° Gaussian grid, day-weighted annual mean, bilinear upsampling to 0.25°",
        "source": "ECMWF ERA-Interim reanalysis, 2 metre temperature, monthly means Jan-Dec %d (file T2M_ERAINT_rectilinear_grid_2D.nc from github.com/NCAR/geocat-datafiles)" % years[0],
        "license": "CC BY 4.0 (ECMWF public datasets licence)",
        "attribution": "Contains modified ECMWF ERA-Interim data (Dee et al., 2011)",
    }


def precipitation(path, out_dir, meta):
    ds = netCDF4.Dataset(path)
    t = ds["time"]
    dates = netCDF4.num2date(t[:], t.units, getattr(t, "calendar", "standard"))
    a = ds["PREC"][:].astype(np.float64).filled(np.nan)  # mm/day
    years = list(range(1981, 2011))
    tot = []
    for y in years:
        idx = [i for i, d in enumerate(dates) if d.year == y]
        assert len(idx) == 12, (y, len(idx))
        days = np.array([calendar.monthrange(y, dates[i].month)[1] for i in idx], float)
        m = a[idx]
        # a missing month counts as that grid cell's mean rate for the other months of the year
        rate = np.nanmean(m, 0)
        m = np.where(np.isnan(m), rate[None], m)
        tot.append((m * days[:, None, None]).sum(0))
    clim = np.nanmean(np.array(tot), 0)
    field = to_grid(fill_nearest(clim), ds["lat"][:].astype(float), ds["lon"][:].astype(float))
    field = np.maximum(field, 0)
    lo = max(1.0, math.floor(field.min()))
    hi = math.ceil(field.max() / 100) * 100
    save(os.path.join(out_dir, "precipitation.png"), encode_log(field, lo, hi, np.ones(field.shape, bool)))
    meta["precipitation.png"] = {
        "encoding": "gray-log", "min": lo, "max": hi, "units": "mm/year",
        "decode": "P = 10^(log10(min) + (v-1)/254 * (log10(max) - log10(min))) (no 0 values: global coverage)",
        "period": "1981-2010 mean annual total (30 years)",
        "method": "GPCP v2.2 2.5° monthly rates x days per month summed per year and averaged, bilinear upsampling to 0.25°",
        "source": "GPCP Version 2.2 combined precipitation (Adler et al. 2003; Huffman et al. 2009), monthly 1979-2010 (file V22_GPCP.1979-2010.nc from github.com/NCAR/geocat-datafiles)",
        "license": "Public domain (NASA GSFC / NOAA NCEI, free and open; citation requested)",
        "attribution": "GPCP v2.2, NASA GSFC (Adler et al., 2003; Huffman et al., 2009)",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ersst", required=True)
    ap.add_argument("--t2m")
    ap.add_argument("--gpcp")
    ap.add_argument("--land", required=True)
    ap.add_argument("--lakes", required=True)
    ap.add_argument("--ice-shelves", help="Natural Earth Antarctic ice shelves (masked like land in sst.png)")
    ap.add_argument("out_dir")
    ap.add_argument("meta_dir")
    a = ap.parse_args()
    land = rasterize(a.land)
    if a.ice_shelves:
        land |= rasterize(a.ice_shelves)
    lakes = rasterize(a.lakes, min_area=0.25)
    meta = {}
    sst(a.ersst, land, lakes, a.out_dir, meta)
    if a.t2m:
        temperature(a.t2m, a.out_dir, meta)
    if a.gpcp:
        precipitation(a.gpcp, a.out_dir, meta)
    for k, v in meta.items():
        print(k, {kk: v[kk] for kk in ("min", "max", "units", "period")})
        with open(os.path.join(a.meta_dir, k + ".json"), "w", encoding="utf-8") as f:
            json.dump(v, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
