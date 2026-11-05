// Registry of all filters. To add a filter: write a LayerDef (see types.ts / choropleth.ts) and
// list it here. Order inside a category is the order shown in the Filters panel.
import type { LayerDef } from './types';
import { political } from './political';
import { timezones } from './timezones';
import { landforms, rivers } from './landforms';
import { satellite, relief, elevation } from './imagery';
import { dayNight } from './daynight';
import { economyType } from './basics';

export function coreLayers(): LayerDef[] {
  return [
    political, timezones,
    landforms, rivers,
    economyType,
    satellite, relief, elevation,
    dayNight,
  ];
}
