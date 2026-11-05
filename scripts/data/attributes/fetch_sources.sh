#!/usr/bin/env bash
# Download every dataset used by build_attributes.py into a scratch directory.
#
#   scripts/data/attributes/fetch_sources.sh /path/to/empty/scratch/dir
#
# Only GitHub (raw + git over https), the npm registry and PyPI are needed.
# Nothing here executes downloaded code: files are only fetched and unpacked.
set -euo pipefail

DEST="${1:?usage: fetch_sources.sh <download-dir>}"
mkdir -p "$DEST/raw" "$DEST/repos" "$DEST/npm"
cd "$DEST"

fetch() {  # fetch <url> <out-file>
  echo "  get $1"
  curl -fsSL --retry 3 -o "$2" "$1"
}

echo "== raw files"
GH=https://raw.githubusercontent.com
fetch $GH/mledoze/countries/master/countries.json                               raw/mledoze-countries.json
fetch $GH/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson raw/ne_10m_admin_0_countries.geojson
fetch $GH/owid/co2-data/master/owid-co2-data.csv                                 raw/owid-co2-data.csv
fetch $GH/owid/energy-data/master/owid-energy-data.csv                           raw/owid-energy-data.csv
fetch $GH/owid/covid-19-data/master/public/data/latest/owid-covid-latest.json    raw/owid-covid-latest.json
fetch $GH/owid/covid-19-data/master/public/data/owid-covid-codebook.csv          raw/owid-covid-codebook.csv
fetch $GH/datasets/gdp/main/data/gdp.csv                                         raw/wb-gdp.csv
fetch $GH/datasets/population/main/data/population.csv                           raw/wb-population.csv

echo "== git repositories (partial clones, only the files we read)"
sparse_clone() {  # sparse_clone <owner/repo> <dir> <path>...
  local repo=$1 dir=$2; shift 2
  if [ ! -d "repos/$dir/.git" ]; then
    git clone -q --filter=blob:none --no-checkout --depth 1 "https://github.com/$repo.git" "repos/$dir"
  fi
  git -C "repos/$dir" sparse-checkout set --no-cone "$@"
  git -C "repos/$dir" checkout -q HEAD
  echo "  $repo @ $(git -C "repos/$dir" log -1 --format='%h %cs')"
}
sparse_clone factbook/factbook.json        factbook_factbook.json '/*/*.json' '/LICENSE.md' '/README.md'
sparse_clone samayo/country-json           samayo_country-json '/src/country-by-national-dish.json' \
                                           '/src/country-by-yearly-average-temperature.json' '/LICENSE'
sparse_clone countries/countries           countries_countries '/lib/countries/cache/countries.json' '/LICENSE'
sparse_clone vincentarelbundock/WDI        vincentarelbundock_WDI '/data/WDI_data.RData'
sparse_clone KeithGalli/Olympics-Dataset   KeithGalli_Olympics-Dataset '/clean-data/results.csv' '/LICENSE' '/README.md'
sparse_clone owid/owid-datasets            owid_owid-datasets \
  '/datasets/World Happiness Report (2022)/*' '/datasets/Human Height - NCD RisC (2017)/*'

echo "== npm packages (tarballs are only unpacked, never installed or run)"
npm_get() {  # npm_get <name> <version>
  local name=$1 ver=$2 base
  base=$(basename "$name")
  fetch "https://registry.npmjs.org/$name/-/$base-$ver.tgz" "npm/$base-$ver.tgz"
  mkdir -p "npm/$base-$ver" && tar -xzf "npm/$base-$ver.tgz" -C "npm/$base-$ver"
}
npm_get cldr-core 49.0.0
npm_get cldr-localenames-full 49.0.0
npm_get cldr-numbers-full 49.0.0
npm_get @rapideditor/country-coder 5.6.1

echo "done -> $DEST"
echo "next: python3 -m venv <venv> && <venv>/bin/pip install rdata"
echo "      <venv>/bin/python -I scripts/data/attributes/extract_wdi.py $DEST"
echo "      python3 -I scripts/data/attributes/build_attributes.py $DEST"
