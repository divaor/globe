// Projection picker with live mini-map previews drawn in each projection.
import { geoPath, geoProjection, geoGraticule10, geoOrthographicRaw } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { h } from './dom';
import { t } from '../app/i18n';
import { PROJECTIONS, PROJECTION_ORDER, type ProjectionId } from '../engine/projections';
import { loadJSON } from '../data/store';
import type { App } from '../app/app';

let land: unknown = null;

function preview(id: ProjectionId, w: number, hgt: number): string {
  const def = PROJECTIONS[id];
  const p = geoProjection(def.kind === 'globe' ? geoOrthographicRaw : def.raw);
  if (def.kind === 'globe') p.rotate([-10, -25]).clipAngle(90);
  else if (def.kind === 'azimuthal') p.rotate([0, -90]).clipAngle(def.clipAngle ?? 179.5);
  p.fitExtent([[4, 4], [w - 4, hgt - 4]], { type: 'Sphere' });
  p.precision(1);
  const path = geoPath(p);
  const sphere = path({ type: 'Sphere' }) ?? '';
  const grat = path(geoGraticule10()) ?? '';
  const l = land ? path(land as never) ?? '' : '';
  return `<svg viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" aria-hidden="true">
    <path d="${sphere}" class="pv-ocean"/><path d="${grat}" class="pv-grat"/><path d="${l}" class="pv-land"/><path d="${sphere}" class="pv-edge"/></svg>`;
}

export async function projectionsPanel(app: App): Promise<HTMLElement> {
  if (!land) {
    const topo = await loadJSON<Topology>('base/land-110m.json');
    land = feature(topo, topo.objects.land as GeometryCollection);
  }
  const grid = h('div', { class: 'proj-grid' });
  const groups: [string, ProjectionId[]][] = [
    ['globe', ['globe']],
    ['flat', PROJECTION_ORDER.filter((id) => PROJECTIONS[id].kind === 'flat')],
    ['azimuthal', PROJECTION_ORDER.filter((id) => PROJECTIONS[id].kind === 'azimuthal')],
  ];
  const cards: HTMLElement[] = [];
  for (const [, ids] of groups) {
    for (const id of ids) {
      const def = PROJECTIONS[id];
      const card = h('button', { type: 'button', class: `pcard${app.projection === id ? ' on' : ''}`, 'data-id': id },
        h('span', { class: 'pcard-svg', html: preview(id, 132, def.kind === 'flat' ? 74 : 96) }),
        h('span', { class: 'pcard-name' }, t(`proj.${id}`)),
        h('span', { class: 'pcard-prop' }, t(`prop.${def.property}`)),
        h('span', { class: 'pcard-desc' }, t(`projd.${id}`)));
      card.addEventListener('click', () => {
        app.setProjection(id);
        cards.forEach((c) => c.classList.toggle('on', c.dataset.id === id));
      });
      cards.push(card);
      grid.append(card);
    }
  }
  return h('div', { class: 'projections' }, grid);
}
