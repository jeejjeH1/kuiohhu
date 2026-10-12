// Canvas renderer: draws a page (background + elements). Used both by the
// on-screen editor and for thumbnails / exports, so what you see is what you get.
import { GRAPHICS, DEFAULT_FILTERS } from './model.js';

const imgCache = new Map();
let onAsyncLoad = () => {};
export function setAsyncLoadHandler(fn) { onAsyncLoad = fn; }

export function getImage(src) {
  if (!src) return null;
  let e = imgCache.get(src);
  if (!e) {
    const img = new Image();
    e = { img, ready: false };
    img.onload = () => { e.ready = true; onAsyncLoad(); };
    img.src = src;
    imgCache.set(src, e);
  }
  return e.ready ? e.img : null;
}

export function preloadImages(srcs) {
  return Promise.all(srcs.filter(Boolean).map((src) => new Promise((res) => {
    const e = imgCache.get(src);
    if (e?.ready) return res();
    getImage(src);
    const ent = imgCache.get(src);
    ent.img.addEventListener('load', res, { once: true });
    ent.img.addEventListener('error', res, { once: true });
  })));
}

const pathCache = new Map();
const path2d = (d) => {
  let p = pathCache.get(d);
  if (!p) { p = new Path2D(d); pathCache.set(d, p); }
  return p;
};

const RTL = /[֐-ࣿיִ-ﻼ]/;

export function fontString(el, size = el.fontSize) {
  return `${el.italic ? 'italic ' : ''}${el.bold ? '700' : '400'} ${size}px "${el.fontFamily}", "Vazirmatn", sans-serif`;
}

let measureCtx;
function mctx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

function setSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

// Word-wraps text to the element width. Returns lines and total height.
export function layoutText(el) {
  const ctx = mctx();
  ctx.font = fontString(el);
  setSpacing(ctx, el.letterSpacing || 0);
  const text = el.uppercase ? el.text.toUpperCase() : el.text;
  const maxW = Math.max(10, el.w);
  const lines = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    lines.push(line);
  }
  const lh = el.fontSize * el.lineHeight;
  return { lines, lh, height: Math.max(lh, lines.length * lh) };
}

export function fitTextHeight(el) {
  el.h = Math.ceil(layoutText(el).height);
  return el;
}

export function makeFill(ctx, fill, w, h) {
  if (!fill || typeof fill === 'string') return fill || 'transparent';
  if (fill.type === 'linear') {
    const a = ((fill.angle ?? 90) - 90) * Math.PI / 180;
    const r = Math.abs(w / 2 * Math.cos(a)) + Math.abs(h / 2 * Math.sin(a));
    const g = ctx.createLinearGradient(-Math.cos(a) * r, -Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r);
    fill.colors.forEach((c, i) => g.addColorStop(i / (fill.colors.length - 1), c));
    return g;
  }
  if (fill.type === 'radial') {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.hypot(w, h) / 2);
    fill.colors.forEach((c, i) => g.addColorStop(i / (fill.colors.length - 1), c));
    return g;
  }
  return '#000';
}

function poly(p, n, w, h, rot = -Math.PI / 2, inner = 0) {
  const pts = inner ? n * 2 : n;
  for (let i = 0; i < pts; i++) {
    const a = rot + (i * Math.PI * 2) / pts;
    const k = inner && i % 2 ? inner : 1;
    const x = Math.cos(a) * w / 2 * k, y = Math.sin(a) * h / 2 * k;
    i ? p.lineTo(x, y) : p.moveTo(x, y);
  }
  p.closePath();
}

