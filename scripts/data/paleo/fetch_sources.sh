#!/usr/bin/env bash
# Fetch the Merdith et al. (2021) plate-model files used by build_paleo.py.
# They are mirrored in the GPlates web service repository on GitHub, which is used here
# because it only needs git over HTTPS. Blobs are downloaded lazily, so only these files
# are transferred.
#
#   scripts/data/paleo/fetch_sources.sh <empty-dest-dir>
set -euo pipefail

DEST=${1:?usage: fetch_sources.sh <dest-dir>}
REPO_URL=https://github.com/GPlates/gplates-web-service.git
COMMIT=94fc960c915d06821ac63d4c45156999cb3e6e8f   # 2026-10-27, the revision used for the shipped data
MODEL_DIR=django/GWS/data/deprecated/MODELS/MERDITH2021
FILES=(
  1000_0_rotfile_Merdith_et_al.rot
  shapes_coastlines_Merdith_et_al_v2.gpmlz
  shapes_static_polygons_Merdith_et_al.gpmlz
  README.txt
)

mkdir -p "$DEST"
CLONE="$DEST/.gplates-web-service"
if [ ! -d "$CLONE/.git" ]; then
  git clone --filter=blob:none --no-checkout "$REPO_URL" "$CLONE"
fi
git -C "$CLONE" cat-file -e "$COMMIT^{commit}" 2>/dev/null || git -C "$CLONE" fetch origin "$COMMIT"
for f in "${FILES[@]}"; do
  git -C "$CLONE" show "$COMMIT:$MODEL_DIR/$f" > "$DEST/$f"
  echo "fetched $f ($(wc -c < "$DEST/$f") bytes)"
done
