// Icon libraries (Iconify JSON, built by tools/build-icons.mjs). Sets load on demand.
import { getImage } from './renderer.js';

export const ICON_SETS = [
  { id: 'tabler', label: 'خطی' },
  { id: 'ph', label: 'Phosphor' },
  { id: 'flat', label: 'رنگی' },
  { id: 'fluent', label: 'ایموجی Fluent' },
  { id: 'brands', label: 'برندها' },
];
export const MONO_SETS = ['tabler', 'ph', 'brands'];

let index = null;
const sets = new Map();

export async function iconIndex() {
  if (!index) index = await fetch('data/icons/index.json').then((r) => r.json());
  return index;
}

export async function loadIconSet(id) {
  if (sets.has(id)) return sets.get(id);
  const list = await iconIndex();
  const meta = list.find((s) => s.id === id);
  const data = await fetch('data/icons/' + meta.file).then((r) => r.json());
  sets.set(id, { meta, data });
  return sets.get(id);
}

export function loadedSet(id) { return sets.get(id) || null; }

// Returns the names matching q (case-insensitive), at most `limit` results.
export function searchSet(set, q, limit = 180) {
  const names = Object.keys(set.data.icons);
  const needle = (q || '').trim().toLowerCase().replace(/\s+/g, '-');
  const out = [];
  for (const n of names) {
    if (!needle || n.includes(needle)) { out.push(n); if (out.length >= limit) break; }
  }
  return out;
}

const svgCache = new Map();

// Builds an SVG data URL for an icon element. Monochrome sets take the element colour.
export function iconSVG(setId, name, color) {
  const set = sets.get(setId);
  if (!set) return null;
  const raw = set.data.icons[name];
  if (!raw) return null;
  const [body, w, h] = Array.isArray(raw) ? raw : [raw, set.data.w, set.data.h];
  const key = setId + '/' + name + '/' + (color || '');
  if (svgCache.has(key)) return svgCache.get(key);
  const colored = color ? body.replace(/currentColor/g, color) : body.replace(/currentColor/g, '#111111');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${colored}</svg>`;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  svgCache.set(key, url);
  return url;
}

// Returns a loaded HTMLImageElement for an icon element, or null while it loads.
export function iconImage(el) {
  const src = iconSVG(el.set, el.name, el.color);
  return src ? getImage(src) : null;
}
