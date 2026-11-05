// Minimal typings for the parts of d3-geo-projection and d3-geo-polygon used by the app.
declare module 'd3-geo-projection' {
  import type { GeoRawProjection, GeoProjection } from 'd3-geo';
  export const geoRobinsonRaw: GeoRawProjection;
  export const geoWinkel3Raw: GeoRawProjection;
  export const geoMollweideRaw: GeoRawProjection;
  export const geoEckert4Raw: GeoRawProjection;
  export const geoMillerRaw: GeoRawProjection;
  export const geoSinusoidalRaw: GeoRawProjection;
  export const geoAitoffRaw: GeoRawProjection;
  export function geoCylindricalEqualAreaRaw(phi0: number): GeoRawProjection;
  export function geoInterruptedHomolosine(): GeoProjection;
}
