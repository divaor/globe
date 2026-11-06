// Personal maps and export: countries you have visited or want to visit, notes per country (kept
// in this browser), and PNG / 4K / phone wallpaper export of the current view.
import { Check, Star, NotebookPen, ImageDown, Monitor, Smartphone } from 'lucide';
import { h, icon } from '../ui/dom';
import { t, lang, fmtNumber } from '../app/i18n';
import { categoricalLayer } from '../layers/choropleth';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { LayerDef } from '../layers/types';

const KEY = 'atlas-globe:personal';
const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);

interface Personal { visited: string[]; wish: string[]; notes: Record<string, string> }

function load(): Personal {
  try { return { visited: [], wish: [], notes: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { visited: [], wish: [], notes: {} }; }
}

export class PersonalMaps {
  private p: Personal = load();
  readonly layer: LayerDef;

  constructor(private app: App, private shell: Shell) {
    const self = this;
    const base = categoricalLayer({
      id: 'travel', category: 'fun', icon: '🧳',
      name: { en: 'My travel map', es: 'Mi mapa de viajes' },
      desc: { en: 'Countries you have visited and want to visit (tap a country, then ✓ or ★).', es: 'Países que has visitado y que quieres visitar (toca un país y luego ✓ o ★).' },
      keywords: 'visited travel scratch map personal viajes visitados',
      credit: 'Your own data, saved in this browser',
      values: () => Object.fromEntries([...self.p.wish.map((id) => [id, 'wish']), ...self.p.visited.map((id) => [id, 'visited'])]),
      categories: () => ({ visited: { en: 'Visited', es: 'Visitado', color: '#20c997', icon: '✓' }, wish: { en: 'Want to go', es: 'Quiero ir', color: '#fcc419', icon: '★' } }),
      order: ['visited', 'wish'],
    });
    this.layer = {
      ...base,
      legend(inst, lng) {
        const lg = base.legend!(inst, lng);
        const meta = app.data.meta;
        const visited = self.p.visited.filter((id) => meta[id]);
        const conts = new Set(visited.map((id) => meta[id].ct).filter((c) => c !== 'AN' && c !== 'SS'));
        const sovereign = Object.values(meta).filter((m) => m.type === 'Sovereign country' || m.type === 'Country').length;
        const note = L(`${visited.length} countries visited (${fmtNumber((visited.length / sovereign) * 100, 0)}% of the world), ${conts.size} of 6 continents. Saved only on this device.`,
          `${visited.length} países visitados (${fmtNumber((visited.length / sovereign) * 100, 0)}% del mundo), ${conts.size} de 6 continentes. Guardado solo en este dispositivo.`);
        return lg ? { ...lg, note } : lg;
      },
      labels(rc) {
        for (const id of Object.keys(self.p.notes)) {
          const m = app.data.meta[id];
          const pt = m && rc.project(m.lx, m.ly);
          if (pt) rc.labels.add({ text: '📝', x: pt[0], y: pt[1] - 16, priority: 1500, size: 15, color: '#000', halo: 'rgba(0,0,0,0)' });
        }
      },
    };
    app.register([this.layer]);

    // Card buttons and the note row.
    shell.card.actions.push((id) => this.toggleBtn(id, 'visited', Check, L('Been there', 'He estado')));
    shell.card.actions.push((id) => this.toggleBtn(id, 'wish', Star, L('Want to go', 'Quiero ir')));
    shell.card.actions.push((id) => {
      const b = h('button', { type: 'button', class: 'pill' }, icon(NotebookPen, 16), this.p.notes[id] ? L('Edit note', 'Editar nota') : L('Note', 'Nota'));
      b.addEventListener('click', () => this.editNote(id));
      return b;
    });
    shell.card.extraRows.push((id) => (this.p.notes[id] ? [{ icon: '📝', label: L('My note', 'Mi nota'), value: this.p.notes[id] }] : null));

    shell.addMenu({ id: 'export', icon: ImageDown, label: () => L('Save image', 'Guardar imagen'), order: 60, onClick: () => void this.exportImage('screen') });
    shell.addMenu({ id: 'export4k', icon: Monitor, label: () => L('4K wallpaper', 'Fondo de pantalla 4K'), order: 61, onClick: () => void this.exportImage('4k') });
    shell.addMenu({ id: 'exportphone', icon: Smartphone, label: () => L('Phone wallpaper', 'Fondo para el celular'), order: 62, onClick: () => void this.exportImage('phone') });
  }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.p)); } catch { /* private mode */ }
    const inst = this.app.instance('travel');
    if (inst) delete inst.state.cache;
    this.app.emit('legend');
    this.app.renderer.requestRender();
  }

  private toggleBtn(id: string, list: 'visited' | 'wish', ic: Parameters<typeof icon>[0], label: string) {
    const on = this.p[list].includes(id);
    const b = h('button', { type: 'button', class: `pill${on ? ' primary' : ''}` }, icon(ic, 16), label);
    b.addEventListener('click', () => {
      const other = list === 'visited' ? 'wish' : 'visited';
      if (on) this.p[list] = this.p[list].filter((x) => x !== id);
      else { this.p[list].push(id); this.p[other] = this.p[other].filter((x) => x !== id); }
      this.save();
      if (!this.app.isActive('travel')) void this.app.activate('travel');
      this.shell.card.render();
    });
    return b;
  }

  private editNote(id: string) {
    const ta = h('textarea', { class: 'note-input', rows: 6, placeholder: L('Memories, plans, places to see…', 'Recuerdos, planes, lugares que ver…') }) as HTMLTextAreaElement;
    ta.value = this.p.notes[id] ?? '';
    const saveBtn = h('button', { type: 'button', class: 'pill primary' }, L('Save', 'Guardar'));
    saveBtn.addEventListener('click', () => {
      const v = ta.value.trim();
      if (v) this.p.notes[id] = v; else delete this.p.notes[id];
      this.save();
      this.shell.sheet.close();
      this.shell.card.render();
    });
    this.shell.openPanel('note', `📝 ${this.app.data.name(id, lang())}`, h('div', { class: 'note' }, ta, h('div', { class: 'settings-actions' }, saveBtn), h('p', { class: 'muted small' }, L('Notes stay on this device.', 'Las notas se quedan en este dispositivo.'))));
    setTimeout(() => ta.focus(), 50);
  }

  /** Renders the current view at a given size and downloads it as a PNG. */
  private async exportImage(kind: 'screen' | '4k' | 'phone') {
    const r = this.app.renderer;
    // CSS size × pixel ratio: 1920×1080 @2 = 3840×2160; 430×932 @3 = 1290×2796.
    const size = kind === '4k' ? [1920, 1080, 2] : kind === 'phone' ? [430, 932, 3] : null;
    this.shell.toast(L('Rendering image…', 'Generando imagen…'), 1500);
    await new Promise((res) => setTimeout(res, 60));
    const canvas = size ? r.snapshot(size[0], size[1], size[2]) : r.snapshot();
    const ctx = canvas.getContext('2d')!;
    const s = canvas.width / 1400;
    ctx.font = `600 ${Math.round(18 * Math.max(1, s))}px system-ui, sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('Atlas Globe', canvas.width - 24 * Math.max(1, s), canvas.height - 18 * Math.max(1, s));
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) { this.shell.toast(t('dataError')); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `atlas-globe-${kind}-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    this.shell.toast(L('Image saved', 'Imagen guardada'));
  }
}