// Shape outline centred on the origin and filling a w x h box.
export function shapePath(kind, w, h, radius = 0) {
  const p = new Path2D();
  const x = -w / 2, y = -h / 2;
  switch (kind) {
    case 'rounded': case 'rect': {
      const r = Math.min(kind === 'rounded' ? Math.max(radius, 1) : radius, w / 2, h / 2);
      if (r > 0 && p.roundRect) p.roundRect(x, y, w, h, r); else p.rect(x, y, w, h);
      break;
    }
    case 'ellipse': case 'circle': p.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'ring':
      p.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      p.ellipse(0, 0, w / 2 * 0.62, h / 2 * 0.62, 0, Math.PI * 2, 0, true);
      break;
    case 'triangle': p.moveTo(0, y); p.lineTo(w / 2, h / 2); p.lineTo(x, h / 2); p.closePath(); break;
    case 'diamond': poly(p, 4, w, h); break;
    case 'pentagon': poly(p, 5, w, h); break;
    case 'hexagon': poly(p, 6, w, h, 0); break;
    case 'star': poly(p, 5, w, h, -Math.PI / 2, 0.45); break;
    case 'star4': poly(p, 4, w, h, -Math.PI / 2, 0.35); break;
    case 'heart':
      p.moveTo(0, h * 0.5);
      p.bezierCurveTo(-w * 0.75, -h * 0.05, -w * 0.38, -h * 0.72, 0, -h * 0.22);
      p.bezierCurveTo(w * 0.38, -h * 0.72, w * 0.75, -h * 0.05, 0, h * 0.5);
      p.closePath();
      break;
    case 'arrow':
      p.moveTo(x, -h * 0.2); p.lineTo(w * 0.15, -h * 0.2); p.lineTo(w * 0.15, y);
      p.lineTo(w / 2, 0); p.lineTo(w * 0.15, h / 2); p.lineTo(w * 0.15, h * 0.2);
      p.lineTo(x, h * 0.2); p.closePath();
      break;
    case 'chevron':
      p.moveTo(x, y); p.lineTo(w * 0.2, y); p.lineTo(w / 2, 0); p.lineTo(w * 0.2, h / 2);
      p.lineTo(x, h / 2); p.lineTo(-w * 0.2, 0); p.closePath();
      break;
    case 'bubble': {
      const bh = h * 0.78, r = Math.min(w, bh) * 0.18;
      p.roundRect ? p.roundRect(x, y, w, bh, r) : p.rect(x, y, w, bh);
      p.moveTo(-w * 0.25, y + bh - 1); p.lineTo(-w * 0.32, h / 2); p.lineTo(-w * 0.05, y + bh - 1); p.closePath();
      break;
    }
    case 'cross': {
      const t = 0.18;
      p.rect(-w * t, y, w * t * 2, h); p.rect(x, -h * t, w, h * t * 2);
      break;
    }
    case 'blob':
      p.moveTo(0, y);
      p.bezierCurveTo(w * 0.4, y, w / 2, -h * 0.25, w * 0.45, h * 0.05);
      p.bezierCurveTo(w * 0.4, h * 0.4, w * 0.1, h / 2, -w * 0.15, h * 0.45);
      p.bezierCurveTo(-w * 0.45, h * 0.4, -w / 2, h * 0.05, -w * 0.45, -h * 0.2);
      p.bezierCurveTo(-w * 0.4, -h * 0.45, -w * 0.2, y, 0, y);
      p.closePath();
      break;
    case 'line': case 'dashed': p.moveTo(x, 0); p.lineTo(w / 2, 0); break;
    default: p.rect(x, y, w, h);
  }
  return p;
}

export function filterString(f = DEFAULT_FILTERS) {
  const parts = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia) parts.push(`sepia(${f.sepia}%)`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.invert) parts.push(`invert(${f.invert}%)`);
  if (f.blur) parts.push(`blur(${f.blur}px)`);
  return parts.join(' ') || 'none';
}

function applyShadow(ctx, s, scale) {
  if (!s?.on) return;
  ctx.shadowColor = s.color;
  ctx.shadowBlur = s.blur * scale;
  ctx.shadowOffsetX = s.x * scale;
  ctx.shadowOffsetY = s.y * scale;
}

function clearShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

