// Builds compact icon sets from Iconify JSON packages (open source, see vendor/ATTRIBUTION.md).
// Run:  node tools/build-icons.mjs <path-to-node_modules>
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const SETS = [
  { id: 'tabler', pkg: '@iconify-json/tabler', name: 'Tabler (خطی)' },
  { id: 'ph', pkg: '@iconify-json/ph', name: 'Phosphor' },
  { id: 'flat', pkg: '@iconify-json/flat-color-icons', name: 'رنگی ساده' },
  { id: 'fluent', pkg: '@iconify-json/fluent-emoji-flat', name: 'ایموجی Fluent' },
  { id: 'brands', pkg: '@iconify-json/simple-icons', name: 'برندها' },
];
const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'icons');
fs.mkdirSync(out, { recursive: true });
const index = [];
for (const s of SETS) {
  const j = JSON.parse(fs.readFileSync(path.join(root, s.pkg, 'icons.json'), 'utf8'));
  const dw = j.width || 24, dh = j.height || 24;
  const icons = {};
  for (const [name, d] of Object.entries(j.icons)) {
    const w = d.width || dw, h = d.height || dh;
    icons[name] = w === dw && h === dh ? d.body : [d.body, w, h];
  }
  const file = `${s.id}.json`;
  fs.writeFileSync(path.join(out, file), JSON.stringify({ w: dw, h: dh, icons }));
  index.push({ id: s.id, name: s.name, file, count: Object.keys(icons).length, pkg: s.pkg });
  console.log(s.id, Object.keys(icons).length);
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1));
