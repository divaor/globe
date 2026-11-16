// A small decoder for Mapbox vector tiles (GBIF's map tiles, v0.30.0): each feature's properties and the first
// point of its geometry, which is all the animal finder needs (GBIF's squares and their counts).
export interface TileFeature { props: Record<string, string | number | boolean>; first: [number, number] | null }

export function decodeTile(buf: Uint8Array): { extent: number; feats: TileFeature[] }[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const varint = (p: { i: number }) => { let r = 0, s = 0, x: number; do { x = buf[p.i++]; r += (x & 0x7f) * 2 ** s; s += 7; } while (x & 0x80); return r; };
  type Val = number | [number, number];
  function msg(start: number, end: number, cb: (f: number, v: Val, w: number) => void) {
    const p = { i: start };
    while (p.i < end) {
      const tag = varint(p), f = tag >> 3, w = tag & 7;
      if (w === 0) cb(f, varint(p), w);
      else if (w === 2) { const l = varint(p); cb(f, [p.i, p.i + l], w); p.i += l; }
      else if (w === 5) { cb(f, dv.getFloat32(p.i, true), w); p.i += 4; }
      else if (w === 1) { cb(f, dv.getFloat64(p.i, true), w); p.i += 8; }
      else throw new Error(`wire type ${w}`);
    }
  }
  const text = (r: [number, number]) => new TextDecoder().decode(buf.subarray(r[0], r[1]));
  const layers: { extent: number; feats: TileFeature[] }[] = [];
  msg(0, buf.length, (f, v) => {
    if (f !== 3 || typeof v === 'number') return;
    const keys: string[] = [], values: (string | number | boolean)[] = [], raw: { tags: number[]; cmds: number[] }[] = [];
    let extent = 4096;
    msg(v[0], v[1], (f2, v2) => {
      if (f2 === 5 && typeof v2 === 'number') extent = v2;
      else if (f2 === 3 && typeof v2 !== 'number') keys.push(text(v2));
      else if (f2 === 4 && typeof v2 !== 'number') {
        let val: string | number | boolean = 0;
        msg(v2[0], v2[1], (f3, v3) => {
          if (f3 === 1 && typeof v3 !== 'number') val = text(v3);
          else if (typeof v3 === 'number') val = f3 === 6 ? (v3 % 2 ? -(v3 + 1) / 2 : v3 / 2) : f3 === 7 ? !!v3 : v3;
        });
        values.push(val);
      } else if (f2 === 2 && typeof v2 !== 'number') {
        const F = { tags: [] as number[], cmds: [] as number[] };
        msg(v2[0], v2[1], (f3, v3) => {
          if ((f3 === 2 || f3 === 4) && typeof v3 !== 'number') { const p = { i: v3[0] }; const arr: number[] = []; while (p.i < v3[1]) arr.push(varint(p)); if (f3 === 2) F.tags = arr; else F.cmds = arr; }
        });
        raw.push(F);
      }
    });
    const feats = raw.map((F) => {
      const props: Record<string, string | number | boolean> = {};
      for (let i = 0; i + 1 < F.tags.length; i += 2) props[keys[F.tags[i]]] = values[F.tags[i + 1]];
      let first: [number, number] | null = null;
      if (F.cmds.length >= 3 && (F.cmds[0] & 7) === 1) {
        const zz = (n: number) => (n % 2 ? -(n + 1) / 2 : n / 2);
        first = [zz(F.cmds[1]), zz(F.cmds[2])];
      }
      return { props, first };
    });
    layers.push({ extent, feats });
  });
  return layers;
}
