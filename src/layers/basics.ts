// Filters built from the Natural Earth country table (always available, no extra download).
import { SEQUENTIAL } from '../engine/colors';
import { fmtMoney } from '../app/i18n';
import { LC } from './context';
import { categoricalLayer, numericLayer } from './choropleth';
import type { LayerDef } from './types';

const meta = () => LC.data.meta;

export const incomeGroups: LayerDef = categoricalLayer({
  id: 'income', category: 'economy', icon: '💼',
  name: { en: 'Income groups', es: 'Grupos de ingresos' },
  desc: { en: 'World Bank income classification of each economy.', es: 'Clasificación de ingresos del Banco Mundial.' },
  keywords: 'world bank rich poor high low income banco mundial ricos pobres',
  credit: 'Natural Earth / World Bank',
  values: () => Object.fromEntries(Object.entries(meta()).map(([id, m]) => [id, m.inc?.slice(0, 1)])),
  order: ['1', '2', '3', '4', '5'],
  categories: () => ({
    '1': { en: 'High income (OECD)', es: 'Ingreso alto (OCDE)', color: '#1a9850' },
    '2': { en: 'High income (non-OECD)', es: 'Ingreso alto (no OCDE)', color: '#91cf60' },
    '3': { en: 'Upper middle income', es: 'Ingreso medio alto', color: '#fee08b' },
    '4': { en: 'Lower middle income', es: 'Ingreso medio bajo', color: '#fc8d59' },
    '5': { en: 'Low income', es: 'Ingreso bajo', color: '#d73027' },
  }),
});

export const economyType: LayerDef = categoricalLayer({
  id: 'economy-type', category: 'economy', icon: '🏭',
  name: { en: 'Economy type', es: 'Tipo de economía' },
  desc: { en: 'Developed, emerging (BRICS, MIKT, G20) and developing economies.', es: 'Economías desarrolladas, emergentes (BRICS, MIKT, G20) y en desarrollo.' },
  keywords: 'g7 g20 brics developed emerging desarrollado emergente',
  credit: 'Natural Earth',
  values: () => Object.fromEntries(Object.entries(meta()).map(([id, m]) => [id, m.eco?.slice(0, 1)])),
  order: ['1', '2', '3', '4', '5', '6', '7'],
  categories: () => ({
    '1': { en: 'Developed: G7', es: 'Desarrollada: G7', color: '#2166ac' },
    '2': { en: 'Developed: other', es: 'Desarrollada: otra', color: '#67a9cf' },
    '3': { en: 'Emerging: BRIC', es: 'Emergente: BRIC', color: '#b2182b' },
    '4': { en: 'Emerging: MIKT', es: 'Emergente: MIKT', color: '#ef8a62' },
    '5': { en: 'Emerging: G20', es: 'Emergente: G20', color: '#fddbc7' },
    '6': { en: 'Developing', es: 'En desarrollo', color: '#d9f0d3' },
    '7': { en: 'Least developed', es: 'Menos desarrollada', color: '#7fbf7b' },
  }),
});

export const gdpPerCapitaNE: LayerDef = numericLayer({
  id: 'gdp-pc-ne', category: 'economy', icon: '💰',
  name: { en: 'GDP per person', es: 'PIB por persona' },
  desc: { en: 'Gross domestic product divided by population (US$, 2019).', es: 'Producto interior bruto entre la población (US$, 2019).' },
  keywords: 'gdp wealth income pib riqueza',
  credit: 'Natural Earth (World Bank, 2019)',
  palette: SEQUENTIAL.viridis, scale: 'log',
  values: () => Object.fromEntries(Object.entries(meta()).map(([id, m]) => [id, m.pop > 0 && m.gdp > 0 ? (m.gdp * 1e6) / m.pop : null])),
  format: (v) => fmtMoney(v),
});

export const populationNE: LayerDef = numericLayer({
  id: 'population', category: 'people', icon: '👥',
  name: { en: 'Population', es: 'Población' },
  desc: { en: 'Number of people living in each country.', es: 'Número de habitantes de cada país.' },
  keywords: 'people inhabitants habitantes personas',
  credit: 'Natural Earth (2019)',
  palette: SEQUENTIAL.ylorrd, scale: 'log',
  values: () => Object.fromEntries(Object.entries(meta()).map(([id, m]) => [id, m.pop > 0 ? m.pop : null])),
});
