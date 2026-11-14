#!/usr/bin/env bash
# Downloads the sources of the other worlds into a NEW, empty directory (about 1 GB; build-worlds.mjs
# turns them into public/data/worlds/ and can delete the big files as it goes):
#   - tiles of NASA's Solar System Treks (trek.nasa.gov) for the base maps of the Moon, Mars, Mercury,
#     Venus, Io, Europa, Ganymede, Enceladus and Vesta (public domain);
#   - USGS Astrogeology global mosaics for Callisto, Titan, Ceres, Pluto, Charon and Triton (public domain);
#   - Solar System Scope textures for the giant planets and Venus's clouds (CC BY 4.0);
#   - the IAU Gazetteer of Planetary Nomenclature (USGS) for every world's named places;
#   - LOLA (the Moon) and MOLA (Mars) heights at 16 pixels per degree, for the 3D view.
#
#   scripts/data/space/fetch_worlds.sh /tmp/worlds-src
set -euo pipefail
SRC=${1:?usage: fetch_worlds.sh <new empty directory>}
mkdir -p "$SRC"/{trek,usgs,sss,iau,dem}
get() { [ -s "$2" ] || curl -sS --fail --retry 4 --retry-delay 3 -m 600 -A 'Mozilla/5.0 (map builder)' -o "$2" "$1"; }

# Trek tiles of one layer at one zoom: 2^(z+1) × 2^z tiles of 256 px, equirectangular from 180°W, 90°N.
trek() {
  local body=$1 layer=$2 z=$3 ext=$4 out="$SRC/trek/$2/$3"
  mkdir -p "$out"
  local rows=$((1 << z)) cols=$((2 << z))
  for ((r = 0; r < rows; r++)); do for ((c = 0; c < cols; c++)); do
    echo "https://trek.nasa.gov/tiles/$body/EQ/$layer/1.0.0/default/default028mm/$z/$r/$c.$ext $out/${r}_$c.$ext"
  done; done | xargs -P 4 -n 2 sh -c '[ -s "$1" ] || curl -sS --fail --retry 4 --retry-delay 3 -m 120 -o "$1" "$0"'
  echo "trek $layer z$z: $(ls "$out" | wc -l) tiles"
}
trek Moon LRO_WAC_Mosaic_Global_303ppd_v02 3 jpg
trek Moon LRO_LOLA_ClrShade_Global_256ppd_v06 3 png
trek Mars Mars_Viking_MDIM21_ClrMosaic_global_232m 3 jpg
trek Mars Mars_MGS_MOLA_ClrShade_merge_global_463m 3 jpg
trek Mercury Mercury_MESSENGER_mosaic_global_250m_2013 3 png
trek Venus Venus_Magellan_C3-MDIR_Colorized_Global_Mosaic_4641m 3 png
trek Io Io_GalileoSSI_Voyager_Global_Mosaic_ClrMerge_1km 3 png
trek Europa Europa_Voyager_Galileo_Blend_ColorMosaic 3 png
trek Ganymede Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m 3 png
trek Enceladus Enceladus_Cassini_mosaic_global_110m 3 jpg
trek Vesta Vesta_Dawn_HAMO_TrueClr_DLR_global_74ppd_IAU 3 png

# USGS global mosaics (with their labels, which say how longitude runs).
USGS=https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic
for f in Callisto_Voyager_GalileoSSI_global_mosaic_1km Titan_ISS_P19658_Mosaic_Global_4km Ceres_Dawn_FC_DLR_global_20ppd_Oct2015 \
         Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit Triton_Voyager2_ClrMosaic_GlobalFill_600m; do
  get "$USGS/$f.lbl" "$SRC/usgs/$f.lbl" || true
  get "$USGS/${f}_pds3.lbl" "$SRC/usgs/${f}_pds3.lbl" || true
  get "$USGS/$f.tif" "$SRC/usgs/$f.tif"
  echo "usgs $f"
done

# Solar System Scope (CC BY 4.0).
for f in 8k_jupiter.jpg 8k_saturn.jpg 2k_uranus.jpg 2k_neptune.jpg 4k_venus_atmosphere.jpg; do
  get "https://www.solarsystemscope.com/textures/download/$f" "$SRC/sss/$f"
done

# IAU names (USGS Gazetteer of Planetary Nomenclature): centre points with attributes, as shapefiles.
for b in MOON MARS MERCURY VENUS IO EUROPA GANYMEDE CALLISTO TITAN ENCELADUS CERES VESTA PLUTO CHARON TRITON; do
  get "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/${b}_nomenclature_center_pts.zip" "$SRC/iau/$b.zip"
done

# Heights: LOLA via NASA SVS's CGI Moon Kit (uint16 half-metres + 20 000), MOLA MEGDR (int16 metres, big-endian).
get https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif "$SRC/dem/ldem_16_uint.tif"
get https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img "$SRC/dem/megt90n000eb.img"
get https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.lbl "$SRC/dem/megt90n000eb.lbl"
echo "done: $(du -sh "$SRC" | cut -f1)"
