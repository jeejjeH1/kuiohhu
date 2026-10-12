// Design data model: formats, fonts, element factories and the built-in libraries
// (shapes, graphics, stickers, colors, gradients, text presets).
import { uid } from './util.js';

export const FORMATS = [
  { id: 'ig-post', name: 'پست اینستاگرام', w: 1080, h: 1080 },
  { id: 'ig-story', name: 'استوری', w: 1080, h: 1920 },
  { id: 'ig-portrait', name: 'پست عمودی', w: 1080, h: 1350 },
  { id: 'poster', name: 'پوستر', w: 1240, h: 1754 },
  { id: 'slide', name: 'ارائه', w: 1920, h: 1080 },
  { id: 'yt-thumb', name: 'تامبنیل یوتیوب', w: 1280, h: 720 },
  { id: 'logo', name: 'لوگو', w: 500, h: 500 },
  { id: 'card', name: 'کارت ویزیت', w: 1050, h: 600 },
  { id: 'fb-cover', name: 'کاور فیسبوک', w: 1640, h: 624 },
  { id: 'a4', name: 'سند A4', w: 1240, h: 1754 },
  { id: 'banner', name: 'بنر وب', w: 1500, h: 500 },
  { id: 'wallpaper', name: 'والپیپر موبایل', w: 1080, h: 2340 },
];

export const FONTS = [
  { family: 'Vazirmatn', label: 'وزیرمتن', fa: true },
  { family: 'Lalezar', label: 'لاله‌زار', fa: true },
  { family: 'Noto Naskh Arabic', label: 'نسخ', fa: true },
  { family: 'Amiri', label: 'امیری', fa: true },
  { family: 'Reem Kufi', label: 'ریم کوفی', fa: true },
  { family: 'Markazi Text', label: 'مرکزی', fa: true },
  { family: 'Lateef', label: 'لطیف', fa: true },
  { family: 'Rubik', label: 'Rubik', fa: true },
  { family: 'Changa', label: 'Changa', fa: true },
  { family: 'Poppins', label: 'Poppins' },
  { family: 'Montserrat', label: 'Montserrat' },
  { family: 'Playfair Display', label: 'Playfair' },
  { family: 'Bebas Neue', label: 'Bebas Neue' },
  { family: 'Oswald', label: 'Oswald' },
  { family: 'Pacifico', label: 'Pacifico' },
  { family: 'Lobster', label: 'Lobster' },
  { family: 'Dancing Script', label: 'Dancing Script' },
  { family: 'Righteous', label: 'Righteous' },
];

export const PALETTE = [
  '#000000', '#545454', '#737373', '#a6a6a6', '#d9d9d9', '#ffffff',
  '#ff3131', '#ff5757', '#ff66c4', '#cb6ce6', '#8c52ff', '#5e17eb',
  '#0097b2', '#0cc0df', '#5ce1e6', '#38b6ff', '#5271ff', '#004aad',
  '#00bf63', '#7ed957', '#c1ff72', '#ffde59', '#ffbd59', '#ff914d',
  '#f5e6d3', '#c19a6b', '#7b4b2a', '#1e3a5f', '#2d2d2d', '#fdf6ec',
];

export const GRADIENTS = [
  ['#ff6a88', '#ff99ac'], ['#f857a6', '#ff5858'], ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'], ['#fa709a', '#fee140'], ['#a18cd1', '#fbc2eb'],
  ['#667eea', '#764ba2'], ['#f093fb', '#f5576c'], ['#30cfd0', '#330867'],
  ['#ff9a9e', '#fecfef'], ['#0f2027', '#2c5364'], ['#ffecd2', '#fcb69f'],
  ['#8e2de2', '#4a00e0'], ['#f12711', '#f5af19'], ['#11998e', '#38ef7d'],
  ['#000000', '#434343'],
].map(([a, b]) => ({ type: 'linear', colors: [a, b], angle: 135 }));

export const SHAPES = [
  'rect', 'rounded', 'ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon',
  'star', 'star4', 'heart', 'arrow', 'chevron', 'bubble', 'cross', 'ring', 'blob', 'line', 'dashed',
];

