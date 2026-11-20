// Where you are, in the apps (v0.43.0): the phone's own location prompt (with the reason the app gives, in
// Info.plist and the Android manifest) instead of the web view's, and only an approximate place (Android's coarse
// location; the app never needs better than a few kilometres). The page keeps using navigator.geolocation.
import { Geolocation, type Position } from '@capacitor/geolocation';
import { bridged } from './platform';

type Ok = PositionCallback;
type Fail = PositionErrorCallback | null | undefined;

function error(e: unknown): GeolocationPositionError {
  const m = String((e as Error)?.message ?? e);
  const code = /denied|permission/i.test(m) ? 1 : /time/i.test(m) ? 3 : 2;
  return { code, message: m, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}
const asPosition = (p: Position) => ({ coords: { ...p.coords, toJSON() { return this; } }, timestamp: p.timestamp, toJSON() { return this; } }) as unknown as GeolocationPosition;
const opts = (o?: PositionOptions) => ({ enableHighAccuracy: false, timeout: o?.timeout ?? 20000, maximumAge: o?.maximumAge ?? 10 * 60 * 1000 });

export function installGeo() {
  if (!bridged()) return;
  const watches = new Map<number, Promise<string>>();
  let n = 0;
  const geo: Geolocation = {
    getCurrentPosition(ok: Ok, fail?: Fail, o?: PositionOptions) {
      Geolocation.getCurrentPosition(opts(o)).then((p) => ok(asPosition(p)), (e) => fail?.(error(e)));
    },
    watchPosition(ok: Ok, fail?: Fail, o?: PositionOptions) {
      const id = ++n;
      watches.set(id, Geolocation.watchPosition(opts(o), (p, e) => { if (p) ok(asPosition(p)); else if (e) fail?.(error(e)); }));
      return id;
    },
    clearWatch(id: number) {
      const w = watches.get(id);
      watches.delete(id);
      void w?.then((cid) => Geolocation.clearWatch({ id: cid })).catch(() => {});
    },
  } as unknown as Geolocation;
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
}