function drawText(ctx, el, scale) {
  const { lines, lh, height } = layoutText(el);
  const w = el.w, h = el.h;
  ctx.font = fontString(el);
  setSpacing(ctx, el.letterSpacing || 0);
  ctx.textBaseline = 'middle';
  ctx.textAlign = el.align;
  ctx.direction = RTL.test(el.text) ? 'rtl' : 'ltr';
  const ax = el.align === 'left' ? -w / 2 : el.align === 'right' ? w / 2 : 0;
  const top = -height / 2 + (h - height) / 2;

  if (el.bg?.on) {
    const pad = el.bg.pad;
    const p = new Path2D();
    const r = el.bg.radius;
    p.roundRect ? p.roundRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2, r) : p.rect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
    ctx.fillStyle = el.bg.color;
    applyShadow(ctx, el.shadow, scale);
    ctx.fill(p);
    clearShadow(ctx);
  }

  lines.forEach((line, i) => {
    const y = top + lh * i + lh / 2;
    if (el.stroke?.on && el.stroke.width > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = el.stroke.width * 2;
      ctx.strokeStyle = el.stroke.color;
      if (!el.bg?.on) applyShadow(ctx, el.shadow, scale);
      ctx.strokeText(line, ax, y);
      clearShadow(ctx);
    } else if (!el.bg?.on) applyShadow(ctx, el.shadow, scale);
    ctx.fillStyle = makeFill(ctx, el.color, w, h);
    ctx.fillText(line, ax, y);
    clearShadow(ctx);
    if (el.underline) {
      const mw = ctx.measureText(line).width;
      const x0 = el.align === 'left' ? -w / 2 : el.align === 'right' ? w / 2 - mw : -mw / 2;
      ctx.fillRect(x0, y + el.fontSize * 0.45, mw, Math.max(2, el.fontSize / 16));
    }
  });
}

function drawImage(ctx, el, design, scale) {
  const src = design.assets?.[el.asset]?.src || el.src;
  const img = getImage(src);
  const clip = shapePath(el.mask === 'rect' ? 'rect' : el.mask, el.w, el.h, el.mask === 'rect' ? el.radius : 0);
  if (el.shadow?.on) {
    ctx.save();
    applyShadow(ctx, el.shadow, scale);
    ctx.fillStyle = '#fff';
    ctx.fill(clip);
    ctx.restore();
  }
  ctx.save();
  ctx.clip(clip);
  if (!img) {
    ctx.fillStyle = '#e4e4ea';
    ctx.fillRect(-el.w / 2, -el.h / 2, el.w, el.h);
  } else {
    const ir = img.naturalWidth / img.naturalHeight, br = el.w / el.h;
    let dw, dh;
    if (ir > br) { dh = el.h; dw = dh * ir; } else { dw = el.w; dh = dw / ir; }
    dw *= el.zoom; dh *= el.zoom;
    const ox = (dw - el.w) / 2 * el.panX, oy = (dh - el.h) / 2 * el.panY;
    const fs = filterString(el.filters);
    if (fs !== 'none') ctx.filter = fs;
    ctx.drawImage(img, -dw / 2 + ox, -dh / 2 + oy, dw, dh);
    ctx.filter = 'none';
  }
  ctx.restore();
  if (el.borderWidth > 0) {
    ctx.lineWidth = el.borderWidth;
    ctx.strokeStyle = el.borderColor;
    ctx.stroke(clip);
  }
}

function drawDrawing(ctx, el) {
  const pts = el.points;
  if (pts.length < 2) return;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.lineWidth = el.width;
  ctx.strokeStyle = el.color;
  const px = (i) => (pts[i][0] - 0.5) * el.w, py = (i) => (pts[i][1] - 0.5) * el.h;
  ctx.beginPath();
  ctx.moveTo(px(0), py(0));
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2);
  }
  ctx.lineTo(px(pts.length - 1), py(pts.length - 1));
  ctx.stroke();
}