// Vector graphics, drawn in a 24x24 box (filled).
export const GRAPHICS = {
  heart: 'M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z',
  star: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z',
  check: 'M12 2a10 10 0 110 20 10 10 0 010-20zm-1.4 13.2l6.4-6.4-1.4-1.4-5 5-2.4-2.4-1.4 1.4z',
  home: 'M12 3l10 9h-3v9h-5v-6h-4v6H5v-9H2z',
  pin: 'M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7zm0 4a3 3 0 100 6 3 3 0 000-6z',
  phone: 'M6.6 2h2.8l1.6 4.8-2.3 1.5a12 12 0 006.9 6.9l1.5-2.3L22 14.6v2.8A2.6 2.6 0 0119.4 20 17.4 17.4 0 014 4.6 2.6 2.6 0 016.6 2z',
  mail: 'M2 5h20v14H2zm2 2v.5l8 5 8-5V7l-8 5z',
  web: 'M12 2a10 10 0 110 20 10 10 0 010-20zm-1 2.1A8 8 0 004.1 11H8c.2-2.7 1.1-5.1 3-6.9zm2 0c1.9 1.8 2.8 4.2 3 6.9h3.9A8 8 0 0013 4.1zM10 11h4c-.2-2.3-.9-4.2-2-5.5-1.1 1.3-1.8 3.2-2 5.5zm-5.9 2A8 8 0 0011 19.9c-1.9-1.8-2.8-4.2-3-6.9zm5.9 0c.2 2.3.9 4.2 2 5.5 1.1-1.3 1.8-3.2 2-5.5zm6 0c-.2 2.7-1.1 5.1-3 6.9a8 8 0 006.9-6.9z',
  music: 'M9 3l12-2v14.5a3.5 3.5 0 11-2-3.2V5.3L11 6.6V18a3.5 3.5 0 11-2-3.2z',
  sun: 'M12 7a5 5 0 110 10 5 5 0 010-10zM11 0h2v4h-2zm0 20h2v4h-2zM0 11h4v2H0zm20 0h4v2h-4zM3.5 2.1l2.8 2.8-1.4 1.4-2.8-2.8zm14.2 14.2l2.8 2.8-1.4 1.4-2.8-2.8zM2.1 20.5l2.8-2.8 1.4 1.4-2.8 2.8zM16.3 4.9l2.8-2.8 1.4 1.4-2.8 2.8z',
  moon: 'M14 2a10 10 0 107.9 15.9A8 8 0 0114 2z',
  cloud: 'M6.5 20A5.5 5.5 0 015.6 9.1 7 7 0 0119 8a6 6 0 01-.5 12z',
  bolt: 'M13 1L3 14h7l-1 9 10-13h-7z',
  drop: 'M12 2s7 7.6 7 13a7 7 0 01-14 0c0-5.4 7-13 7-13z',
  leaf: 'M21 3S8 2 4.5 9.5C2 15 5 20 5 20l1.5-1.5C8 14 11 11 16 9c-4 3-7 6.5-8.6 10.7C12 21 19 19 21 3z',
  flower: 'M12 8a3 3 0 110-.01zM12 2a3.5 3.5 0 013 5.3A3.5 3.5 0 0120.7 9 3.5 3.5 0 0117 14.6 3.5 3.5 0 0112 20a3.5 3.5 0 01-5-5.4A3.5 3.5 0 013.3 9 3.5 3.5 0 019 7.3 3.5 3.5 0 0112 2zm0 7a3 3 0 100 6 3 3 0 000-6z',
  play: 'M12 2a10 10 0 110 20 10 10 0 010-20zM10 7.5v9l7-4.5z',
  cart: 'M1 2h4l2.7 12.4A2 2 0 009.6 16H19l2.5-9H7M9 22a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm9 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  gift: 'M3 8h18v4H3zm1 5h7v8H4zm9 0h7v8h-7zM11 8h2v13h-2zM12 8S9 2 6.5 4 9 8 12 8zm0 0s3-6 5.5-4S15 8 12 8z',
  crown: 'M2 7l5 4 5-7 5 7 5-4-2 12H4zm2 13h16v2H4z',
  badge: 'M12 1l3 2.5 3.8-.3.8 3.8L23 9l-1.8 3.4L23 16l-3.4 2-.8 3.8-3.8-.3L12 24l-3-2.5-3.8.3-.8-3.8L1 16l1.8-3.6L1 9l3.4-2 .8-3.8 3.8.3z',
  quote: 'M3 21V13c0-6 3-9 8-10v3c-3 1-4 3-4 5h4v10zm10 0V13c0-6 3-9 8-10v3c-3 1-4 3-4 5h4v10z',
  bubble: 'M4 3h16a2 2 0 012 2v11a2 2 0 01-2 2H9l-5 4v-4a2 2 0 01-2-2V5a2 2 0 012-2z',
  arrowR: 'M2 10h14V5l7 7-7 7v-5H2z',
  arrowCurve: 'M4 20C4 10 10 6 17 6V2l6 6-6 6v-4c-5 0-10 3-13 10z',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zm9 3a4 4 0 100 8 4 4 0 000-8z',
  coffee: 'M3 8h14v6a6 6 0 01-6 6H9a6 6 0 01-6-6zm14 2h1.5a3 3 0 010 6H17v-2h1.5a1 1 0 000-2H17zM6 2c0 2 2 2 2 4M10 2c0 2 2 2 2 4M14 2c0 2 2 2 2 4',
  user: 'M12 2a5 5 0 110 10 5 5 0 010-10zm0 12c5.5 0 9 2.5 9 6v2H3v-2c0-3.5 3.5-6 9-6z',
  instagram: 'M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm0 2a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3zm5 3.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm0 2a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM17.5 5a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z',
  wave: 'M0 14c4 0 4-4 8-4s4 4 8 4 4-4 8-4v12H0z',
  splash: 'M12 1l2 5 5-3-1 6 6 1-5 4 4 5-6-1-1 6-4-4-4 4-1-6-6 1 4-5-5-4 6-1-1-6 5 3z',
  frame: 'M2 2h20v20H2zm2 2v16h16V4z',
  dots: 'M4 4h3v3H4zm6.5 0h3v3h-3zM17 4h3v3h-3zM4 10.5h3v3H4zm6.5 0h3v3h-3zm6.5 0h3v3h-3zM4 17h3v3H4zm6.5 0h3v3h-3zm6.5 0h3v3h-3z',
};

