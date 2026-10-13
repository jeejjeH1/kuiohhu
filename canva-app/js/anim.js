// Element animations: entrance, exit and looping motion, evaluated per time.
// A null state means "static" (final look), which is what the editor shows when not playing.
import { clamp } from './util.js';

const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  back: (t) => { const c = 1.70158 * 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export const ANIM_IN = [
  { id: 'none', label: 'بدون' },
  { id: 'fade', label: 'محو شدن' },
  { id: 'slideUp', label: 'از پایین' },
  { id: 'slideDown', label: 'از بالا' },
  { id: 'slideLeft', label: 'از راست' },
  { id: 'slideRight', label: 'از چپ' },
  { id: 'zoom', label: 'بزرگ شدن' },
  { id: 'pop', label: 'پرش' },
  { id: 'spin', label: 'چرخش ورود' },
  { id: 'blur', label: 'وضوح' },
];
export const ANIM_OUT = [
  { id: 'none', label: 'بدون' },
  { id: 'fade', label: 'محو شدن' },
  { id: 'slideDown', label: 'به پایین' },
  { id: 'zoom', label: 'کوچک شدن' },
  { id: 'spin', label: 'چرخش خروج' },
  { id: 'blur', label: 'تار شدن' },
];
export const ANIM_LOOP = [
  { id: 'none', label: 'بدون' },
  { id: 'float', label: 'شناور' },
  { id: 'pulse', label: 'تپش' },
  { id: 'wobble', label: 'لرزش' },
  { id: 'bounce', label: 'جهش' },
  { id: 'shake', label: 'تکان' },
  { id: 'spin', label: 'چرخش دائم' },
  { id: 'swing', label: 'آونگ' },
];

// Each element's anim: { in:{type,dur,delay}, out:{type,dur}, loop:{type,dur} }
export const hasAnim = (el) => !!(el.anim && (
  (el.anim.in && el.anim.in.type !== 'none') ||
  (el.anim.out && el.anim.out.type !== 'none') ||
  (el.anim.loop && el.anim.loop.type !== 'none')));

function applyIn(type, e, st, d) {
  switch (type) {
    case 'fade': st.a *= e; break;
    case 'slideUp': st.a *= Math.min(1, e * 2); st.dy += d * (1 - e); break;
    case 'slideDown': st.a *= Math.min(1, e * 2); st.dy -= d * (1 - e); break;
    case 'slideLeft': st.a *= Math.min(1, e * 2); st.dx += d * (1 - e); break;
    case 'slideRight': st.a *= Math.min(1, e * 2); st.dx -= d * (1 - e); break;
    case 'zoom': st.a *= e; st.s *= 0.4 + 0.6 * e; break;
    case 'pop': st.a *= Math.min(1, e * 2); st.s *= Math.max(0, e); break;
    case 'spin': st.a *= e; st.r += -360 * (1 - e); st.s *= 0.5 + 0.5 * e; break;
    case 'blur': st.a *= e; st.b += 20 * (1 - e); break;
  }
}

function applyOut(type, e, st, d) {
  switch (type) {
    case 'fade': st.a *= 1 - e; break;
    case 'slideDown': st.a *= 1 - e; st.dy += d * e; break;
    case 'zoom': st.a *= 1 - e; st.s *= 1 - 0.6 * e; break;
    case 'spin': st.a *= 1 - e; st.r += 360 * e; break;
    case 'blur': st.a *= 1 - e; st.b += 20 * e; break;
  }
}

function applyLoop(type, ph, st, d) {
  const s = Math.sin(2 * Math.PI * ph);
  switch (type) {
    case 'float': st.dy += -d * 0.1 * s; break;
    case 'pulse': st.s *= 1 + 0.08 * s; break;
    case 'wobble': st.r += 6 * s; break;
    case 'bounce': st.dy += -d * 0.15 * Math.abs(Math.sin(Math.PI * ph)); break;
    case 'shake': st.dx += d * 0.04 * Math.sin(2 * Math.PI * ph * 3); break;
    case 'spin': st.r += 360 * ph; break;
    case 'swing': st.r += 14 * s; break;
  }
}

// t: local page time in ms (null = static). D: page duration in ms. W/H: design size.
export function animState(el, t, D, W, H) {
  if (t == null || !el.anim) return null;
  const st = { a: 1, dx: 0, dy: 0, s: 1, r: 0, b: 0 };
  const d = Math.min(W, H) * 0.12;
  const A = el.anim;
  if (A.in && A.in.type !== 'none') {
    const dur = A.in.dur || 600, delay = A.in.delay || 0;
    if (t < delay) return { ...st, a: 0 };
    applyIn(A.in.type, ease.out(clamp((t - delay) / dur, 0, 1)), st, d);
    if (A.in.type === 'pop') st.s = Math.max(0, ease.back(clamp((t - delay) / dur, 0, 1)));
  }
  if (A.out && A.out.type !== 'none') {
    const dur = Math.min(A.out.dur || 600, D);
    const start = D - dur;
    if (t > start) applyOut(A.out.type, ease.in(clamp((t - start) / dur, 0, 1)), st, d);
  }
  if (A.loop && A.loop.type !== 'none') {
    const dur = A.loop.dur || 1600;
    applyLoop(A.loop.type, (t / dur) % 1, st, d);
  }
  return st;
}

// Presets used by the "animate" sheet and the "stagger all" action.
export const PRESETS = [
  { name: 'ورود نرم', in: { type: 'fade', dur: 700 } },
  { name: 'پرش جذاب', in: { type: 'pop', dur: 650 } },
  { name: 'از پایین', in: { type: 'slideUp', dur: 700 } },
  { name: 'چرخش ورود', in: { type: 'spin', dur: 900 }, loop: { type: 'none' } },
  { name: 'تپش مداوم', in: { type: 'zoom', dur: 500 }, loop: { type: 'pulse', dur: 1400 } },
  { name: 'شناور', in: { type: 'fade', dur: 500 }, loop: { type: 'float', dur: 2400 } },
  { name: 'ورود و خروج', in: { type: 'zoom', dur: 500 }, out: { type: 'fade', dur: 500 } },
];

export const TRANSITIONS = [
  { id: 'none', label: 'بدون' },
  { id: 'fade', label: 'محو' },
  { id: 'slide', label: 'کشیدن' },
  { id: 'zoom', label: 'بزرگ‌نمایی' },
  { id: 'wipe', label: 'پاک‌کردن' },
];
