// The World Magnetic Model (NOAA, 2025–2030): where a compass points, from its spherical-harmonic coefficients
// (degree 12). Checked against NOAA's twelve published test values (public/data/earth/magnetic.json, "checks").
export interface WMM { epoch: number; coef: number[][] }

/** Magnetic declination (degrees, east of true north positive) at a place, a height (km) and a decimal year. */
export function declination(wmm: WMM, lonDeg: number, latDeg: number, year: number, hKm = 0): number {
  const N = 12, dt = year - wmm.epoch;
  const g: number[][] = [], hh: number[][] = [];
  for (let n = 0; n <= N; n++) { g.push(new Array(N + 1).fill(0)); hh.push(new Array(N + 1).fill(0)); }
  for (const [n, m, gnm, hnm, dg, dh] of wmm.coef) { g[n][m] = gnm + dt * dg; hh[n][m] = hnm + dt * dh; }
  // WGS84 geodetic to geocentric.
  const a = 6378.137, f = 1 / 298.257223563, e2 = f * (2 - f);
  const lat = (latDeg * Math.PI) / 180, lon = (lonDeg * Math.PI) / 180;
  const Rc = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const p = (Rc + hKm) * Math.cos(lat), z = (Rc * (1 - e2) + hKm) * Math.sin(lat);
  const r = Math.hypot(p, z), phi = Math.asin(z / r);
  const Re = 6371.2;
  // Schmidt semi-normalised associated Legendre functions of sin(phi), and their derivatives in phi.
  const x = Math.sin(phi), c = Math.cos(phi);
  const P: number[][] = [], dP: number[][] = [];
  for (let n = 0; n <= N; n++) { P.push(new Array(N + 1).fill(0)); dP.push(new Array(N + 1).fill(0)); }
  P[0][0] = 1;
  for (let n = 1; n <= N; n++) {
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        const k = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
        P[n][n] = k * c * P[n - 1][n - 1];
        dP[n][n] = k * (c * dP[n - 1][n - 1] - x * P[n - 1][n - 1]);
      } else {
        const k1 = (2 * n - 1) / Math.sqrt(n * n - m * m);
        const k2 = Math.sqrt(((n - 1) * (n - 1) - m * m) / (n * n - m * m));
        P[n][m] = k1 * x * P[n - 1][m] - (n - 1 > m ? k2 * P[n - 2][m] : 0);
        dP[n][m] = k1 * (x * dP[n - 1][m] + c * P[n - 1][m]) - (n - 1 > m ? k2 * dP[n - 2][m] : 0);
      }
    }
  }
  let Bx = 0, By = 0, Bz = 0; // geocentric north, east, down
  for (let n = 1; n <= N; n++) {
    const ar = (Re / r) ** (n + 2);
    for (let m = 0; m <= n; m++) {
      const cm = Math.cos(m * lon), sm = Math.sin(m * lon);
      const gh = g[n][m] * cm + hh[n][m] * sm;
      Bx += -ar * gh * dP[n][m];
      By += (ar * m * (g[n][m] * sm - hh[n][m] * cm) * P[n][m]) / (c || 1e-12);
      Bz += -(n + 1) * ar * gh * P[n][m];
    }
  }
  const psi = phi - lat;
  const X = Bx * Math.cos(psi) - Bz * Math.sin(psi);
  return (Math.atan2(By, X) * 180) / Math.PI;
}
