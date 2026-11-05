# Atlas Globe

A detailed, colourful, installable world globe (PWA) with many stackable map filters, smooth
globe-to-flat-map projection morphs, a political timeline and a Pangea animation. English and Spanish.

- **Live app:** https://divaor.github.io/globe/ (deployed by GitHub Actions from `main`)
- **Install:** open it in Chrome, Edge or Safari and use "Install app" / "Add to Home Screen".

## Features (v0.1.0)

- Political map by default: every country has its own shade, and the colour family shows its continent.
  Capitals and major cities appear as you zoom.
- Drag (with fling), pinch, wheel and double-tap zoom; tap a country for its card; search any country or city.
- 14 projections with a smooth morph: Globe, Plate Carrée, Mercator, Miller, Robinson, Winkel Tripel,
  Equal Earth, Natural Earth, Mollweide, Gall–Peters, Eckert IV, azimuthal equidistant, Lambert azimuthal,
  stereographic. Every filter works in every projection.
- Filter stack: turn on several filters, set opacity, reorder; legends and country values for each.
- Ambient mode: full-screen rotating globe with your filters, screen kept awake, optional clock.
- Works offline after the first visit.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

Data are pre-built and committed under `public/data/`. The scripts that build them live in
`scripts/data/` (each folder has a README); sources and licences are listed in `public/data/*/SOURCES.md`.

## Adding a filter

A filter is one object implementing `LayerDef` (`src/layers/types.ts`). Most data filters are one call:

```ts
import { numericLayer } from './choropleth';
export const myFilter = numericLayer({
  id: 'my-filter', category: 'economy', icon: '📈',
  name: { en: 'My filter', es: 'Mi filtro' }, desc: { en: '…', es: '…' },
  palette: SEQUENTIAL.viridis, scale: 'log',
  values: () => ({ USA: 1, MEX: 2 /* country id → value */ }),
});
```

Register it in `src/layers/index.ts` (or drop a module in `src/layers/packs/` that exports a default
function registering filters) and it appears in the Filters panel.

## Licence

Code: GPL-3.0-or-later. Data keep their own licences (Natural Earth public domain, NASA public domain,
historical borders GPL-3.0, plate model CC BY 4.0, and others listed in the SOURCES files).
