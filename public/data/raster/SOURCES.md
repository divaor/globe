# Raster and gridded data: sources

All rasters are equirectangular (plate carrée): x runs from longitude −180° to 180°,
y from latitude 90° to −90°, and the pixel edges sit on the image border. Pixel
centres are therefore half a pixel in from each edge.
`rasters.json` gives each file's size, encoding, value range, period, source and
licence. The scripts that rebuild every file live in `scripts/data/rasters/`
(see the README there).

## Basemaps (RGB JPEG, quality 85, baseline)

| File | Source | Licence |
|---|---|---|
| `bluemarble-4k.jpg` 4096×2048, `bluemarble-2k.jpg` 2048×1024 | NASA Blue Marble Next Generation, 2004, with topography and bathymetry shading (Stöckli et al. 2005). We used the 5400×2700 `bmng.jpg` from matplotlib/basemap's `basemap-data`. | Public domain (NASA). The basemap-data packaging is MIT. |
| `relief-8k.jpg` 8192×4096, `relief-4k.jpg` 4096×2048 | Shaded relief by Tom Patterson (shadedrelief.com / Natural Earth). We used the 10800×5400 `shadedrelief.jpg` from `basemap-data`. | Public domain |
| `etopo-4k.jpg` 4096×2048 | NOAA NGDC/NCEI ETOPO1 colour relief (Amante & Eakins 2009). We used the 5400×2700 `etopo1.jpg` from `basemap-data`. | Public domain (U.S. Government work) |

All five were resampled with Lanczos3 (sharp).

## Population (8-bit grayscale, log-encoded, 0 = empty)

| File | Source | Licence |
|---|---|---|
| `population.png` 2048×1024 | GeoNames populated places with at least 500 inhabitants (`cities500`, 234,908 places) and GeoNames country totals, taken from the PyPI package `geonamescache` 3.0.2 | CC BY 4.0. Credit: "Population data © GeoNames (geonames.org)" |
| `citylights.png` 2048×1024 | Same data | CC BY 4.0 (GeoNames) |

`population.png` is a Gaussian kernel density computed on the sphere. The kernel
has a fixed width in kilometres, is widened by 1/cos(latitude) in longitude, and
wraps across the antimeridian:

- Listed places contribute their populations with σ = 25 km.
- Each country's unlisted remainder (country total minus its listed places) is
  shared equally among that country's places and spread with σ = 60 km.

Places alone hold about 4.5 of the 7.6 billion people in the GeoNames totals.
Only 29 % of India's population and 23 % of Bangladesh's is in listed places,
compared with about 90 % in Europe or the US. Without the remainder term, the
dense rural plains would look far too empty.

Values are log-encoded between 3 and 3000 people/km²: `v = round((log10 d − log10 3)/(log10 3000 − log10 3)·254) + 1`,
and `0` means below 3/km². This is a modelled pattern, not census data.

`citylights.png` is a synthetic night-lights texture, not satellite data. It was
computed at 4× resolution (8192×4096) and box-downsampled. Brightness is the sum of:

- the populations with a 6 km kernel,
- 0.25 × a 30 km glow,
- 0.1 × the rural remainder density.

It uses the same log encoding (3 to 3000).

## Climate fields (8-bit grayscale, 1440×720, 0 = no data)

Linear encoding: `v = round((x − min)/(max − min)·254) + 1`.
Log encoding: `v = round((log10 x − log10 min)/(log10 max − log10 min)·254) + 1`.
Each file's `min` and `max` are in `rasters.json`. Before upsampling, every field
was gap-filled under land with the nearest valid value. It was then interpolated
bilinearly to 0.25° pixel centres, periodic in longitude.

