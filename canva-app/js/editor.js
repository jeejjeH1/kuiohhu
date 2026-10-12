// The design editor: canvas stage with touch gestures, contextual toolbars and panels.
import { h, icon, fa, clone, uid, clamp, debounce, toast, pickFile, readFileAsDataURL, normalizeImage } from './util.js';
import {
  FORMATS, FONTS, SHAPES, GRAPHICS, STICKERS, TEXT_PRESETS, TEXT_STYLES, FILTER_PRESETS, DEFAULT_FILTERS,
  makeText, makeShape, makeImage, makeGraphic, makeSticker, makeDrawing, makePage, makeDesign,
} from './model.js';
import {
  renderPage, drawElement, hitTest, fitTextHeight, fontString, setAsyncLoadHandler, loadFonts,
  thumbnail, shapePath, pageToCanvas, getImage,
} from './renderer.js';
import { saveDesign } from './store.js';
import { exportDesign, downloadFiles, shareFiles } from './export.js';
import { slider, toggle, segmented, swatch, colorPicker, cssFill, rememberColor } from './ui.js';
import { TEMPLATES, designFromTemplate, templatePreviewDesign } from './templates.js';

const ACCENT = '#8b3dff';
const TYPE_NAMES = { text: 'متن', shape: 'شکل', image: 'عکس', graphic: 'گرافیک', sticker: 'استیکر', drawing: 'نقاشی' };
const SHAPE_NAMES = {
  rect: 'مربع', rounded: 'گرد', ellipse: 'دایره', triangle: 'مثلث', diamond: 'لوزی', pentagon: 'پنج‌ضلعی',
  hexagon: 'شش‌ضلعی', star: 'ستاره', star4: 'درخشش', heart: 'قلب', arrow: 'فلش', chevron: 'شورون', bubble: 'حباب گفتگو',
  cross: 'بعلاوه', ring: 'حلقه', blob: 'حباب', line: 'خط', dashed: 'خط‌چین',
};
const MASKS = ['rect', 'ellipse', 'rounded', 'hexagon', 'star', 'heart', 'triangle', 'diamond', 'blob', 'pentagon'];

export class Editor {
  constructor(root, design, { onExit }) {
    this.root = root;
    this.design = design;
    this.onExit = onExit;
    this.pageIndex = 0;
    this.selectedId = null;
    this.mode = 'select';
    this.draw = { color: '#111111', width: 10 };
    this.view = { scale: 1, ox: 0, oy: 0 };
    this.pointers = new Map();
    this.gesture = null;
    this.guides = [];
    this.lastTap = { id: null, t: 0 };
    this.hist = [this.snap()];
    this.hi = 0;
    this.saveSoon = debounce(() => this.save(), 700);
    this.build();
    setAsyncLoadHandler(() => this.render());
    loadFonts(design).then(() => { this.refitText(); this.render(); });
  }

  // ---------- state helpers ----------
  get page() { return this.design.pages[this.pageIndex]; }
  get sel() { return this.page.elements.find((e) => e.id === this.selectedId) || null; }
  snap() { return JSON.stringify({ pages: this.design.pages, width: this.design.width, height: this.design.height }); }

  commit() {
    const s = this.snap();
    if (s === this.hist[this.hi]) return;
    this.hist = this.hist.slice(0, this.hi + 1);
    this.hist.push(s);
    if (this.hist.length > 80) this.hist.shift();
    this.hi = this.hist.length - 1;
    this.updateHistoryButtons();
    this.saveState.textContent = 'در حال ذخیره…';
    this.saveSoon();
  }

  restore(s) {
    const d = JSON.parse(s);
    Object.assign(this.design, d);
    this.pageIndex = Math.min(this.pageIndex, this.design.pages.length - 1);
    if (!this.sel) this.selectedId = null;
    this.fit();
    this.refreshUI();
    this.saveSoon();
  }

  undo() { if (this.hi > 0) { this.hi--; this.restore(this.hist[this.hi]); } }
  redo() { if (this.hi < this.hist.length - 1) { this.hi++; this.restore(this.hist[this.hi]); } }

  async save() {
    this.design.updatedAt = Date.now();
    try {
      this.design.thumb = thumbnail(this.design, 360);
      await saveDesign(this.design);
      this.saveState.textContent = 'ذخیره شد';
    } catch (e) {
      console.error(e);
      this.saveState.textContent = 'خطا در ذخیره';
    }
  }

  refitText() {
    for (const p of this.design.pages) for (const el of p.elements) {
      if (el.type !== 'text') continue;
      const cy = el.y + el.h / 2;
      fitTextHeight(el);
      el.y = cy - el.h / 2;
    }
  }

  docColors() {
    const set = new Set();
    for (const p of this.design.pages) {
      if (p.background.type === 'color') set.add(p.background.color);
      for (const e of p.elements) {
        for (const c of [e.color, e.fill, e.strokeColor]) if (typeof c === 'string' && c !== 'transparent' && !c.startsWith('rgba')) set.add(c);
      }
    }
    return [...set].slice(0, 16);
  }