export const STICKERS = [
  '😀', '😍', '🥳', '😎', '🤩', '😂', '🥰', '😇', '🤔', '😴', '🙌', '👍', '👏', '💪', '🙏', '✌️',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💖', '✨', '⭐', '🌟', '🔥', '💯', '🎉', '🎊', '🎁',
  '🎈', '🎂', '🍰', '☕', '🍕', '🍔', '🍩', '🍓', '🍉', '🌸', '🌹', '🌻', '🌷', '🍀', '🌿', '🌴',
  '🌈', '☀️', '🌙', '⚡', '❄️', '🌊', '🏖️', '✈️', '🚀', '🏆', '🎯', '💡', '📌', '📍', '📷', '🎵',
  '🎧', '🎨', '📚', '✏️', '💼', '💰', '🛍️', '🏷️', '📢', '💬', '✅', '❗', '⚠️', '🆕', '🔔', '⏰',
  '🐱', '🐶', '🦋', '🐼', '🦄', '🐝', '🇮🇷', '🕌', '🍵', '🌍', '💎', '👑', '🧿', '🪴', '🕯️', '🎀',
];

export const TEXT_PRESETS = [
  { label: 'افزودن عنوان', text: 'عنوان', fontSize: 96, bold: true, fontFamily: 'Vazirmatn' },
  { label: 'افزودن زیرعنوان', text: 'زیرعنوان', fontSize: 56, bold: true, fontFamily: 'Vazirmatn' },
  { label: 'افزودن متن', text: 'یک متن کوتاه بنویسید', fontSize: 36, fontFamily: 'Vazirmatn' },
];

