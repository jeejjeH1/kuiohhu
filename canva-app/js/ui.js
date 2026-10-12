// Reusable panel widgets: sliders, toggles, segmented buttons, color picker.
import { h, icon, fa } from './util.js';
import { PALETTE, GRADIENTS } from './model.js';
import { settings } from './store.js';

export function slider(label, { min = 0, max = 100, step = 1, value, unit = '', onInput, onChange }) {
  const out = h('span.sl-val', fa(Math.round(value * 100) / 100) + unit);
  const inp = h('input', { type: 'range', min, max, step, value });
  inp.addEventListener('input', () => { out.textContent = fa(+inp.value) + unit; onInput(+inp.value); });
  inp.addEventListener('change', () => onChange?.(+inp.value));
  return h('label.sl', h('span.sl-label', label), inp, out);
}

export function toggle(label, value, onChange) {
  const inp = h('input', { type: 'checkbox' });
  inp.checked = !!value;
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('label.tg', h('span', label), inp, h('span.tg-ui'));
}

export function segmented(items, current, onPick) {
  const wrap = h('div.seg');
  items.forEach((it) => {
    const b = h('button', { type: 'button', title: it.label, on: { click: () => { onPick(it.value); [...wrap.children].forEach((c) => c.classList.toggle('on', c === b)); } } },
      it.icon ? icon(it.icon, 20) : it.label);
    if (it.value === current) b.classList.add('on');
    wrap.append(b);
  });
  return wrap;
}

export function swatch(fill, onClick, { selected, title } = {}) {
  const b = h('button.sw', { type: 'button', title: title || (typeof fill === 'string' ? fill : 'gradient'), on: { click: onClick } });
  b.style.background = cssFill(fill);
  if (fill === 'transparent') b.classList.add('sw-none');
  if (selected) b.classList.add('on');
  return b;
}

export function cssFill(fill) {
  if (!fill) return 'transparent';
  if (typeof fill === 'string') return fill;
  if (fill.type === 'radial') return `radial-gradient(${fill.colors.join(',')})`;
  return `linear-gradient(${fill.angle ?? 90}deg, ${fill.colors.join(',')})`;
}

export function rememberColor(c) {
  if (typeof c !== 'string' || c === 'transparent') return;
  const rec = settings.get('recentColors', []).filter((x) => x !== c);
  rec.unshift(c);
  settings.set('recentColors', rec.slice(0, 12));
}

// Full colour picker panel. docColors: colours already used in the design.
export function colorPicker({ value, onPick, gradients = true, transparent = false, docColors = [] }) {
  const root = h('div.cp');
  const pick = (c) => { rememberColor(c); onPick(c); };

  const custom = h('input', { type: 'color', value: typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#8b3dff' });
  custom.addEventListener('input', () => onPick(custom.value));
  custom.addEventListener('change', () => pick(custom.value));
  const tools = h('div.cp-row',
    h('label.sw.sw-add', { title: 'رنگ دلخواه' }, icon('plus', 18), custom),
    window.EyeDropper && h('button.sw.sw-tool', { type: 'button', title: 'قطره‌چکان', on: { click: async () => {
      try { const r = await new window.EyeDropper().open(); pick(r.sRGBHex); } catch { /* cancelled */ }
    } } }, icon('edit', 18)),
    transparent && swatch('transparent', () => pick('transparent'), { title: 'بدون رنگ' }),
  );
  root.append(tools);

  const section = (title, list, fn = pick) => {
    if (!list.length) return;
    root.append(h('div.cp-title', title), h('div.cp-row', list.map((c) => swatch(c, () => fn(c), { selected: c === value }))));
  };
  section('رنگ‌های اخیر', settings.get('recentColors', []));
  section('رنگ‌های این طرح', docColors);
  const brand = settings.get('brandColors', []);
  root.append(h('div.cp-title', 'کیت برند ',
    h('button.link', { type: 'button', on: { click: () => {
      const c = typeof value === 'string' ? value : custom.value;
      if (!brand.includes(c)) { brand.push(c); settings.set('brandColors', brand); }
      root.replaceWith(colorPicker({ value, onPick, gradients, transparent, docColors }));
    } } }, '+ افزودن رنگ فعلی')));
  if (brand.length) root.append(h('div.cp-row', brand.map((c) => swatch(c, () => pick(c)))));
  section('رنگ‌های پیش‌فرض', PALETTE);
  if (gradients) {
    root.append(h('div.cp-title', 'گرادیان'));
    root.append(h('div.cp-row', GRADIENTS.map((g) => swatch(g, () => onPick(structuredClone(g))))));
    if (value && typeof value === 'object') {
      const g = value;
      const a = h('input', { type: 'color', value: g.colors[0] });
      const b = h('input', { type: 'color', value: g.colors[g.colors.length - 1] });
      const upd = () => { g.colors = [a.value, b.value]; onPick({ ...g }); };
      a.addEventListener('input', upd); b.addEventListener('input', upd);
      root.append(h('div.cp-grad', h('span', 'رنگ ۱'), a, h('span', 'رنگ ۲'), b,
        segmented([{ label: 'خطی', value: 'linear' }, { label: 'دایره‌ای', value: 'radial' }], g.type, (t) => { g.type = t; onPick({ ...g }); })));
      root.append(slider('زاویه', { min: 0, max: 360, value: g.angle ?? 90, unit: '°', onInput: (v) => { g.angle = v; onPick({ ...g }); } }));
    }
  }
  return root;
}
