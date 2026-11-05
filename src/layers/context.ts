// Shared access for filters to the data store and helpers, set once by the app at start-up.
import type { LayerContext } from './types';

export let LC: LayerContext = null as unknown as LayerContext;
export function setLayerContext(c: LayerContext) { LC = c; }
