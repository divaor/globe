"""Convert the World Bank country table cached in the WDI R package (data/WDI_data.RData)
into a plain CSV that build_attributes.py can read with the standard library.

    <venv>/bin/pip install rdata
    <venv>/bin/python -I scripts/data/attributes/extract_wdi.py <download-dir>

Writes <download-dir>/derived/wdi_country.csv (iso3c, iso2c, country, region, income, lending).
The income column is the World Bank income classification that the WDI package fetched
from the World Bank API when the cache was last refreshed.
"""
import csv
import os
import sys

import rdata  # third-party: pip install rdata

src = sys.argv[1]
path = os.path.join(src, 'repos', 'vincentarelbundock_WDI', 'data', 'WDI_data.RData')
conv = rdata.conversion.convert(rdata.parser.parse_file(path))
country = conv['WDI_data']['country']
os.makedirs(os.path.join(src, 'derived'), exist_ok=True)
out = os.path.join(src, 'derived', 'wdi_country.csv')
cols = ['iso3c', 'iso2c', 'country', 'region', 'income', 'lending']
with open(out, 'w', newline='', encoding='utf-8') as fh:
    w = csv.writer(fh)
    w.writerow(cols)
    for _, row in country.iterrows():
        w.writerow(['' if row[c] is None else str(row[c]) for c in cols])
print('wrote', out, len(country), 'rows')
