#!/usr/bin/env python3
"""Downscaled previews of every output for eyeballing orientation and content
(north up, Greenwich in the middle; red lines = equator and prime meridian).

Usage: python3 -I previews.py PUBLIC_DATA_DIR OUT_DIR   (needs matplotlib)
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

import matplotlib

matplotlib.use("Agg")
from matplotlib import colormaps  # noqa: E402

W, H = 1024, 512


def grid_lines(im):
    d = ImageDraw.Draw(im)
    d.line([(W // 2, 0), (W // 2, H)], fill=(255, 0, 0), width=1)
    d.line([(0, H // 2), (W, H // 2)], fill=(255, 0, 0), width=1)
    return im


def colorize(path, cmap):
    a = np.array(Image.open(path))
    rgb = (colormaps[cmap]((a.astype(float) - 1) / 254)[..., :3] * 255).astype(np.uint8)
    rgb[a == 0] = 0
    return Image.fromarray(rgb)


def main():
    data, out = sys.argv[1:3]
    os.makedirs(out, exist_ok=True)
    R = os.path.join(data, "raster")
    tiles = []
    for name in ("bluemarble-4k.jpg", "bluemarble-2k.jpg", "relief-8k.jpg", "relief-4k.jpg", "etopo-4k.jpg"):
        tiles.append((name, Image.open(os.path.join(R, name)).convert("RGB")))
    for name in ("population.png", "citylights.png"):
        tiles.append((name, Image.open(os.path.join(R, name)).convert("RGB")))
    for name, cmap in (("sst.png", "turbo"), ("temperature.png", "RdYlBu_r"), ("precipitation.png", "YlGnBu")):
        p = os.path.join(R, name)
        if os.path.exists(p):
            tiles.append((name + " (colorized)", colorize(p, cmap)))
    kp = Image.open(os.path.join(data, "layers", "koppen.png")).convert("RGBA")
    bg = Image.new("RGBA", kp.size, (20, 40, 70, 255))
    bg.alpha_composite(kp)
    tiles.append(("koppen.png", bg.convert("RGB").resize((W, H), Image.NEAREST)))

    cols = 2
    rows = (len(tiles) + 1) // 2
    sheet = Image.new("RGB", (cols * W, rows * (H + 20)), (40, 40, 40))
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(tiles):
        im = grid_lines(im.resize((W, H), Image.LANCZOS))
        x, y = (i % cols) * W, (i // cols) * (H + 20)
        sheet.paste(im, (x, y + 20))
        d.text((x + 6, y + 4), name, fill=(255, 255, 255))
        im.save(os.path.join(out, "preview-" + name.split(" ")[0].replace(".", "-") + ".png"))
    sheet.save(os.path.join(out, "contact-sheet.png"))
    print("wrote", os.path.join(out, "contact-sheet.png"), "and", len(tiles), "previews")

    # wind preview (speed + direction ticks) if present
    wp = os.path.join(data, "layers", "winds.json")
    if os.path.exists(wp):
        import matplotlib.pyplot as plt
        w = json.load(open(wp))
        nx, ny = w["nx"], w["ny"]
        lon = w["lon0"] + np.arange(nx) * w["dx"]
        lat = w["lat0"] - np.arange(ny) * w["dy"]
        relief = np.array(Image.open(os.path.join(R, "relief-4k.jpg")).resize((W, H)))
        fig, axs = plt.subplots(len(w["months"]), 1, figsize=(12, 6 * len(w["months"])), dpi=80)
        for ax, (m, rec) in zip(np.atleast_1d(axs), w["months"].items()):
            u = np.array(rec["u"]).reshape(ny, nx)
            v = np.array(rec["v"]).reshape(ny, nx)
            ax.imshow(relief, extent=[-180, 180, -90, 90])
            ax.streamplot(lon, lat[::-1], u[::-1], v[::-1], density=2, color=np.hypot(u, v)[::-1],
                          cmap="plasma", linewidth=0.8, arrowsize=0.8)
            ax.set_title("%s %s hPa" % (m, w["level"]))
            ax.set_xlim(-180, 180)
            ax.set_ylim(-90, 90)
        plt.tight_layout()
        plt.savefig(os.path.join(out, "preview-winds.png"))
        print("wrote", os.path.join(out, "preview-winds.png"))


if __name__ == "__main__":
    main()