| File | Encoding | Source | Licence |
|---|---|---|---|
| `sst.png` | linear, −1.8 to 29.8 °C, ocean only | NOAA ERSST v5 (Huang et al. 2017). File `ersstv5.nc` (monthly 1970–2021) from github.com/pydata/xarray-data. **1991–2020 annual mean.** Masked with Natural Earth 50m land and Antarctic ice shelves. The Caspian Sea and the Great Lakes are kept because ERSST covers them. | Public domain (NOAA, no constraints) |
| `temperature.png` | linear, −52.9 to 31.8 °C, global | ECMWF ERA-Interim 2 m temperature, the 12 monthly means of **2005 (a single year, not a 30-year normal)**. File `T2M_ERAINT_rectilinear_grid_2D.nc` from github.com/NCAR/geocat-datafiles, ~0.7° Gaussian grid. | ERA-Interim is an ECMWF public dataset, CC BY 4.0 under ECMWF's open-data licence. Credit: "Contains modified ECMWF ERA-Interim data". Check ECMWF's current terms before any commercial redistribution. |
| `precipitation.png` | **log**, 3 to 4900 mm/year, global | GPCP v2.2 monthly precipitation (Adler et al. 2003; Huffman et al. 2009). File `V22_GPCP.1979-2010.nc` from github.com/NCAR/geocat-datafiles, 2.5° grid. **1981–2010 mean annual total.** | Public domain (NASA GSFC / NOAA), citation requested |

`cmip6.nc` from pydata/xarray-data was inspected but not used. It contains no
near-surface air temperature (`tas`). Its `pr`, `gpp`, `mrso`, `thetao`, `no3`
and `co2` cover only January–June 1850 (historical) and January–June 2015
(ssp370) for CanESM5, MIROC6 and CESM2-WACCM, which is not enough for an annual
climatology.

## Related layers in `../layers/`

| File | Content | Source | Licence |
|---|---|---|---|
| `koppen.json` | TopoJSON, object `koppen`: one MultiPolygon per Köppen–Geiger class, property `k` | 0.5° grid, 1986–2010 (Kottek et al. 2006; Rubel et al. 2017), from the npm package `koppen-climate-lookup` 2.0.0. Coastlines and large lakes come from Natural Earth 50m (public domain). | Data free with citation (koeppen-geiger.vu-wien.ac.at); npm package ISC |
| `koppen.png` | 720×360 RGBA, one pixel per 0.5° cell, ocean transparent | Same grid | Same |
| `koppen-classes.json` | Colours (Beck et al. 2018 legend; `As` gets a lighter Aw blue), names and descriptions in English and Spanish, biome mapping | Compiled for this app | — |
| `winds.json` | 850 hPa u/v for January and July on a 2° grid | ECMWF ERA-Interim monthly means, file `eraint_uvz.nc` from github.com/pydata/xarray-data. The file does not state the averaging years. | CC BY 4.0 (ECMWF), credit "Contains modified ECMWF ERA-Interim data" |

## Citations

- Adler, R. F. et al. (2003). The Version-2 Global Precipitation Climatology Project (GPCP) monthly precipitation analysis (1979–present). *J. Hydrometeor.* 4, 1147–1167.
- Amante, C. & Eakins, B. W. (2009). ETOPO1 1 Arc-Minute Global Relief Model. NOAA Technical Memorandum NESDIS NGDC-24.
- Beck, H. E. et al. (2018). Present and future Köppen-Geiger climate classification maps at 1-km resolution. *Sci. Data* 5, 180214.
- Dee, D. P. et al. (2011). The ERA-Interim reanalysis. *Q. J. R. Meteorol. Soc.* 137, 553–597.
- Huang, B. et al. (2017). Extended Reconstructed Sea Surface Temperature, Version 5 (ERSSTv5). *J. Climate* 30, 8179–8205.
- Huffman, G. J. et al. (2009). Improving the global precipitation record: GPCP Version 2.1. *Geophys. Res. Lett.* 36, L17808.
- Kottek, M. et al. (2006). World Map of the Köppen-Geiger climate classification updated. *Meteorol. Z.* 15, 259–263.
- Rubel, F. et al. (2017). The climate of the European Alps: Shift of very high resolution Köppen-Geiger climate zones 1800–2100. *Meteorol. Z.* 26, 115–125.
- Stöckli, R. et al. (2005). The Blue Marble Next Generation. NASA Earth Observatory.
