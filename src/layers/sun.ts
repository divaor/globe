// Sun position for the day/night terminator (accurate to ~0.1°, plenty for a world map).
const RAD = Math.PI / 180;

export function subsolarPoint(date: Date): [number, number] {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000.0
  const g = ((357.529 + 0.98560028 * d) % 360) * RAD;          // mean anomaly
  const q = (280.459 + 0.98564736 * d) % 360;                   // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD;                    // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;     // hours
  let lon = ra / RAD - gmst * 15;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return [lon, dec / RAD];
}

export function sunVector(date: Date): [number, number, number] {
  const [lon, lat] = subsolarPoint(date);
  const l = lon * RAD, p = lat * RAD;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}