export const TEXT_STYLES = [
  { label: 'حراج', text: 'حراج ویژه', fontFamily: 'Lalezar', fontSize: 110, color: '#ff3131', stroke: { on: true, color: '#ffffff', width: 6 } },
  { label: 'نئون', text: 'نئون', fontFamily: 'Lalezar', fontSize: 110, color: '#ffffff', shadow: { on: true, color: '#ff00e6', blur: 30, x: 0, y: 0 } },
  { label: 'برچسب', text: 'جدید', fontFamily: 'Vazirmatn', bold: true, fontSize: 64, color: '#ffffff', bg: { on: true, color: '#8c52ff', pad: 18, radius: 16 } },
  { label: 'کلاسیک', text: 'Classic', fontFamily: 'Playfair Display', italic: true, fontSize: 96, color: '#1e3a5f' },
  { label: 'Bold', text: 'BOLD', fontFamily: 'Bebas Neue', fontSize: 140, color: '#111111', letterSpacing: 8 },
  { label: 'دست‌نویس', text: 'Hello', fontFamily: 'Pacifico', fontSize: 96, color: '#ff66c4' },
  { label: 'سایه‌دار', text: 'سایه', fontFamily: 'Lalezar', fontSize: 110, color: '#ffde59', shadow: { on: true, color: '#000000', blur: 0, x: 6, y: 6 } },
  { label: 'خوشنویسی', text: 'بسم الله', fontFamily: 'Amiri', bold: true, fontSize: 96, color: '#7b4b2a' },
];

const base = (o) => ({
  id: uid(), x: 0, y: 0, w: 100, h: 100, rotation: 0, opacity: 1,
  flipX: false, flipY: false, locked: false, hidden: false,
  shadow: { on: false, color: '#000000', blur: 12, x: 4, y: 6 },
  ...o,
});

export function makeText(o = {}) {
  return base({
    type: 'text', text: 'متن', fontFamily: 'Vazirmatn', fontSize: 48, color: '#111111',
    bold: false, italic: false, underline: false, uppercase: false, align: 'center',
    lineHeight: 1.4, letterSpacing: 0,
    stroke: { on: false, color: '#ffffff', width: 4 },
    bg: { on: false, color: '#ffde59', pad: 14, radius: 10 },
    w: 600, h: 80, ...o,
    shadow: { on: false, color: '#000000', blur: 12, x: 4, y: 6, ...(o.shadow || {}) },
  });
}

export function makeShape(o = {}) {
  return base({
    type: 'shape', shape: 'rect', fill: '#8c52ff', strokeColor: '#111111', strokeWidth: 0,
    radius: 24, w: 300, h: 300, ...o,
  });
}

export function makeImage(o = {}) {
  return base({
    type: 'image', asset: null, w: 400, h: 400, mask: 'rect', radius: 0,
    borderColor: '#ffffff', borderWidth: 0, zoom: 1, panX: 0, panY: 0,
    filters: { ...DEFAULT_FILTERS }, ...o,
  });
}

export function makeGraphic(o = {}) {
  return base({ type: 'graphic', graphic: 'heart', fill: '#ff3131', w: 240, h: 240, ...o });
}

export function makeSticker(o = {}) {
  return base({ type: 'sticker', emoji: '😀', w: 220, h: 220, ...o });
}

export function makeDrawing(o = {}) {
  return base({ type: 'drawing', points: [], color: '#111111', width: 8, ...o });
}

export const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturate: 100, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 };

export const FILTER_PRESETS = [
  { name: 'اصلی', f: {} },
  { name: 'روشن', f: { brightness: 120, contrast: 105 } },
  { name: 'پرتضاد', f: { contrast: 140, saturate: 120 } },
  { name: 'سیاه‌سفید', f: { grayscale: 100, contrast: 115 } },
  { name: 'قدیمی', f: { sepia: 70, contrast: 95, brightness: 105 } },
  { name: 'گرم', f: { sepia: 30, saturate: 130, hue: -10 } },
  { name: 'سرد', f: { hue: 20, saturate: 90, brightness: 105 } },
  { name: 'رنگارنگ', f: { saturate: 180 } },
  { name: 'محو', f: { contrast: 80, brightness: 115, saturate: 80 } },
  { name: 'نوآر', f: { grayscale: 100, contrast: 170, brightness: 90 } },
  { name: 'رویایی', f: { blur: 1, brightness: 112, saturate: 120 } },
  { name: 'نگاتیو', f: { invert: 100 } },
];

export function makePage(o = {}) {
  return { id: uid(), background: { type: 'color', color: '#ffffff' }, elements: [], ...o };
}

export function makeDesign({ name = 'طرح بدون عنوان', w, h, pages, assets } = {}) {
  return {
    id: uid(), name, width: w, height: h,
    pages: pages || [makePage()], assets: assets || {},
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}