export function drawElement(ctx, el, design, scale = 1) {
  if (el.hidden) return;
  ctx.save();
  ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
  if (el.rotation) ctx.rotate(el.rotation * Math.PI / 180);
  if (el.flipX || el.flipY) ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  ctx.globalAlpha *= el.opacity;
  const s = scale;
  switch (el.type) {
    case 'text': drawText(ctx, el, s); break;
    case 'shape': {
      const p = shapePath(el.shape, el.w, el.h, el.radius);
      const isLine = el.shape === 'line' || el.shape === 'dashed';
      applyShadow(ctx, el.shadow, s);
      if (isLine) {
        ctx.lineWidth = Math.max(1, el.strokeWidth || 8);
        ctx.lineCap = 'round';
        ctx.strokeStyle = makeFill(ctx, el.fill, el.w, el.h);
        if (el.shape === 'dashed') ctx.setLineDash([ctx.lineWidth * 2.5, ctx.lineWidth * 2]);
        ctx.stroke(p);
      } else {
        ctx.fillStyle = makeFill(ctx, el.fill, el.w, el.h);
        ctx.fill(p, 'evenodd');
        clearShadow(ctx);
        if (el.strokeWidth > 0) {
          ctx.lineWidth = el.strokeWidth;
          ctx.strokeStyle = el.strokeColor;
          ctx.stroke(p);
        }
      }
      break;
    }
    case 'image': drawImage(ctx, el, design, s); break;
    case 'graphic': {
      applyShadow(ctx, el.shadow, s);
      ctx.scale(el.w / 24, el.h / 24);
      ctx.translate(-12, -12);
      ctx.fillStyle = makeFill(ctx, el.fill, 24, 24);
      ctx.fill(path2d(GRAPHICS[el.graphic] || GRAPHICS.heart), 'evenodd');
      break;
    }
    case 'sticker': {
      applyShadow(ctx, el.shadow, s);
      const size = Math.min(el.w, el.h) * 0.86;
      ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.scale(el.w / Math.min(el.w, el.h), el.h / Math.min(el.w, el.h));
      ctx.fillText(el.emoji, 0, size * 0.06);
      break;
    }
    case 'drawing': applyShadow(ctx, el.shadow, s); drawDrawing(ctx, el); break;
  }
  ctx.restore();
}

export function drawBackground(ctx, page, design) {
  const W = design.width, H = design.height;
  const bg = page.background || { type: 'color', color: '#fff' };
  if (bg.type === 'transparent') return;
  ctx.save();
  if (bg.type === 'image') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    const img = getImage(design.assets?.[bg.asset]?.src);
    if (img) {
      const ir = img.naturalWidth / img.naturalHeight, br = W / H;
      let dw, dh;
      if (ir > br) { dh = H; dw = dh * ir; } else { dw = W; dh = dw / ir; }
      if (bg.filters) ctx.filter = filterString(bg.filters);
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
  } else {
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = makeFill(ctx, bg.type === 'gradient' ? bg.gradient : bg.color, W, H);
    ctx.fillRect(-W / 2, -H / 2, W, H);
  }
  ctx.restore();
}

// Draw a whole page into ctx (which must already be scaled to design units).
export function renderPage(ctx, page, design, scale = 1, { skipId } = {}) {
  drawBackground(ctx, page, design);
  for (const el of page.elements) if (el.id !== skipId) drawElement(ctx, el, design, scale);
}

export function pageToCanvas(page, design, scale = 1, { transparent = false } = {}) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(design.width * scale));
  c.height = Math.max(1, Math.round(design.height * scale));
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  const p = transparent ? { ...page, background: { type: 'transparent' } } : page;
  renderPage(ctx, p, design, scale);
  return c;
}

export function thumbnail(design, max = 360, pageIndex = 0) {
  const s = max / Math.max(design.width, design.height);
  return pageToCanvas(design.pages[pageIndex], design, s).toDataURL('image/jpeg', 0.8);
}

// Collect every font family a design uses, so they can be loaded before drawing.
export function designFonts(design) {
  const set = new Set();
  for (const p of design.pages) for (const e of p.elements) if (e.type === 'text') set.add(fontString(e, 40));
  return [...set];
}

export async function loadFonts(design) {
  const fonts = designFonts(design);
  if (!document.fonts || !fonts.length) return;
  await Promise.race([
    Promise.all(fonts.map((f) => document.fonts.load(f, 'abcآب').catch(() => {}))),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
}

// Hit testing in design coordinates (respects rotation).
export function toLocal(el, x, y) {
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  const a = -(el.rotation || 0) * Math.PI / 180;
  const dx = x - cx, dy = y - cy;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

export function hitTest(page, x, y, tol = 0) {
  for (let i = page.elements.length - 1; i >= 0; i--) {
    const el = page.elements[i];
    if (el.hidden) continue;
    const p = toLocal(el, x, y);
    const t = tol + (el.type === 'shape' && (el.shape === 'line' || el.shape === 'dashed') ? 20 : 0);
    if (Math.abs(p.x) <= el.w / 2 + t && Math.abs(p.y) <= el.h / 2 + t) return el;
  }
  return null;
}
