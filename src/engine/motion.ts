// Less motion (v0.47.0): when the phone asks for it ("reduce motion"), flights jump, a flung globe stops, rings and
// flashes rest, and the screensaver turns slowly.
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Does the phone ask for less motion? */
export const reducedMotion = (): boolean => !!mq?.matches;