  // ---------- layout ----------
  build() {
    this.root.innerHTML = '';
    this.undoBtn = h('button.ib', { title: 'واگرد', on: { click: () => this.undo() } }, icon('undo'));
    this.redoBtn = h('button.ib', { title: 'ازنو', on: { click: () => this.redo() } }, icon('redo'));
    this.titleEl = h('button.ed-title', { on: { click: () => this.rename() } }, this.design.name);
    this.saveState = h('span.ed-save', '');
    const top = h('header.ed-top',
      h('button.ib', { title: 'بازگشت', on: { click: () => this.exit() } }, icon('back')),
      h('div.ed-title-wrap', this.titleEl, this.saveState),
      this.undoBtn, this.redoBtn,
      h('button.btn.btn-primary.btn-sm', { on: { click: () => this.openExport() } }, icon('download', 18), 'دانلود'),
    );
    this.canvas = h('canvas.ed-canvas');
    this.pageChip = h('div.page-chip');
    this.stage = h('div.ed-stage', this.canvas, this.pageChip);
    this.sheet = h('div.sheet');
    this.toolbar = h('nav.ed-tools');
    this.root.append(top, this.stage, this.sheet, this.toolbar);
    this.ctx = this.canvas.getContext('2d');

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.ro = new ResizeObserver(() => { this.resize(); });
    this.ro.observe(this.stage);
    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler);
    this.refreshUI();
  }

  refreshUI() {
    this.renderToolbar();
    this.updateHistoryButtons();
    this.updatePageChip();
    this.render();
  }

  updateHistoryButtons() {
    this.undoBtn.disabled = this.hi <= 0;
    this.redoBtn.disabled = this.hi >= this.hist.length - 1;
  }

  updatePageChip() {
    const n = this.design.pages.length;
    this.pageChip.innerHTML = '';
    if (n < 2) { this.pageChip.hidden = true; return; }
    this.pageChip.hidden = false;
    this.pageChip.append(
      h('button', { disabled: this.pageIndex === 0, on: { click: () => this.goPage(this.pageIndex - 1) } }, icon('back', 16)),
      h('span', `صفحه ${fa(this.pageIndex + 1)} از ${fa(n)}`),
      h('button.flip-x', { disabled: this.pageIndex === n - 1, on: { click: () => this.goPage(this.pageIndex + 1) } }, icon('back', 16)),
    );
  }

  goPage(i) {
    this.pageIndex = clamp(i, 0, this.design.pages.length - 1);
    this.selectedId = null;
    this.closeSheet();
    this.refreshUI();
  }

  resize() {
    const r = this.stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cw = r.width; this.ch = r.height; this.dpr = dpr;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.fit();
    this.render();
  }

  fit() {
    if (!this.cw) return;
    const pad = 28;
    const s = Math.min((this.cw - pad * 2) / this.design.width, (this.ch - pad * 2) / this.design.height);
    this.fitScale = s;
    this.view = { scale: s, ox: (this.cw - this.design.width * s) / 2, oy: (this.ch - this.design.height * s) / 2 };
  }

  // ---------- rendering ----------
  render() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
  }

  paint() {
    const { ctx, dpr } = this;
    if (!ctx || !this.cw) return;
    const { scale, ox, oy } = this.view;
    const W = this.design.width, H = this.design.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#fff';
    ctx.fillRect(ox, oy, W * scale, H * scale);
    ctx.restore();
    if (this.page.background.type === 'transparent') this.paintChecker(ox, oy, W * scale, H * scale);

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, W * scale, H * scale);
    ctx.clip();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    renderPage(ctx, this.page, this.design, scale * dpr);
    if (this.liveStroke) drawElement(ctx, this.liveStroke, this.design, scale);
    ctx.restore();

    // snapping guides
    ctx.save();
    ctx.strokeStyle = '#ff2bd6';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    for (const g of this.guides) {
      ctx.beginPath();
      if (g.x != null) { const x = ox + g.x * scale; ctx.moveTo(x, oy - 10); ctx.lineTo(x, oy + H * scale + 10); }
      else { const y = oy + g.y * scale; ctx.moveTo(ox - 10, y); ctx.lineTo(ox + W * scale + 10, y); }
      ctx.stroke();
    }
    ctx.restore();

    const el = this.sel;
    if (el && this.mode === 'select') this.paintSelection(el);
  }

  paintChecker(x, y, w, hgt) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, hgt); ctx.clip();
    ctx.fillStyle = '#e9e9ee';
    const s = 12;
    for (let i = 0; i * s < w; i++) for (let j = 0; j * s < hgt; j++) if ((i + j) % 2) ctx.fillRect(x + i * s, y + j * s, s, s);
    ctx.restore();
  }

  screenBox(el) {
    const { scale, ox, oy } = this.view;
    return {
      cx: ox + (el.x + el.w / 2) * scale, cy: oy + (el.y + el.h / 2) * scale,
      hw: el.w * scale / 2, hh: el.h * scale / 2, a: (el.rotation || 0) * Math.PI / 180,
    };
  }

  handles(el) {
    const b = this.screenBox(el);
    const list = [];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const sides = el.type === 'text' ? [[-1, 0], [1, 0]]
      : ['sticker', 'graphic'].includes(el.type) ? []
        : [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const small = b.hw < 26 || b.hh < 26;
    if (!(el.type === 'shape' && (el.shape === 'line' || el.shape === 'dashed'))) {
      corners.forEach(([sx, sy]) => list.push({ type: 'corner', sx, sy }));
    }
    if (!small || el.type === 'text' || el.shape === 'line' || el.shape === 'dashed') sides.forEach(([sx, sy]) => list.push({ type: 'side', sx, sy }));
    list.push({ type: 'rot', sx: 0, sy: 1 });
    const cos = Math.cos(b.a), sin = Math.sin(b.a);
    for (const hd of list) {
      let lx = hd.sx * b.hw, ly = hd.sy * b.hh;
      if (hd.type === 'rot') ly = b.hh + 34;
      hd.x = b.cx + lx * cos - ly * sin;
      hd.y = b.cy + lx * sin + ly * cos;
    }
    return list;
  }

  paintSelection(el) {
    const { ctx } = this;
    const b = this.screenBox(el);
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(b.a);
    ctx.strokeStyle = el.locked ? '#999' : ACCENT;
    ctx.lineWidth = 2;
    if (el.locked) ctx.setLineDash([6, 4]);
    ctx.strokeRect(-b.hw, -b.hh, b.hw * 2, b.hh * 2);
    ctx.restore();
    if (el.locked) return;
    for (const hd of this.handles(el)) {
      ctx.save();
      ctx.translate(hd.x, hd.y);
      ctx.rotate(b.a);
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (hd.type === 'corner') ctx.arc(0, 0, 8, 0, Math.PI * 2);
      else if (hd.type === 'side') {
        const horiz = hd.sy !== 0;
        ctx.roundRect ? ctx.roundRect(horiz ? -12 : -4, horiz ? -4 : -12, horiz ? 24 : 8, horiz ? 8 : 24, 4) : ctx.rect(-4, -12, 8, 24);
      } else ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.stroke();
      if (hd.type === 'rot') {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, 6, -Math.PI * 0.9, Math.PI * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-6.5, -4); ctx.lineTo(-5.8, 0.5); ctx.lineTo(-10, -1);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (this.gesture?.type === 'rotate') {
      this.badge(`${fa(Math.round(el.rotation))}°`, b.cx, b.cy - b.hh - 30);
    } else if (this.gesture?.type === 'resize' || this.gesture?.type === 'pinchEl') {
      this.badge(`${fa(Math.round(el.w))} × ${fa(Math.round(el.h))}`, b.cx, b.cy - b.hh - 30);
    }
  }

  badge(text, x, y) {
    const { ctx } = this;
    ctx.save();
    ctx.font = '600 12px Vazirmatn, sans-serif';
    const w = ctx.measureText(text).width + 16;
    ctx.fillStyle = 'rgba(20,20,30,0.85)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - w / 2, y - 12, w, 24, 12) : ctx.rect(x - w / 2, y - 12, w, 24);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  // ---------- gestures ----------
  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  toDesign(p) {
    const { scale, ox, oy } = this.view;
    return { x: (p.x - ox) / scale, y: (p.y - oy) / scale };
  }

  twoFinger() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  onDown(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const t = this.twoFinger();
      const el = this.sel;
      if (this.gesture?.type === 'draw') this.liveStroke = null;
      if (el && !el.locked && this.mode === 'select') {
        this.gesture = { type: 'pinchEl', start: clone(el), t0: t, mid0: this.toDesign(t.mid) };
      } else {
        this.gesture = { type: 'pinchView', t0: t, view0: { ...this.view } };
      }
      this.guides = [];
      return;
    }
    if (this.pointers.size > 2) return;

    if (this.mode === 'draw') {
      const d = this.toDesign(p);
      this.gesture = { type: 'draw', pts: [[d.x, d.y]] };
      this.liveStroke = null;
      return;
    }

    const el = this.sel;
    if (el && !el.locked) {
      const hd = this.handles(el).find((x) => Math.hypot(x.x - p.x, x.y - p.y) < (x.type === 'rot' ? 22 : 20));
      if (hd) {
        const b = this.screenBox(el);
        this.gesture = { type: hd.type === 'rot' ? 'rotate' : 'resize', hd, start: clone(el), b };
        return;
      }
    }
    const d = this.toDesign(p);
    const hit = hitTest(this.page, d.x, d.y, 6 / this.view.scale);
    const now = performance.now();
    if (hit) {
      const isDouble = this.lastTap.id === hit.id && now - this.lastTap.t < 350;
      this.lastTap = { id: hit.id, t: now };
      if (hit.id !== this.selectedId) this.select(hit.id);
      if (isDouble && !hit.locked) {
        if (hit.type === 'text') this.openTextEdit();
        else if (hit.type === 'image') this.openCrop();
      }
      this.gesture = { type: hit.locked ? 'none' : 'move', start: clone(hit), d0: d, p0: p, moved: false };
    } else {
      const isDouble = this.lastTap.id === 'bg' && now - this.lastTap.t < 350;
      this.lastTap = { id: 'bg', t: now };
      if (isDouble) { this.fit(); this.render(); }
      this.gesture = { type: 'pan', p0: p, view0: { ...this.view }, moved: false };
    }
  }

  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (!g) return;
    const el = this.sel;

    if (g.type === 'pinchView' && this.pointers.size >= 2) {
      const t = this.twoFinger();
      const v0 = g.view0;
      const s = clamp(v0.scale * t.d / g.t0.d, this.fitScale * 0.3, this.fitScale * 8);
      const dm = { x: (g.t0.mid.x - v0.ox) / v0.scale, y: (g.t0.mid.y - v0.oy) / v0.scale };
      this.view = { scale: s, ox: t.mid.x - dm.x * s, oy: t.mid.y - dm.y * s };
      return this.render();
    }
    if (g.type === 'pinchEl' && this.pointers.size >= 2 && el) {
      const t = this.twoFinger();
      const s0 = g.start, k = t.d / g.t0.d;
      const mid = this.toDesign(t.mid);
      const cx = s0.x + s0.w / 2 + (mid.x - g.mid0.x), cy = s0.y + s0.h / 2 + (mid.y - g.mid0.y);
      this.scaleElement(el, s0, k);
      let rot = s0.rotation + (t.a - g.t0.a);
      rot = this.snapAngle(rot);
      el.rotation = rot;
      el.x = cx - el.w / 2; el.y = cy - el.h / 2;
      g.changed = true;
      return this.render();
    }
    if (g.type === 'draw') {
      const d = this.toDesign(p);
      const last = g.pts[g.pts.length - 1];
      if (Math.hypot(d.x - last[0], d.y - last[1]) * this.view.scale < 2) return;
      g.pts.push([d.x, d.y]);
      this.liveStroke = this.strokeElement(g.pts);
      return this.render();
    }
    if (g.type === 'pan') {
      if (!g.moved && Math.hypot(p.x - g.p0.x, p.y - g.p0.y) < 6) return;
      g.moved = true;
      if (this.view.scale <= this.fitScale * 1.01) return;
      this.view = { ...g.view0, ox: g.view0.ox + p.x - g.p0.x, oy: g.view0.oy + p.y - g.p0.y };
      return this.render();
    }
    if (!el) return;
    if (g.type === 'move') {
      if (!g.moved && Math.hypot(p.x - g.p0.x, p.y - g.p0.y) < 4) return;
      g.moved = true;
      const d = this.toDesign(p);
      el.x = g.start.x + d.x - g.d0.x;
      el.y = g.start.y + d.y - g.d0.y;
      this.snapMove(el);
      return this.render();
    }
    if (g.type === 'rotate') {
      const a = Math.atan2(p.y - g.b.cy, p.x - g.b.cx) * 180 / Math.PI - 90;
      el.rotation = this.snapAngle(a);
      g.changed = true;
      return this.render();
    }
    if (g.type === 'resize') {
      this.doResize(el, g, p);
      g.changed = true;
      return this.render();
    }
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.type === 'pinchEl' || g.type === 'pinchView') {
      if (this.pointers.size < 2) {
        if (g.type === 'pinchEl' && g.changed) this.commit();
        this.gesture = this.pointers.size ? { type: 'none' } : null;
        this.render();
      }
      return;
    }
    if (this.pointers.size) return;
    this.gesture = null;
    if (g.type === 'pan' && !g.moved) { this.select(null); }
    if (g.type === 'move' && g.moved) this.commit();
    if ((g.type === 'resize' || g.type === 'rotate') && g.changed) this.commit();
    if (g.type === 'draw') {
      this.liveStroke = null;
      if (g.pts.length > 1) {
        this.page.elements.push(this.strokeElement(g.pts));
        this.commit();
      }
    }
    this.guides = [];
    this.render();
  }

  onWheel(e) {
    e.preventDefault();
    const p = this.pos(e);
    if (e.ctrlKey || e.metaKey) {
      const v0 = this.view;
      const s = clamp(v0.scale * Math.exp(-e.deltaY * 0.01), this.fitScale * 0.3, this.fitScale * 8);
      const dm = this.toDesign(p);
      this.view = { scale: s, ox: p.x - dm.x * s, oy: p.y - dm.y * s };
    } else {
      this.view = { ...this.view, ox: this.view.ox - e.deltaX, oy: this.view.oy - e.deltaY };
    }
    this.render();
  }

  onKey(e) {
    if (!this.root.isConnected || this.root.hidden) return;
    if (/input|textarea|select/i.test(document.activeElement?.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
    const el = this.sel;
    if (!el) return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); this.duplicate(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.remove(); return; }
    if (e.key === 'Escape') { this.select(null); return; }
    const step = e.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv && !el.locked) { e.preventDefault(); el.x += mv[0]; el.y += mv[1]; this.render(); this.commitSoon(); }
  }

  commitSoon = debounce(() => this.commit(), 400);

  snapAngle(a) {
    a = ((a % 360) + 540) % 360 - 180;
    for (const t of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) if (Math.abs(a - t) < 4) return t === -180 ? 180 : t;
    return Math.round(a * 10) / 10;
  }

  snapMove(el) {
    const thr = 7 / this.view.scale;
    const W = this.design.width, H = this.design.height;
    const xs = [0, W / 2, W], ys = [0, H / 2, H];
    for (const o of this.page.elements) {
      if (o.id === el.id || o.hidden) continue;
      xs.push(o.x, o.x + o.w / 2, o.x + o.w);
      ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    this.guides = [];
    const best = (edges, cands) => {
      let r = null;
      for (const [off, v] of edges) for (const c of cands) {
        const d = c - v;
        if (Math.abs(d) < thr && (!r || Math.abs(d) < Math.abs(r.d))) r = { d, at: c, off };
      }
      return r;
    };
    const bx = best([[0, el.x], [el.w / 2, el.x + el.w / 2], [el.w, el.x + el.w]], xs);
    if (bx) { el.x += bx.d; this.guides.push({ x: bx.at }); }
    const by = best([[0, el.y], [el.h / 2, el.y + el.h / 2], [el.h, el.y + el.h]], ys);
    if (by) { el.y += by.d; this.guides.push({ y: by.at }); }
  }

  scaleElement(el, s0, k) {
    const min = 12;
    k = Math.max(k, min / Math.min(s0.w, s0.h));
    el.w = s0.w * k;
    el.h = s0.h * k;
    if (el.type === 'text') {
      el.fontSize = Math.max(4, s0.fontSize * k);
      el.letterSpacing = (s0.letterSpacing || 0) * k;
      if (el.stroke) el.stroke.width = s0.stroke.width * k;
      if (el.bg) { el.bg.pad = s0.bg.pad * k; el.bg.radius = s0.bg.radius * k; }
      fitTextHeight(el);
    }
    if (el.type === 'drawing') el.width = Math.max(1, s0.width * k);
  }

  doResize(el, g, p) {
    const s0 = g.start, { sx, sy, type } = g.hd;
    const a = s0.rotation * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    const c0 = { x: s0.x + s0.w / 2, y: s0.y + s0.h / 2 };
    // fixed anchor: opposite corner / side midpoint
    const F = { x: c0.x + (-sx * s0.w / 2) * cos - (-sy * s0.h / 2) * sin, y: c0.y + (-sx * s0.w / 2) * sin + (-sy * s0.h / 2) * cos };
    const P = this.toDesign(p);
    const vx = P.x - F.x, vy = P.y - F.y;
    const lx = vx * cos + vy * sin, ly = -vx * sin + vy * cos;
    const min = 10;
    let w = s0.w, hgt = s0.h;
    if (type === 'corner') {
      const k = Math.max(min / Math.min(s0.w, s0.h), (lx * sx * s0.w + ly * sy * s0.h) / (s0.w * s0.w + s0.h * s0.h));
      this.scaleElement(el, s0, k);
      w = el.w; hgt = el.h;
    } else {
      if (sx) w = Math.max(min, lx * sx);
      if (sy) hgt = Math.max(min, ly * sy);
      el.w = w; el.h = hgt;
      if (el.type === 'text') { fitTextHeight(el); hgt = el.h; }
    }
    const ax = sx * w / 2, ay = sy * (type === 'side' && !sy ? 0 : hgt / 2);
    let cx = F.x + ax * cos - ay * sin, cy = F.y + ax * sin + ay * cos;
    if (type === 'side' && !sy && el.type === 'text') { // keep vertical centre for text width changes
      cy = F.y + ax * sin; cx = F.x + ax * cos;
    }
    el.x = cx - el.w / 2;
    el.y = cy - el.h / 2;
  }

  strokeElement(pts) {
    const pad = this.draw.width / 2 + 2;
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
    const w = Math.max(...xs) + pad - x0, hh = Math.max(...ys) + pad - y0;
    return makeDrawing({
      x: x0, y: y0, w, h: hh, color: this.draw.color, width: this.draw.width,
      points: pts.map(([x, y]) => [+((x - x0) / w).toFixed(4), +((y - y0) / hh).toFixed(4)]),
    });
  }

  // ---------- element operations ----------
  select(id) {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.closeSheet();
    this.renderToolbar();
    this.render();
  }

  add(el, { center = true } = {}) {
    if (center) {
      el.x = (this.design.width - el.w) / 2;
      el.y = (this.design.height - el.h) / 2;
      // cascade so repeated adds don't stack exactly
      const same = this.page.elements.filter((o) => Math.abs(o.x - el.x) < 1 && Math.abs(o.y - el.y) < 1).length;
      el.x += same * 24; el.y += same * 24;
    }
    this.page.elements.push(el);
    this.mode = 'select';
    this.selectedId = null;
    this.select(el.id);
    this.commit();
    return el;
  }

  addText(o) {
    const scale = this.design.width / 1080;
    const el = makeText({ ...o, fontSize: Math.round((o.fontSize || 48) * scale), w: this.design.width * 0.75 });
    if (o.letterSpacing) el.letterSpacing = o.letterSpacing * scale;
    if (o.stroke) el.stroke = { ...el.stroke, ...o.stroke, width: o.stroke.width * scale };
    if (o.bg) el.bg = { ...el.bg, ...o.bg, pad: o.bg.pad * scale, radius: o.bg.radius * scale };
    fitTextHeight(el);
    // shrink box to content width for single-line text
    if (!el.text.includes('\n')) {
      const c = document.createElement('canvas').getContext('2d');
      c.font = `${el.bold ? 700 : 400} ${el.fontSize}px "${el.fontFamily}"`;
      el.w = Math.min(this.design.width * 0.9, c.measureText(el.text).width + el.fontSize + (el.letterSpacing || 0) * el.text.length);
      fitTextHeight(el);
    }
    document.fonts?.load(`${el.bold ? 700 : 400} 40px "${el.fontFamily}"`).then(() => { fitTextHeight(el); this.render(); });
    return this.add(el);
  }

  baseSize() { return Math.min(this.design.width, this.design.height) * 0.4; }

  async addImageFiles(files, { replace, background } = {}) {
    for (const f of files) {
      const { src, w, h: ih } = await normalizeImage(await readFileAsDataURL(f));
      const id = uid();
      this.design.assets[id] = { src, w, h: ih, name: f.name };
      if (replace) {
        replace.asset = id; replace.zoom = 1; replace.panX = 0; replace.panY = 0;
        this.commit(); this.render();
        return;
      }
      if (background) {
        this.page.background = { type: 'image', asset: id };
        this.commit(); this.render();
        return;
      }
      const k = Math.min(this.design.width * 0.7 / w, this.design.height * 0.7 / ih);
      this.add(makeImage({ asset: id, w: w * k, h: ih * k }));
    }
    toast('عکس اضافه شد');
  }

  duplicate() {
    const el = this.sel;
    if (!el) return;
    const c = { ...clone(el), id: uid(), x: el.x + 30, y: el.y + 30, locked: false };
    const i = this.page.elements.indexOf(el);
    this.page.elements.splice(i + 1, 0, c);
    this.selectedId = c.id;
    this.commit();
    this.refreshUI();
  }

  remove() {
    const el = this.sel;
    if (!el) return;
    this.page.elements = this.page.elements.filter((e) => e !== el);
    this.selectedId = null;
    this.commit();
    this.closeSheet();
    this.refreshUI();
  }

  reorder(dir) {
    const arr = this.page.elements, el = this.sel;
    const i = arr.indexOf(el);
    arr.splice(i, 1);
    const j = dir === 'front' ? arr.length : dir === 'back' ? 0 : clamp(i + (dir === 'up' ? 1 : -1), 0, arr.length);
    arr.splice(j, 0, el);
    this.commit();
    this.render();
  }

  alignTo(where) {
    const el = this.sel, W = this.design.width, H = this.design.height;
    if (!el || el.locked) return;
    if (where === 'left') el.x = 0;
    if (where === 'hcenter') el.x = (W - el.w) / 2;
    if (where === 'right') el.x = W - el.w;
    if (where === 'top') el.y = 0;
    if (where === 'vcenter') el.y = (H - el.h) / 2;
    if (where === 'bottom') el.y = H - el.h;
    this.commit();
    this.render();
  }

  // Apply a change to the selected element: live render; commit when final.
  set(fn, final = true) {
    const el = this.sel;
    if (!el) return;
    fn(el);
    if (el.type === 'text') {
      const cy = el.y + el.h / 2;
      fitTextHeight(el);
      el.y = cy - el.h / 2;
    }
    this.render();
    if (final) this.commit(); else this.commitSoon();
  }

  // ---------- sheets ----------
  openSheet(title, content, { tall = false, onClose } = {}) {
    this.sheetOnClose?.();
    this.sheetOnClose = onClose;
    this.sheet.innerHTML = '';
    this.sheet.classList.toggle('tall', tall);
    this.sheet.append(
      h('div.sheet-head', h('div.sheet-grip'), h('span.sheet-title', title),
        h('button.ib', { title: 'بستن', on: { click: () => this.closeSheet() } }, icon('check'))),
      h('div.sheet-body', content),
    );
    this.sheet.classList.add('open');
    this.activeSheet = title;
  }

  closeSheet() {
    const cb = this.sheetOnClose;
    this.sheetOnClose = null;
    cb?.();
    if (!this.sheet.classList.contains('open')) return;
    this.sheet.classList.remove('open', 'tall');
    this.sheet.innerHTML = '';
    this.activeSheet = null;
    if (this.mode === 'draw') { this.mode = 'select'; this.renderToolbar(); }
  }

  // ---------- toolbars ----------
  renderToolbar() {
    const el = this.sel;
    const items = [];
    const T = (ic, label, fn, on) => items.push({ ic, label, fn, on });
    if (this.mode === 'draw') {
      T('check', 'پایان', () => { this.mode = 'select'; this.closeSheet(); this.renderToolbar(); });
      T('palette', 'رنگ قلم', () => this.openDrawSheet());
    } else if (!el) {
      T('plus', 'افزودن', () => this.openAdd('templates'));
      T('text', 'متن', () => this.openAdd('text'));
      T('shapes', 'عناصر', () => this.openAdd('elements'));
      T('upload', 'آپلود', () => this.openAdd('uploads'));
      T('sticker', 'استیکر', () => this.openAdd('stickers'));
      T('bg', 'پس‌زمینه', () => this.openBackground());
      T('draw', 'قلم', () => { this.mode = 'draw'; this.select(null); this.renderToolbar(); this.openDrawSheet(); });
      T('layers', 'لایه‌ها', () => this.openLayers());
      T('pages', 'صفحات', () => this.openPages());
      T('resize', 'تغییر اندازه', () => this.openResize());
    } else {
      const t = el.type;
      if (t === 'text') {
        T('edit', 'ویرایش', () => this.openTextEdit());
        T('font', 'فونت', () => this.openFonts());
        T('size', 'اندازه', () => this.openFontSize());
        items.push({ swatch: el.color, label: 'رنگ', fn: () => this.openColor('color', 'رنگ متن') });
        T('bold', 'قالب', () => this.openFormat());
        T('spacing', 'فاصله', () => this.openSpacing());
        T('effects', 'افکت', () => this.openTextEffects());
      }
      if (t === 'shape') {
        items.push({ swatch: el.fill, label: 'رنگ', fn: () => this.openColor('fill', 'رنگ شکل') });
        T('stroke', 'حاشیه', () => this.openShapeBorder());
        T('shapes', 'نوع شکل', () => this.openShapeType());
        T('shadow', 'سایه', () => this.openShadow());
      }
      if (t === 'graphic') {
        items.push({ swatch: el.fill, label: 'رنگ', fn: () => this.openColor('fill', 'رنگ گرافیک') });
        T('shadow', 'سایه', () => this.openShadow());
      }
      if (t === 'drawing') {
        items.push({ swatch: el.color, label: 'رنگ', fn: () => this.openColor('color', 'رنگ قلم', false) });
        T('size', 'ضخامت', () => this.openSheet('ضخامت', slider('ضخامت', { min: 1, max: 80, value: el.width, onInput: (v) => this.set((e) => { e.width = v; }, false) })));
        T('shadow', 'سایه', () => this.openShadow());
      }
      if (t === 'sticker') T('shadow', 'سایه', () => this.openShadow());
      if (t === 'image') {
        T('filter', 'فیلتر', () => this.openFilters());
        T('sparkle', 'تنظیم', () => this.openAdjust());
        T('crop', 'برش', () => this.openCrop());
        T('mask', 'قاب', () => this.openMask());
        T('stroke', 'حاشیه', () => this.openImageBorder());
        T('shadow', 'سایه', () => this.openShadow());
        T('image', 'جایگزینی', async () => { const f = await pickFile(); if (f.length) this.addImageFiles([f[0]], { replace: this.sel }); });
        T('bg', 'پس‌زمینه کن', () => {
          const e = this.sel;
          this.page.background = { type: 'image', asset: e.asset, filters: e.filters };
          this.page.elements = this.page.elements.filter((x) => x !== e);
          this.selectedId = null;
          this.commit(); this.refreshUI();
        });
      }
      T('opacity', 'شفافیت', () => this.openSheet('شفافیت', slider('شفافیت', { min: 0, max: 100, value: Math.round(this.sel.opacity * 100), unit: '٪', onInput: (v) => this.set((e) => { e.opacity = v / 100; }, false) })));
      T('position', 'موقعیت', () => this.openPosition());
      T('flip', 'قرینه', () => this.openFlip());
      T('copy', 'کپی', () => this.duplicate());
      T(el.locked ? 'unlock' : 'lock', el.locked ? 'باز کردن' : 'قفل', () => { this.set((e) => { e.locked = !e.locked; }); this.renderToolbar(); toast(this.sel?.locked ? 'قفل شد' : 'قفل باز شد'); });
      T('trash', 'حذف', () => this.remove());
    }
    this.toolbar.innerHTML = '';
    if (el && this.mode === 'select') {
      this.toolbar.append(h('button.tool.tool-close', { title: 'لغو انتخاب', on: { click: () => this.select(null) } }, icon('close', 20), h('span', TYPE_NAMES[el.type])));
    }
    for (const it of items) {
      const ic = it.swatch !== undefined ? h('span.tool-sw', { style: { background: cssFill(it.swatch) } }) : icon(it.ic);
      this.toolbar.append(h('button.tool', { on: { click: it.fn } }, ic, h('span', it.label)));
    }
  }

  // ---------- panels ----------
  openAdd(tab) {
    const tabs = [
      ['templates', 'قالب‌ها'], ['text', 'متن'], ['elements', 'عناصر'], ['uploads', 'آپلود'], ['stickers', 'استیکر'],
    ];
    const body = h('div');
    const bar = h('div.tabs');
    const show = (id) => {
      [...bar.children].forEach((b) => b.classList.toggle('on', b.dataset.id === id));
      body.innerHTML = '';
      body.append(this['add_' + id]());
    };
    tabs.forEach(([id, label]) => bar.append(h('button', { 'data-id': id, on: { click: () => show(id) } }, label)));
    this.openSheet('افزودن', h('div', bar, body), { tall: true });
    show(tab);
  }

  add_templates() {
    const wrap = h('div');
    const fmt = TEMPLATES.filter((t) => t.format.w === this.design.width && t.format.h === this.design.height);
    const list = fmt.length ? fmt : TEMPLATES;
    wrap.append(h('p.hint', fmt.length ? 'قالب‌های هم‌اندازه با طرح شما — صفحه‌ی فعلی جایگزین می‌شود' : 'قالب‌ها (به اندازه‌ی طرح شما مقیاس می‌شوند)'));
    const grid = h('div.grid-thumbs');
    for (const t of list) {
      const img = h('img', { alt: t.name, loading: 'lazy' });
      requestIdleCallback?.(() => { img.src = thumbnail(templatePreviewDesign(t), 240); }) ?? (img.src = thumbnail(templatePreviewDesign(t), 240));
      grid.append(h('button.thumb', { on: { click: () => this.applyTemplate(t) } }, img, h('span', t.name)));
    }
    wrap.append(grid);
    return wrap;
  }

  applyTemplate(t) {
    const d = designFromTemplate(t);
    const sx = this.design.width / d.width, sy = this.design.height / d.height;
    const k = Math.min(sx, sy);
    const dx = (this.design.width - d.width * k) / 2, dy = (this.design.height - d.height * k) / 2;
    const pages = d.pages.map((p) => {
      p.elements.forEach((e) => this.scaleInto(e, k, dx, dy));
      return p;
    });
    const empty = !this.page.elements.length;
    if (empty) this.design.pages.splice(this.pageIndex, 1, ...pages);
    else this.design.pages.splice(this.pageIndex + 1, 0, ...pages);
    if (!empty) this.pageIndex++;
    this.selectedId = null;
    this.closeSheet();
    loadFonts(this.design).then(() => { this.refitText(); this.render(); });
    this.commit();
    this.refreshUI();
    toast(empty ? 'قالب اعمال شد' : 'قالب به‌عنوان صفحه‌ی جدید اضافه شد');
  }

  scaleInto(e, k, dx, dy) {
    e.x = e.x * k + dx; e.y = e.y * k + dy; e.w *= k; e.h *= k;
    if (e.type === 'text') {
      e.fontSize *= k; e.letterSpacing *= k;
      if (e.stroke) e.stroke.width *= k;
      if (e.bg) { e.bg.pad *= k; e.bg.radius *= k; }
    }
    if (e.type === 'shape') { e.strokeWidth *= k; e.radius *= k; }
    if (e.type === 'image') { e.borderWidth *= k; e.radius *= k; }
    if (e.type === 'drawing') e.width *= k;
    if (e.shadow) { e.shadow.blur *= k; e.shadow.x *= k; e.shadow.y *= k; }
  }

  add_text() {
    const wrap = h('div.stack');
    for (const p of TEXT_PRESETS) {
      wrap.append(h('button.text-preset', {
        style: { fontSize: Math.max(15, p.fontSize / 3.2) + 'px', fontWeight: p.bold ? 700 : 400 },
        on: { click: () => { this.addText(p); this.closeSheet(); } },
      }, p.label));
    }
    wrap.append(h('div.cp-title', 'سبک‌های آماده'));
    const grid = h('div.grid-styles');
    for (const s of TEXT_STYLES) {
      const b = h('button.style-card', { on: { click: () => { this.addText(s); this.closeSheet(); } } });
      b.append(h('span', {
        style: {
          fontFamily: `"${s.fontFamily}"`, color: s.color, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal',
          textShadow: s.shadow ? `${s.shadow.x / 3}px ${s.shadow.y / 3}px ${s.shadow.blur / 3}px ${s.shadow.color}` : 'none',
          WebkitTextStroke: s.stroke ? `1px ${s.stroke.color}` : '',
          background: s.bg ? s.bg.color : 'none', padding: s.bg ? '2px 10px' : 0, borderRadius: '6px',
        },
      }, s.text));
      grid.append(b);
    }
    wrap.append(grid);
    return wrap;
  }

  add_elements() {
    const wrap = h('div');
    const search = h('input.search', { type: 'search', placeholder: 'جستجو در عناصر…' });
    wrap.append(search);
    const sh = h('div.grid-icons');
    for (const s of SHAPES) {
      const c = h('canvas', { width: 64, height: 64 });
      const x = c.getContext('2d');
      x.translate(32, 32);
      const isLine = s === 'line' || s === 'dashed';
      const p = shapePath(s, 46, isLine ? 0 : 46, 10);
      if (isLine) { x.lineWidth = 5; x.strokeStyle = '#555'; if (s === 'dashed') x.setLineDash([9, 7]); x.stroke(p); } else { x.fillStyle = '#555'; x.fill(p, 'evenodd'); }
      sh.append(h('button.icon-cell', { title: SHAPE_NAMES[s], 'data-k': SHAPE_NAMES[s] + ' ' + s, on: { click: () => {
        const b = this.baseSize();
        this.add(makeShape({ shape: s, w: b, h: isLine ? 20 : b, strokeWidth: isLine ? Math.max(6, b / 30) : 0, fill: isLine ? '#111111' : '#8c52ff', radius: s === 'rounded' ? b / 6 : 0 }));
        this.closeSheet();
      } } }, c));
    }
    const gr = h('div.grid-icons');
    for (const [k, d] of Object.entries(GRAPHICS)) {
      gr.append(h('button.icon-cell', { title: k, 'data-k': k, on: { click: () => {
        this.add(makeGraphic({ graphic: k, w: this.baseSize(), h: this.baseSize(), fill: '#111111' }));
        this.closeSheet();
      } }, html: `<svg viewBox="0 0 24 24" width="38" height="38"><path fill="currentColor" fill-rule="evenodd" d="${d}"/></svg>` }));
    }
    wrap.append(h('div.cp-title', 'شکل‌ها و خطوط'), sh, h('div.cp-title', 'گرافیک‌ها و آیکون‌ها'), gr);
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      wrap.querySelectorAll('.icon-cell').forEach((b) => { b.hidden = q && !b.dataset.k.toLowerCase().includes(q); });
    });
    return wrap;
  }

  add_stickers() {
    const grid = h('div.grid-emoji');
    for (const e of STICKERS) {
      grid.append(h('button', { on: { click: () => { const s = this.baseSize() * 0.7; this.add(makeSticker({ emoji: e, w: s, h: s })); this.closeSheet(); } } }, e));
    }
    return grid;
  }

  add_uploads() {
    const wrap = h('div');
    wrap.append(h('div.row-btns',
      h('button.btn.btn-primary', { on: { click: async () => { const f = await pickFile(); if (f.length) { this.closeSheet(); await this.addImageFiles(f); } } } }, icon('upload', 18), 'آپلود از گالری'),
      h('button.btn', { on: { click: async () => { const f = await pickFile('image/*', 'environment'); if (f.length) { this.closeSheet(); await this.addImageFiles(f); } } } }, icon('camera', 18), 'دوربین'),
    ));
    const assets = Object.entries(this.design.assets);
    if (!assets.length) wrap.append(h('p.hint', 'هنوز عکسی آپلود نکرده‌اید. عکس‌های شما در این طرح نگه داشته می‌شوند.'));
    const grid = h('div.grid-thumbs.sq');
    for (const [id, a] of assets) {
      grid.append(h('button.thumb', { on: { click: () => {
        const k = Math.min(this.design.width * 0.7 / a.w, this.design.height * 0.7 / a.h);
        this.add(makeImage({ asset: id, w: a.w * k, h: a.h * k }));
        this.closeSheet();
      } } }, h('img', { src: a.src, alt: '' })));
    }
    wrap.append(grid);
    return wrap;
  }

  openTextEdit() {
    const el = this.sel;
    if (!el || el.type !== 'text') return;
    const ta = h('textarea.text-edit', { rows: 3, dir: 'auto' });
    ta.value = el.text;
    ta.addEventListener('input', () => this.set((e) => {
      e.text = ta.value || ' ';
      // grow the box (around its centre) up to 90% of the page so lines don't wrap word-by-word
      const c = document.createElement('canvas').getContext('2d');
      c.font = fontString(e);
      const natural = Math.max(...e.text.split('\n').map((l) => c.measureText(e.uppercase ? l.toUpperCase() : l).width + (e.letterSpacing || 0) * l.length));
      const w = Math.min(this.design.width * 0.9, natural + e.fontSize * 0.5);
      if (w > e.w) { const cx = e.x + e.w / 2; e.w = w; e.x = cx - w / 2; }
    }, false));
    this.openSheet('ویرایش متن', ta, { onClose: () => this.commit() });
    setTimeout(() => { ta.focus(); ta.select(); }, 50);
  }

  openFonts() {
    const el = this.sel;
    const list = h('div.font-list');
    for (const f of FONTS) {
      const b = h('button.font-item', { style: { fontFamily: `"${f.family}"` }, on: { click: async () => {
        list.querySelectorAll('.on').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        await document.fonts?.load(`${el.bold ? 700 : 400} 40px "${f.family}"`).catch(() => {});
        this.set((e) => { e.fontFamily = f.family; });
      } } }, h('span', f.label), h('small', f.fa ? 'ابجد هوز' : 'Aa Bb Cc'));
      if (f.family === el.fontFamily) b.classList.add('on');
      list.append(b);
    }
    this.openSheet('فونت', list, { tall: true });
  }

  openFontSize() {
    const el = this.sel;
    const max = Math.round(this.design.width / 3);
    this.openSheet('اندازه فونت', h('div',
      slider('اندازه', { min: 6, max, value: Math.round(el.fontSize), onInput: (v) => this.set((e) => { e.fontSize = v; }, false) }),
      h('div.chips', [24, 36, 48, 64, 96, 128, 160, 220].map((s) => h('button.chip', { on: { click: () => { this.set((e) => { e.fontSize = s * this.design.width / 1080; }); this.openFontSize(); } } }, fa(s)))),
    ));
  }

  openColor(prop, title, gradients = true) {
    const el = this.sel;
    this.openSheet(title, colorPicker({
      value: el[prop], gradients, docColors: this.docColors(), transparent: prop === 'fill' && el.type === 'shape',
      onPick: (c) => { this.set((e) => { e[prop] = c; }, false); this.renderToolbar(); },
    }), { tall: true });
  }

  openFormat() {
    const el = this.sel;
    const b = (k, ic, label) => {
      const btn = h('button.fmt', { title: label, on: { click: () => { this.set((e) => { e[k] = !e[k]; }); btn.classList.toggle('on', !!this.sel[k]); } } }, icon(ic));
      if (el[k]) btn.classList.add('on');
      return btn;
    };
    this.openSheet('قالب‌بندی متن', h('div.stack',
      h('div.fmt-row', b('bold', 'bold', 'ضخیم'), b('italic', 'italic', 'کج'), b('underline', 'underline', 'زیرخط'), b('uppercase', 'uppercase', 'حروف بزرگ')),
      h('div.cp-title', 'تراز'),
      segmented([{ icon: 'alignR', value: 'right', label: 'راست' }, { icon: 'alignC', value: 'center', label: 'وسط' }, { icon: 'alignL', value: 'left', label: 'چپ' }], el.align, (v) => this.set((e) => { e.align = v; })),
    ));
  }

  openSpacing() {
    const el = this.sel;
    this.openSheet('فاصله‌گذاری', h('div.stack',
      slider('فاصله حروف', { min: -10, max: 60, value: Math.round(el.letterSpacing), onInput: (v) => this.set((e) => { e.letterSpacing = v; }, false) }),
      slider('فاصله خطوط', { min: 0.6, max: 3, step: 0.05, value: el.lineHeight, onInput: (v) => this.set((e) => { e.lineHeight = v; }, false) }),
    ));
  }

  openTextEffects() {
    const el = this.sel;
    const body = h('div.stack');
    const presets = [
      ['هیچ', (e) => { e.shadow.on = false; e.stroke.on = false; e.bg.on = false; }],
      ['سایه', (e) => { e.shadow = { on: true, color: 'rgba(0,0,0,0.45)', blur: e.fontSize * 0.2, x: e.fontSize * 0.05, y: e.fontSize * 0.08 }; }],
      ['بلند', (e) => { e.shadow = { on: true, color: '#000000', blur: 0, x: e.fontSize * 0.07, y: e.fontSize * 0.07 }; }],
      ['نئون', (e) => { e.shadow = { on: true, color: typeof e.color === 'string' ? e.color : '#ff00e6', blur: e.fontSize * 0.5, x: 0, y: 0 }; }],
      ['توخالی', (e) => { e.stroke = { on: true, color: typeof e.color === 'string' ? e.color : '#111', width: Math.max(1, e.fontSize * 0.03) }; e.color = 'transparent'; }],
      ['حاشیه', (e) => { e.stroke = { on: true, color: '#ffffff', width: Math.max(1, e.fontSize * 0.06) }; }],
      ['هایلایت', (e) => { e.bg = { on: true, color: '#ffde59', pad: e.fontSize * 0.25, radius: e.fontSize * 0.15 }; }],
    ];
    body.append(h('div.chips', presets.map(([n, fn]) => h('button.chip', { on: { click: () => { this.set(fn); this.openTextEffects(); } } }, n))));
    const fs = el.fontSize;
    body.append(...[
      toggle('سایه', el.shadow.on, (v) => { this.set((e) => { e.shadow.on = v; }); this.openTextEffects(); }),
      el.shadow.on && h('div.sub',
        slider('محوشدگی', { min: 0, max: Math.round(fs), value: Math.round(el.shadow.blur), onInput: (v) => this.set((e) => { e.shadow.blur = v; }, false) }),
        slider('فاصله X', { min: -Math.round(fs / 2), max: Math.round(fs / 2), value: Math.round(el.shadow.x), onInput: (v) => this.set((e) => { e.shadow.x = v; }, false) }),
        slider('فاصله Y', { min: -Math.round(fs / 2), max: Math.round(fs / 2), value: Math.round(el.shadow.y), onInput: (v) => this.set((e) => { e.shadow.y = v; }, false) }),
        this.miniColors(el.shadow.color, (c) => this.set((e) => { e.shadow.color = c; }))),
      toggle('حاشیه دور حروف', el.stroke.on, (v) => { this.set((e) => { e.stroke.on = v; }); this.openTextEffects(); }),
      el.stroke.on && h('div.sub',
        slider('ضخامت', { min: 0, max: Math.max(10, Math.round(fs / 5)), value: Math.round(el.stroke.width), onInput: (v) => this.set((e) => { e.stroke.width = v; }, false) }),
        this.miniColors(el.stroke.color, (c) => this.set((e) => { e.stroke.color = c; }))),
      toggle('کادر پس‌زمینه', el.bg.on, (v) => { this.set((e) => { e.bg.on = v; }); this.openTextEffects(); }),
      el.bg.on && h('div.sub',
        slider('فاصله داخلی', { min: 0, max: Math.round(fs), value: Math.round(el.bg.pad), onInput: (v) => this.set((e) => { e.bg.pad = v; }, false) }),
        slider('گردی گوشه', { min: 0, max: Math.round(fs), value: Math.round(el.bg.radius), onInput: (v) => this.set((e) => { e.bg.radius = v; }, false) }),
        this.miniColors(el.bg.color, (c) => this.set((e) => { e.bg.color = c; }))),
    ].filter(Boolean));
    this.openSheet('افکت متن', body, { tall: true });
  }

  miniColors(value, onPick) {
    const row = h('div.cp-row.mini');
    const custom = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000' });
    custom.addEventListener('input', () => onPick(custom.value));
    row.append(h('label.sw.sw-add', icon('plus', 16), custom));
    for (const c of ['#000000', '#ffffff', '#ff3131', '#ffde59', '#00bf63', '#38b6ff', '#8c52ff', '#ff66c4', 'rgba(0,0,0,0.4)']) {
      row.append(swatch(c, () => { rememberColor(c); onPick(c); }, { selected: c === value }));
    }
    return row;
  }

  openShadow() {
    const el = this.sel;
    const s = Math.max(el.w, el.h);
    this.openSheet('سایه', h('div.stack',
      toggle('فعال', el.shadow.on, (v) => { this.set((e) => { e.shadow.on = v; }); this.openShadow(); }),
      el.shadow.on && h('div.sub',
        slider('محوشدگی', { min: 0, max: Math.round(s / 3), value: Math.round(el.shadow.blur), onInput: (v) => this.set((e) => { e.shadow.blur = v; }, false) }),
        slider('فاصله X', { min: -Math.round(s / 4), max: Math.round(s / 4), value: Math.round(el.shadow.x), onInput: (v) => this.set((e) => { e.shadow.x = v; }, false) }),
        slider('فاصله Y', { min: -Math.round(s / 4), max: Math.round(s / 4), value: Math.round(el.shadow.y), onInput: (v) => this.set((e) => { e.shadow.y = v; }, false) }),
        this.miniColors(el.shadow.color, (c) => this.set((e) => { e.shadow.color = c; }))),
    ));
  }

  openShapeBorder() {
    const el = this.sel;
    const isLine = el.shape === 'line' || el.shape === 'dashed';
    const max = Math.round(Math.min(el.w, el.h) / 2) || 50;
    this.openSheet(isLine ? 'ضخامت خط' : 'حاشیه و گوشه', h('div.stack',
      slider(isLine ? 'ضخامت' : 'ضخامت حاشیه', { min: 0, max: isLine ? 80 : Math.max(20, Math.round(max / 2)), value: Math.round(el.strokeWidth), onInput: (v) => this.set((e) => { e.strokeWidth = v; if (isLine) e.h = Math.max(e.h, v + 4); }, false) }),
      !isLine && this.miniColors(el.strokeColor, (c) => this.set((e) => { e.strokeColor = c; if (!e.strokeWidth) e.strokeWidth = 6; })),
      (el.shape === 'rect' || el.shape === 'rounded') && slider('گردی گوشه', { min: 0, max, value: Math.round(el.radius), onInput: (v) => this.set((e) => { e.radius = v; e.shape = 'rect'; }, false) }),
    ));
  }

  openShapeType() {
    const grid = h('div.grid-icons');
    for (const s of SHAPES.filter((x) => x !== 'line' && x !== 'dashed')) {
      const c = h('canvas', { width: 56, height: 56 });
      const x = c.getContext('2d');
      x.translate(28, 28);
      x.fillStyle = '#555';
      x.fill(shapePath(s, 40, 40, 8), 'evenodd');
      grid.append(h('button.icon-cell', { title: SHAPE_NAMES[s], on: { click: () => this.set((e) => { e.shape = s; }) } }, c));
    }
    this.openSheet('نوع شکل', grid);
  }

  filterThumb(f) {
    const el = this.sel;
    const src = this.design.assets[el.asset]?.src;
    const img = getImage(src);
    const c = h('canvas', { width: 72, height: 72 });
    if (img) {
      const x = c.getContext('2d');
      const k = Math.max(72 / img.naturalWidth, 72 / img.naturalHeight);
      x.filter = Object.entries({ ...DEFAULT_FILTERS, ...f }).map(([n, v]) => ({
        brightness: `brightness(${v}%)`, contrast: `contrast(${v}%)`, saturate: `saturate(${v}%)`, blur: `blur(${v / 4}px)`,
        grayscale: `grayscale(${v}%)`, sepia: `sepia(${v}%)`, hue: `hue-rotate(${v}deg)`, invert: `invert(${v}%)`,
      })[n]).join(' ');
      x.drawImage(img, (72 - img.naturalWidth * k) / 2, (72 - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    }
    return c;
  }

  openFilters() {
    const row = h('div.filter-row');
    for (const p of FILTER_PRESETS) {
      row.append(h('button.filter-cell', { on: { click: () => this.set((e) => { e.filters = { ...DEFAULT_FILTERS, ...p.f }; }) } }, this.filterThumb(p.f), h('span', p.name)));
    }
    this.openSheet('فیلترها', row);
  }

  openAdjust() {
    const el = this.sel;
    const f = el.filters;
    const s = (label, k, min, max) => slider(label, { min, max, value: f[k], onInput: (v) => this.set((e) => { e.filters[k] = v; }, false) });
    this.openSheet('تنظیمات عکس', h('div.stack',
      s('روشنایی', 'brightness', 0, 200), s('کنتراست', 'contrast', 0, 200), s('اشباع رنگ', 'saturate', 0, 300),
      s('رنگ (Hue)', 'hue', -180, 180), s('سیاه‌سفید', 'grayscale', 0, 100), s('سپیا', 'sepia', 0, 100),
      s('محو', 'blur', 0, 30), s('نگاتیو', 'invert', 0, 100),
      h('button.btn', { on: { click: () => { this.set((e) => { e.filters = { ...DEFAULT_FILTERS }; }); this.openAdjust(); } } }, 'بازنشانی'),
    ), { tall: true });
  }

  openCrop() {
    const el = this.sel;
    if (!el || el.type !== 'image') return;
    const a = this.design.assets[el.asset];
    this.openSheet('برش و بزرگنمایی', h('div.stack',
      slider('بزرگنمایی', { min: 1, max: 4, step: 0.01, value: el.zoom, onInput: (v) => this.set((e) => { e.zoom = v; }, false) }),
      slider('افقی', { min: -1, max: 1, step: 0.01, value: el.panX, onInput: (v) => this.set((e) => { e.panX = v; }, false) }),
      slider('عمودی', { min: -1, max: 1, step: 0.01, value: el.panY, onInput: (v) => this.set((e) => { e.panY = v; }, false) }),
      h('div.chips', [['اصلی', a ? a.w / a.h : 1], ['۱:۱', 1], ['۴:۵', 0.8], ['۱۶:۹', 16 / 9], ['۹:۱۶', 9 / 16], ['۳:۲', 1.5]].map(([n, r]) => h('button.chip', { on: { click: () => this.set((e) => {
        const area = e.w * e.h, cx = e.x + e.w / 2, cy = e.y + e.h / 2;
        e.w = Math.sqrt(area * r); e.h = e.w / r; e.x = cx - e.w / 2; e.y = cy - e.h / 2;
      }) } }, n))),
    ));
  }

  openMask() {
    const grid = h('div.grid-icons');
    for (const m of MASKS) {
      const c = h('canvas', { width: 56, height: 56 });
      const x = c.getContext('2d');
      x.translate(28, 28);
      x.fillStyle = '#555';
      x.fill(shapePath(m === 'rect' ? 'rect' : m, 40, 40, m === 'rounded' ? 10 : 0), 'evenodd');
      grid.append(h('button.icon-cell', { title: SHAPE_NAMES[m], on: { click: () => this.set((e) => { e.mask = m; if (m === 'rounded') e.mask = 'rect', e.radius = Math.min(e.w, e.h) * 0.12; else if (m === 'rect') e.radius = 0; }) } }, c));
    }
    this.openSheet('قاب عکس', h('div', grid, h('p.hint', 'برای عکس دایره‌ای کامل، از «برش» نسبت ۱:۱ را انتخاب کنید.')));
  }

  openImageBorder() {
    const el = this.sel;
    this.openSheet('حاشیه عکس', h('div.stack',
      slider('ضخامت', { min: 0, max: Math.round(Math.min(el.w, el.h) / 6), value: Math.round(el.borderWidth), onInput: (v) => this.set((e) => { e.borderWidth = v; }, false) }),
      el.mask === 'rect' && slider('گردی گوشه', { min: 0, max: Math.round(Math.min(el.w, el.h) / 2), value: Math.round(el.radius), onInput: (v) => this.set((e) => { e.radius = v; }, false) }),
      this.miniColors(el.borderColor, (c) => this.set((e) => { e.borderColor = c; if (!e.borderWidth) e.borderWidth = 8; })),
    ));
  }

  openPosition() {
    const el = this.sel;
    const num = (label, k) => {
      const inp = h('input', { type: 'number', value: Math.round(el[k]) });
      inp.addEventListener('change', () => this.set((e) => {
        const v = +inp.value;
        if ((k === 'w' || k === 'h') && v > 0) {
          const kk = v / e[k];
          if (e.type === 'text' && k === 'w') e.w = v;
          else if (['sticker', 'graphic'].includes(e.type)) { e.w *= kk; e.h *= kk; } else e[k] = v;
        } else if (k !== 'w' && k !== 'h') e[k] = v;
      }));
      return h('label.num', h('span', label), inp);
    };
    this.openSheet('موقعیت و ترتیب', h('div.stack',
      h('div.cp-title', 'ترتیب لایه'),
      h('div.row-btns',
        h('button.btn', { on: { click: () => this.reorder('front') } }, icon('front', 18), 'بالاترین'),
        h('button.btn', { on: { click: () => this.reorder('up') } }, icon('up', 18), 'بالا'),
        h('button.btn', { on: { click: () => this.reorder('down') } }, icon('down', 18), 'پایین'),
        h('button.btn', { on: { click: () => this.reorder('back') } }, icon('backward', 18), 'پایین‌ترین')),
      h('div.cp-title', 'تراز با صفحه'),
      h('div.row-btns.wrap',
        ...[['right', 'راست'], ['hcenter', 'وسط افقی'], ['left', 'چپ'], ['top', 'بالا'], ['vcenter', 'وسط عمودی'], ['bottom', 'پایین']]
          .map(([k, l]) => h('button.btn.btn-sm', { on: { click: () => this.alignTo(k) } }, l))),
      h('div.cp-title', 'ابعاد دقیق'),
      h('div.num-grid', num('X', 'x'), num('Y', 'y'), num('عرض', 'w'), num('ارتفاع', 'h'), num('چرخش°', 'rotation')),
    ), { tall: true });
  }

  openFlip() {
    const el = this.sel;
    this.openSheet('قرینه و چرخش', h('div.stack',
      h('div.row-btns',
        h('button.btn', { on: { click: () => this.set((e) => { e.flipX = !e.flipX; }) } }, icon('flip', 18), 'قرینه افقی'),
        h('button.btn', { on: { click: () => this.set((e) => { e.flipY = !e.flipY; }) } }, h('span.rot90', icon('flip', 18)), 'قرینه عمودی')),
      slider('چرخش', { min: -180, max: 180, value: Math.round(el.rotation), unit: '°', onInput: (v) => this.set((e) => { e.rotation = v; }, false) }),
    ));
  }

  openDrawSheet() {
    const body = h('div.stack',
      slider('ضخامت قلم', { min: 1, max: 80, value: this.draw.width, onInput: (v) => { this.draw.width = v; } }),
      this.miniColors(this.draw.color, (c) => { this.draw.color = c; this.openDrawSheet(); }),
      h('p.hint', 'روی صفحه بکشید. برای پایان، «پایان» را بزنید.'),
    );
    this.openSheet('قلم', body, { onClose: () => { this.mode = 'select'; this.renderToolbar(); } });
    this.mode = 'draw';
  }

  openBackground() {
    const bg = this.page.background;
    const cur = bg.type === 'gradient' ? bg.gradient : bg.color;
    const body = h('div');
    body.append(h('div.row-btns',
      h('button.btn', { on: { click: async () => { const f = await pickFile(); if (f.length) { await this.addImageFiles([f[0]], { background: true }); this.openBackground(); } } } }, icon('image', 18), 'عکس پس‌زمینه'),
      h('button.btn', { on: { click: () => { this.page.background = { type: 'transparent' }; this.commit(); this.render(); } } }, 'شفاف'),
    ));
    if (bg.type === 'image') {
      const f = bg.filters || (bg.filters = { ...DEFAULT_FILTERS });
      body.append(
        slider('روشنایی', { min: 0, max: 200, value: f.brightness, onInput: (v) => { f.brightness = v; this.render(); this.commitSoon(); } }),
        slider('محو', { min: 0, max: 30, value: f.blur, onInput: (v) => { f.blur = v; this.render(); this.commitSoon(); } }),
      );
    }
    body.append(colorPicker({
      value: cur, docColors: this.docColors(),
      onPick: (c) => {
        this.page.background = typeof c === 'string' ? { type: 'color', color: c } : { type: 'gradient', gradient: c };
        this.render(); this.commitSoon();
      },
    }));
    body.append(h('button.btn.full', { on: { click: () => {
      const b = clone(this.page.background);
      this.design.pages.forEach((p) => { p.background = clone(b); });
      this.commit(); toast('روی همه‌ی صفحات اعمال شد');
    } } }, 'اعمال روی همه‌ی صفحات'));
    this.openSheet('پس‌زمینه', body, { tall: true });
  }

  openLayers() {
    const list = h('div.layer-list');
    const els = [...this.page.elements].reverse();
    if (!els.length) list.append(h('p.hint', 'این صفحه هنوز عنصری ندارد.'));
    for (const el of els) {
      const c = h('canvas', { width: 48, height: 48 });
      const x = c.getContext('2d');
      const k = 40 / Math.max(el.w, el.h);
      x.translate(24, 24); x.scale(k, k);
      drawElement(x, { ...el, x: -el.w / 2, y: -el.h / 2, rotation: 0, hidden: false, shadow: { on: false } }, this.design, k);
      const name = el.type === 'text' ? el.text.slice(0, 24) : el.type === 'shape' ? SHAPE_NAMES[el.shape] : TYPE_NAMES[el.type];
      const row = h('div.layer' + (el.id === this.selectedId ? '.on' : ''),
        h('button.layer-main', { on: { click: () => { this.selectedId = el.id; this.renderToolbar(); this.render(); this.openLayers(); } } }, c, h('span', name)),
        h('button.ib', { title: 'نمایش', on: { click: () => { el.hidden = !el.hidden; this.commit(); this.render(); this.openLayers(); } } }, icon(el.hidden ? 'eyeOff' : 'eye', 18)),
        h('button.ib', { title: 'قفل', on: { click: () => { el.locked = !el.locked; this.commit(); this.render(); this.openLayers(); } } }, icon(el.locked ? 'lock' : 'unlock', 18)),
        h('button.ib', { title: 'بالا', on: { click: () => { this.selectedId = el.id; this.reorder('up'); this.openLayers(); } } }, icon('up', 18)),
        h('button.ib', { title: 'پایین', on: { click: () => { this.selectedId = el.id; this.reorder('down'); this.openLayers(); } } }, icon('down', 18)),
      );
      list.append(row);
    }
    this.openSheet('لایه‌ها', list, { tall: true });
  }

  openPages() {
    const grid = h('div.page-grid');
    this.design.pages.forEach((p, i) => {
      const img = h('img', { src: pageToCanvas(p, this.design, 160 / Math.max(this.design.width, this.design.height)).toDataURL('image/jpeg', 0.7), alt: '' });
      grid.append(h('div.page-card' + (i === this.pageIndex ? '.on' : ''),
        h('button.page-thumb', { on: { click: () => { this.goPage(i); } } }, img, h('span', fa(i + 1))),
        h('div.page-actions',
          h('button.ib', { title: 'جابجایی به قبل', disabled: i === 0, on: { click: () => this.movePage(i, -1) } }, icon('back', 16)),
          h('button.ib', { title: 'تکثیر', on: { click: () => {
            const c = clone(p); c.id = uid(); c.elements.forEach((e) => { e.id = uid(); });
            this.design.pages.splice(i + 1, 0, c); this.pageIndex = i + 1; this.commit(); this.refreshUI(); this.openPages();
          } } }, icon('copy', 16)),
          h('button.ib', { title: 'حذف', disabled: this.design.pages.length < 2, on: { click: () => {
            if (!confirm('این صفحه حذف شود؟')) return;
            this.design.pages.splice(i, 1); this.pageIndex = Math.min(this.pageIndex, this.design.pages.length - 1);
            this.selectedId = null; this.commit(); this.refreshUI(); this.openPages();
          } } }, icon('trash', 16)),
          h('button.ib.flip-x', { title: 'جابجایی به بعد', disabled: i === this.design.pages.length - 1, on: { click: () => this.movePage(i, 1) } }, icon('back', 16)),
        )));
    });
    grid.append(h('button.page-add', { on: { click: () => {
      const bg = clone(this.page.background);
      this.design.pages.splice(this.pageIndex + 1, 0, makePage({ background: bg.type === 'image' ? { type: 'color', color: '#ffffff' } : bg }));
      this.pageIndex++; this.selectedId = null; this.commit(); this.refreshUI(); this.openPages();
    } } }, icon('plus', 28), h('span', 'صفحه جدید')));
    this.openSheet('صفحات', grid, { tall: true });
  }

  movePage(i, d) {
    const arr = this.design.pages;
    const [p] = arr.splice(i, 1);
    arr.splice(i + d, 0, p);
    this.pageIndex = i + d;
    this.commit(); this.refreshUI(); this.openPages();
  }

  openResize() {
    const W = h('input', { type: 'number', value: this.design.width, min: 50, max: 8000 });
    const H = h('input', { type: 'number', value: this.design.height, min: 50, max: 8000 });
    let copy = false;
    const go = (w, hh) => {
      if (!(w >= 50 && hh >= 50 && w <= 8000 && hh <= 8000)) { toast('اندازه نامعتبر است'); return; }
      if (copy) {
        const d = makeDesign({ name: this.design.name + ' (' + fa(w) + '×' + fa(hh) + ')', w: this.design.width, h: this.design.height, pages: clone(this.design.pages), assets: this.design.assets });
        this.resizeDesign(d, w, hh);
        saveDesign(d).then(async () => { toast('نسخه‌ی جدید ساخته شد'); await this.save(); this.destroy(); this.onExit?.(d.id); });
        return;
      }
      this.resizeDesign(this.design, w, hh);
      this.selectedId = null;
      this.fit(); this.commit(); this.refreshUI(); this.closeSheet();
      toast('اندازه تغییر کرد');
    };
    this.openSheet('تغییر اندازه جادویی', h('div.stack',
      h('div.chips', FORMATS.map((f) => h('button.chip', { on: { click: () => { W.value = f.w; H.value = f.h; } } }, f.name))),
      h('div.num-grid', h('label.num', h('span', 'عرض'), W), h('label.num', h('span', 'ارتفاع'), H)),
      toggle('ساخت نسخه‌ی جدید (طرح فعلی دست‌نخورده بماند)', copy, (v) => { copy = v; }),
      h('button.btn.btn-primary.full', { on: { click: () => go(+W.value, +H.value) } }, icon('resize', 18), 'تغییر اندازه'),
    ), { tall: true });
  }

  resizeDesign(d, w, hh) {
    const k = Math.min(w / d.width, hh / d.height);
    const dx = (w - d.width * k) / 2, dy = (hh - d.height * k) / 2;
    for (const p of d.pages) for (const e of p.elements) this.scaleInto(e, k, dx, dy);
    d.width = w; d.height = hh;
  }

  openExport() {
    this.select(null);
    const opt = { format: 'png', scale: 1, quality: 0.92, transparent: false, all: true };
    const body = h('div.stack');
    const draw = () => {
      body.innerHTML = '';
      const maxScale = Math.min(3, 8000 / Math.max(this.design.width, this.design.height));
      body.append(...[
        h('div.cp-title', 'نوع فایل'),
        segmented([{ label: 'PNG', value: 'png' }, { label: 'JPG', value: 'jpg' }, { label: 'PDF', value: 'pdf' }], opt.format, (v) => { opt.format = v; draw(); }),
        h('div.cp-title', 'کیفیت / اندازه'),
        segmented([0.5, 1, 2, 3].filter((s) => s <= maxScale).map((s) => ({ label: `${fa(s)}x (${fa(Math.round(this.design.width * s))}×${fa(Math.round(this.design.height * s))})`, value: s })), opt.scale, (v) => { opt.scale = v; }),
        opt.format !== 'png' && slider('فشرده‌سازی', { min: 50, max: 100, value: Math.round(opt.quality * 100), unit: '٪', onInput: (v) => { opt.quality = v / 100; } }),
        opt.format === 'png' && toggle('پس‌زمینه شفاف', opt.transparent, (v) => { opt.transparent = v; }),
        this.design.pages.length > 1 && segmented([{ label: `همه صفحات (${fa(this.design.pages.length)})`, value: true }, { label: 'فقط صفحه فعلی', value: false }], opt.all, (v) => { opt.all = v; }),
        h('div.row-btns',
          h('button.btn.btn-primary', { on: { click: () => run(false) } }, icon('download', 18), 'دانلود'),
          h('button.btn', { on: { click: () => run(true) } }, icon('share', 18), 'اشتراک‌گذاری')),
      ].filter(Boolean));
    };
    const run = async (share) => {
      toast('در حال آماده‌سازی…');
      try {
        const files = await exportDesign(this.design, { ...opt, pages: opt.all ? null : [this.pageIndex] });
        if (share) {
          const ok = await shareFiles(files, this.design.name).catch((e) => { if (e?.name === 'AbortError') return true; throw e; });
          if (!ok) { downloadFiles(files); toast('اشتراک‌گذاری پشتیبانی نمی‌شود؛ فایل دانلود شد'); }
        } else { downloadFiles(files); toast('دانلود شد ✓'); }
      } catch (e) {
        console.error(e);
        toast('خطا در خروجی گرفتن');
      }
    };
    draw();
    this.openSheet('دانلود و اشتراک', body, { tall: true });
  }

  rename() {
    const n = prompt('نام طرح', this.design.name);
    if (n && n.trim()) {
      this.design.name = n.trim();
      this.titleEl.textContent = this.design.name;
      this.saveSoon();
    }
  }

  async exit() {
    await this.save();
    this.destroy();
    this.onExit?.();
  }

  destroy() {
    this.ro?.disconnect();
    window.removeEventListener('keydown', this.keyHandler);
    setAsyncLoadHandler(() => {});
  }
}
