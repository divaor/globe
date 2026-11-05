#!/usr/bin/env python3
"""Assemble public/data/raster/rasters.json from the static basemap entries below and
the per-file metadata fragments written by build_population.py / build_climate.py.

Usage: python3 -I write_metadata.py PUBLIC_DATA_DIR META_DIR
"""
import glob
import json
import os
import sys

from PIL import Image

BMNG = {
    "encoding": "rgb", "min": None, "max": None, "units": None,
    "period": "2004 (Blue Marble Next Generation monthly composite with topography/bathymetry shading)",
    "source": "NASA Visible Earth, Blue Marble Next Generation (Stöckli et al. 2005), 5400x2700 bmng.jpg from matplotlib/basemap (basemap-data)",
    "license": "Public domain (NASA imagery); basemap-data packaging MIT",
    "attribution": "NASA Earth Observatory / Blue Marble Next Generation (R. Stöckli et al.)",
}
RELIEF = {
    "encoding": "rgb", "min": None, "max": None, "units": None, "period": None,
    "source": "Shaded relief (Tom Patterson, shadedrelief.com / Natural Earth), 10800x5400 shadedrelief.jpg from matplotlib/basemap (basemap-data)",
    "license": "Public domain; basemap-data packaging MIT",
    "attribution": "Shaded relief by Tom Patterson (shadedrelief.com)",
}
ETOPO = {
    "encoding": "rgb", "min": None, "max": None, "units": None,
    "period": "ETOPO1 (2009) colour-shaded relief, land and ocean floor",
    "source": "NOAA NGDC/NCEI ETOPO1 global relief colour image (Amante & Eakins 2009), 5400x2700 etopo1.jpg from matplotlib/basemap (basemap-data)",
    "license": "Public domain (U.S. Government work); basemap-data packaging MIT",
    "attribution": "NOAA NCEI ETOPO1 (Amante, C. & Eakins, B.W., 2009)",
}
KOPPEN = {
    "encoding": "rgba", "min": None, "max": None, "units": "Köppen–Geiger class (categorical colour)",
    "classes": "data/layers/koppen-classes.json",
    "decode": "colour -> class via koppen-classes.json; alpha 0 = ocean / no data; one pixel per 0.5° grid cell",
    "period": "1986-2010",
    "source": "Köppen-Geiger 0.5° grid (Kottek et al. 2006; Rubel et al. 2017) as embedded in the npm package koppen-climate-lookup 2.0.0",
    "license": "Free data from koeppen-geiger.vu-wien.ac.at, citation required (no other licence stated); npm package ISC",
    "attribution": "Köppen-Geiger classification after Kottek et al. (2006) and Rubel et al. (2017), colours after Beck et al. (2018)",
}

STATIC = {
    "bluemarble-4k.jpg": BMNG, "bluemarble-2k.jpg": BMNG,
    "relief-8k.jpg": RELIEF, "relief-4k.jpg": RELIEF,
    "etopo-4k.jpg": ETOPO,
}
ORDER = ["bluemarble-4k.jpg", "bluemarble-2k.jpg", "relief-8k.jpg", "relief-4k.jpg", "etopo-4k.jpg",
         "population.png", "citylights.png", "sst.png", "temperature.png", "precipitation.png", "koppen.png"]


def main():
    data_dir, meta_dir = sys.argv[1:3]
    frags = {}
    for p in glob.glob(os.path.join(meta_dir, "*.json")):
        frags[os.path.basename(p)[:-5]] = json.load(open(p, encoding="utf-8"))
    out = {}
    for name in ORDER:
        sub = "layers" if name == "koppen.png" else "raster"
        path = os.path.join(data_dir, sub, name)
        if not os.path.exists(path):
            print("skip (missing)", name)
            continue
        with Image.open(path) as im:
            w, h, mode = im.width, im.height, im.mode
        meta = STATIC.get(name) or (KOPPEN if name == "koppen.png" else frags.get(name))
        if meta is None:
            raise SystemExit("no metadata for " + name)
        entry = {"path": "data/%s/%s" % (sub, name), "width": w, "height": h}
        entry.update(meta)
        entry.setdefault("decode", None)
        entry["bytes"] = os.path.getsize(path)
        entry["mode"] = mode
        out[name] = entry
    dst = os.path.join(data_dir, "raster", "rasters.json")
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("wrote", dst, len(out), "entries")


if __name__ == "__main__":
    main()
