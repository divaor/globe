import { politicalColor, continentSwatch } from '../engine/colors';
import { t, tx } from '../app/i18n';
import { LC } from './context';
import type { LayerDef } from './types';

const ORDER = ['AS', 'AF', 'EU', 'NA', 'SA', 'OC', 'AN'];

/** The default filter: every country its own colour, colour family = continent. */
export const political: LayerDef = {
  id: 'political',
  category: 'political',
  icon: '🗺️',
  kind: 'fill',
  name: { en: 'Political map', es: 'Mapa político' },
  desc: {
    en: 'Every country with its own colour; the colour family shows the continent.',
    es: 'Cada país con su propio color; la familia de color indica el continente.',
  },
  keywords: 'countries borders nations continents países fronteras naciones continentes',
  credit: 'Natural Earth (public domain)',
  countryColor(id, _inst, rc) {
    const m = LC.data.meta[id];
    if (!m) return null;
    return politicalColor(m.ct, m.mc, id, rc.theme.dark);
  },
  legend() {
    const meta = LC.data.meta;
    return {
      kind: 'categories',
      title: t('continents'),
      note: t('politicalNote'),
      items: ORDER.map((c) => ({
        color: continentSwatch(c),
        label: t(`cont.${c}`),
        ids: Object.keys(meta).filter((id) => meta[id].ct === c),
      })),
    };
  },
};

export const politicalName = () => tx(political.name);
