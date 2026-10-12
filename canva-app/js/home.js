// Home screen: create from size, templates gallery, and the user's projects.
import { h, icon, fa, toast, clone, uid, pickFile } from './util.js';
import { FORMATS, makeDesign } from './model.js';
import { TEMPLATES, designFromTemplate, templatePreviewDesign } from './templates.js';
import { thumbnail } from './renderer.js';
import { downloadFiles } from './export.js';
import { listDesigns, saveDesign, deleteDesign, getDesign, settings } from './store.js';

const FORMAT_COLORS = ['#ff66c4', '#8c52ff', '#ff914d', '#00bf63', '#5271ff', '#ff3131', '#0cc0df', '#7b4b2a', '#38b6ff', '#545454', '#cb6ce6', '#004aad'];
const thumbCache = new Map();
function tplThumb(t) {
  if (!thumbCache.has(t.id)) thumbCache.set(t.id, thumbnail(templatePreviewDesign(t), 320));
  return thumbCache.get(t.id);
}
const shapeIcon = (f, max = 26) => {
  const k = max / Math.max(f.w, f.h);
  return h('span.format-shape', { style: { width: Math.round(f.w * k) + 'px', height: Math.round(f.h * k) + 'px' } });
};
export const clearTemplateThumbs = () => thumbCache.clear();

export class Home {
  constructor(root, { open }) {
    this.root = root;
    this.open = open;
    this.tab = 'home';
    this.cat = 'all';
    this.query = '';
  }

  async render() {
    this.designs = await listDesigns().catch(() => []);
    this.root.innerHTML = '';
    const body = h('main.home-body');
    if (this.tab === 'home') this.renderHome(body);
    if (this.tab === 'templates') this.renderTemplates(body, true);
    if (this.tab === 'projects') this.renderProjects(body);
    this.root.append(this.header(), body, this.nav());
  }

  header() {
    const dark = document.documentElement.dataset.theme === 'dark';
    return h('header.home-top',
      h('div.brand', h('span.brand-logo', 'ط'), h('span', 'طرح‌ساز')),
      h('button.ib', { title: 'تغییر تم', on: { click: () => {
        const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = t;
        settings.set('theme', t);
        this.render();
      } } }, icon(dark ? 'sun' : 'moon')),
    );
  }

  nav() {
    const b = (id, ic, label) => h('button' + (this.tab === id ? '.on' : ''), { on: { click: () => { this.tab = id; this.render(); } } }, icon(ic), h('span', label));
    return h('nav.home-nav',
      b('home', 'home', 'خانه'),
      b('templates', 'grid', 'قالب‌ها'),
      h('button.fab', { title: 'طرح جدید', on: { click: () => this.newDesignSheet() } }, icon('plus', 28)),
      b('projects', 'folder', 'پروژه‌ها'),
      h('button', { on: { click: () => this.importFile() } }, icon('upload'), h('span', 'وارد کردن')),
    );
  }

