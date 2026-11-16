// A small decoder for Mapbox vector tiles (GBIF's map tiles): layers, each with its features {type, props, geom}.
export function decodeMVT(buf) {
  let pos = 0;
  const varint = (b, p) => { let r = 0, s = 0, x; do { x = b[p.i++]; r += (x & 0x7f) * 2 ** s; s += 7; } while (x & 0x80); return r; };
  function msg(b, start, end, cb) { const p = { i: start }; while (p.i < end) { const tag = varint(b, p); const f = tag >> 3, w = tag & 7; if (w === 0) cb(f, w, varint(b, p)); else if (w === 2) { const l = varint(b, p); cb(f, w, [p.i, p.i + l]); p.i += l; } else if (w === 5) { cb(f, w, b.readFloatLE(p.i)); p.i += 4; } else if (w === 1) { cb(f, w, b.readDoubleLE(p.i)); p.i += 8; } else throw new Error('wire ' + w); } }
  const layers = [];
  msg(buf, 0, buf.length, (f, w, v) => {
    if (f !== 3) return;
    const L = { name: '', extent: 4096, keys: [], values: [], feats: [] };
    msg(buf, v[0], v[1], (f2, w2, v2) => {
      if (f2 === 1) L.name = buf.toString('utf8', v2[0], v2[1]);
      else if (f2 === 5) L.extent = v2;
      else if (f2 === 3) L.keys.push(buf.toString('utf8', v2[0], v2[1]));
      else if (f2 === 4) { let val; msg(buf, v2[0], v2[1], (f3, w3, v3) => { if (f3 === 1) val = buf.toString('utf8', v3[0], v3[1]); else if (f3 === 2 || f3 === 3) val = v3; else if (f3 === 4 || f3 === 5) val = v3; else if (f3 === 6) val = v3 % 2 ? -(v3 + 1) / 2 : v3 / 2; else if (f3 === 7) val = !!v3; }); L.values.push(val); }
      else if (f2 === 2) { const F = { type: 0, tags: [], geom: [] }; msg(buf, v2[0], v2[1], (f3, w3, v3) => { if (f3 === 3) F.type = v3; else if (f3 === 2 || f3 === 4) { const p = { i: v3[0] }; const arr = []; while (p.i < v3[1]) arr.push(varint(buf, p)); if (f3 === 2) F.tags = arr; else F.cmds = arr; } }); L.feats.push(F); }
    });
    for (const F of L.feats) {
      F.props = {}; for (let i = 0; i < F.tags.length; i += 2) F.props[L.keys[F.tags[i]]] = L.values[F.tags[i + 1]];
      const rings = []; let ring = null, x = 0, y = 0; const c = F.cmds || []; let i = 0;
      while (i < c.length) { const id = c[i] & 7, n = c[i] >> 3; i++; if (id === 7) { if (ring) ring.push(ring[0]); continue; } for (let k = 0; k < n; k++) { const dx = c[i++], dy = c[i++]; x += dx % 2 ? -(dx + 1) / 2 : dx / 2; y += dy % 2 ? -(dy + 1) / 2 : dy / 2; if (id === 1) { ring = [[x, y]]; rings.push(ring); } else ring.push([x, y]); } }
      F.geom = rings;
    }
    layers.push(L);
  });
  return layers;
}