  renderHome(body) {
    const search = h('input', { type: 'search', placeholder: 'جستجوی قالب‌ها…', value: this.query });
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.query = search.value; this.tab = 'templates'; this.render(); } });
    body.append(h('section.hero',
      h('h1', 'امروز چه چیزی طراحی می‌کنید؟'),
      h('label.hero-search', icon('search', 20), search),
    ));
    body.append(h('div.format-row', FORMATS.map((f, i) => h('button.format', { on: { click: () => this.createBlank(f) } },
      h('span.format-ic', { style: { background: FORMAT_COLORS[i % FORMAT_COLORS.length] } }, shapeIcon(f)),
      h('span', f.name))),
      h('button.format', { on: { click: () => this.customSize() } }, h('span.format-ic.custom', icon('resize')), h('span', 'اندازه دلخواه'))));

    if (this.designs.length) {
      body.append(h('div.sec-head', h('h2', 'طرح‌های اخیر'), h('button.link', { on: { click: () => { this.tab = 'projects'; this.render(); } } }, 'همه')));
      body.append(h('div.recent-row', this.designs.slice(0, 8).map((d) => this.designCard(d))));
    }
    this.renderTemplates(body, false);
  }

  renderTemplates(body, full) {
    body.append(h('div.sec-head', h('h2', 'قالب‌ها'), !full && h('button.link', { on: { click: () => { this.tab = 'templates'; this.render(); } } }, 'همه')));
    if (full) {
      const search = h('input.search', { type: 'search', placeholder: 'جستجوی قالب…', value: this.query });
      search.addEventListener('input', () => { this.query = search.value; fill(); });
      body.append(search);
    }
    const cats = [{ id: 'all', name: 'همه' }, ...FORMATS.filter((f) => TEMPLATES.some((t) => t.cat === f.id))];
    const chips = h('div.chips.scroll', cats.map((c) => h('button.chip' + (this.cat === c.id ? '.on' : ''), { on: { click: () => { this.cat = c.id; [...chips.children].forEach((x, i) => x.classList.toggle('on', cats[i].id === c.id)); fill(); } } }, c.name)));
    const grid = h('div.tpl-grid');
    const fill = () => {
      grid.innerHTML = '';
      const q = this.query.trim();
      const list = TEMPLATES.filter((t) => (this.cat === 'all' || t.cat === this.cat) && (!q || (t.name + ' ' + t.tags + ' ' + t.format.name).includes(q)));
      if (!list.length) grid.append(h('p.hint', 'قالبی پیدا نشد.'));
      for (const t of list) {
        grid.append(h('button.tpl', { on: { click: () => this.fromTemplate(t) } },
          h('div.tpl-img', h('img', { src: tplThumb(t), alt: t.name, loading: 'lazy', style: { aspectRatio: `${t.format.w}/${t.format.h}` } })),
          h('span.tpl-name', t.name), h('small', t.format.name + (t.pages.length > 1 ? ` · ${fa(t.pages.length)} صفحه` : ''))));
      }
    };
    body.append(chips, grid);
    fill();
  }

  renderProjects(body) {
    body.append(h('div.sec-head', h('h2', 'پروژه‌های من'), h('span.muted', fa(this.designs.length) + ' طرح')));
    if (!this.designs.length) {
      body.append(h('div.empty', icon('folder', 48), h('p', 'هنوز طرحی نساخته‌اید.'), h('button.btn.btn-primary', { on: { click: () => this.newDesignSheet() } }, 'ساخت اولین طرح')));
      return;
    }
    body.append(h('div.proj-grid', this.designs.map((d) => this.designCard(d, true))));
  }

  designCard(d, withMenu) {
    return h('div.dcard',
      h('button.dcard-img', { on: { click: () => this.open(d.id) } }, d.thumb ? h('img', { src: d.thumb, alt: '' }) : h('span', '—')),
      h('div.dcard-meta',
        h('div', h('div.dcard-name', d.name), h('small', `${fa(d.width)}×${fa(d.height)} · ${fa(d.pages.length)} صفحه`)),
        withMenu && h('button.ib', { title: 'گزینه‌ها', on: { click: (e) => this.menu(e, d) } }, icon('more'))));
  }

  menu(e, d) {
    e.stopPropagation();
    document.querySelector('.popmenu')?.remove();
    const close = () => m.remove();
    const m = h('div.popmenu',
      h('button', { on: { click: () => { close(); this.open(d.id); } } }, icon('edit', 18), 'باز کردن'),
      h('button', { on: { click: async () => {
        close();
        const n = prompt('نام جدید', d.name);
        if (n?.trim()) { const full = await getDesign(d.id); full.name = n.trim(); await saveDesign(full); this.render(); }
      } } }, icon('rename', 18), 'تغییر نام'),
      h('button', { on: { click: async () => {
        close();
        const full = await getDesign(d.id);
        const c = { ...clone(full), id: uid(), name: full.name + ' (کپی)', createdAt: Date.now(), updatedAt: Date.now() };
        await saveDesign(c); toast('کپی ساخته شد'); this.render();
      } } }, icon('copy', 18), 'ایجاد کپی'),
      h('button', { on: { click: async () => {
        close();
        const full = await getDesign(d.id);
        downloadFiles([new File([JSON.stringify(full)], (full.name || 'design') + '.tarh.json', { type: 'application/json' })]);
      } } }, icon('download', 18), 'پشتیبان (فایل پروژه)'),
      h('button.danger', { on: { click: async () => {
        close();
        if (confirm(`«${d.name}» حذف شود؟`)) { await deleteDesign(d.id); this.render(); }
      } } }, icon('trash', 18), 'حذف'),
    );
    document.body.append(m);
    const r = e.currentTarget.getBoundingClientRect();
    m.style.top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8) + 'px';
    m.style.left = Math.max(8, r.left) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', (ev) => { if (!m.contains(ev.target)) close(); }, { once: true }), 0);
  }

  async importFile() {
    const [f] = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d.pages || !d.width) throw new Error('bad file');
      d.id = uid(); d.updatedAt = Date.now();
      await saveDesign(d);
      toast('پروژه وارد شد');
      this.open(d.id);
    } catch { toast('فایل پروژه معتبر نیست'); }
  }

  async createBlank(f, name) {
    const d = makeDesign({ name: name || f.name, w: f.w, h: f.h });
    await saveDesign(d);
    this.open(d.id);
  }

  async fromTemplate(t) {
    const d = designFromTemplate(t);
    await saveDesign(d);
    this.open(d.id);
  }

  customSize() {
    const w = prompt('عرض (پیکسل)', '1080');
    if (!w) return;
    const hh = prompt('ارتفاع (پیکسل)', '1080');
    const W = +w, H = +hh;
    if (!(W >= 50 && H >= 50 && W <= 8000 && H <= 8000)) { toast('اندازه باید بین ۵۰ تا ۸۰۰۰ باشد'); return; }
    this.createBlank({ w: W, h: H }, `طرح ${fa(W)}×${fa(H)}`);
  }

  newDesignSheet() {
    document.querySelector('.modal')?.remove();
    const close = () => m.remove();
    const m = h('div.modal', { on: { click: (e) => { if (e.target === m) close(); } } },
      h('div.modal-card',
        h('div.sheet-head', h('div.sheet-grip'), h('span.sheet-title', 'طرح جدید'), h('button.ib', { on: { click: close } }, icon('close'))),
        h('div.format-list', FORMATS.map((f, i) => h('button.format-item', { on: { click: () => { close(); this.createBlank(f); } } },
          h('span.format-ic.sm', { style: { background: FORMAT_COLORS[i % FORMAT_COLORS.length] } }, shapeIcon(f)),
          h('span', f.name), h('small', `${fa(f.w)} × ${fa(f.h)}`)))),
        h('button.btn.full', { on: { click: () => { close(); this.customSize(); } } }, icon('resize', 18), 'اندازه دلخواه'),
      ));
    document.body.append(m);
  }
}
