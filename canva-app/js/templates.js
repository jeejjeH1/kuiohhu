// Built-in templates. Built from code so they stay small and fully editable.
import { FORMATS, makeDesign, makePage, makeText, makeShape, makeGraphic, makeSticker } from './model.js';
import { clone, uid } from './util.js';

const fmt = (id) => FORMATS.find((f) => f.id === id);

// Text centred at (cx, cy).
function T(text, cx, cy, w, o = {}) {
  const fontSize = o.fontSize || 48;
  const lines = text.split('\n').length;
  const h = Math.round(fontSize * (o.lineHeight || 1.4) * lines);
  return makeText({ text, w, h, x: cx - w / 2, y: cy - h / 2, ...o });
}
const S = (shape, x, y, w, h, o = {}) => makeShape({ shape, x, y, w, h, ...o });
const G = (graphic, x, y, s, fill, o = {}) => makeGraphic({ graphic, x, y, w: s, h: s, fill, ...o });
const E = (emoji, x, y, s, o = {}) => makeSticker({ emoji, x, y, w: s, h: s, ...o });
const grad = (a, b, angle = 135) => ({ type: 'gradient', gradient: { type: 'linear', colors: [a, b], angle } });
const color = (c) => ({ type: 'color', color: c });

const defs = [
  {
    name: 'حراج بزرگ', cat: 'ig-post', tags: 'فروش تخفیف حراج',
    pages: [{
      background: grad('#ff512f', '#dd2476'),
      elements: [
        S('ellipse', -180, -180, 520, 520, { fill: 'rgba(255,255,255,0.12)' }),
        S('ellipse', 760, 740, 480, 480, { fill: 'rgba(255,255,255,0.12)' }),
        T('حراج', 540, 400, 900, { fontFamily: 'Lalezar', fontSize: 260, color: '#ffffff', lineHeight: 1.1, shadow: { on: true, color: 'rgba(0,0,0,0.25)', blur: 0, x: 10, y: 10 } }),
        S('rounded', 240, 560, 600, 130, { fill: '#ffde59', radius: 65 }),
        T('تا ۵۰٪ تخفیف', 540, 625, 600, { fontFamily: 'Vazirmatn', bold: true, fontSize: 64, color: '#c4123f' }),
        T('فقط تا پایان هفته', 540, 800, 800, { fontFamily: 'Vazirmatn', fontSize: 48, color: '#ffffff' }),
        E('🛍️', 800, 160, 180, { rotation: 15 }),
      ],
    }],
  },
  {
    name: 'نقل قول', cat: 'ig-post', tags: 'جمله انگیزشی',
    pages: [{
      background: color('#1b1b2f'),
      elements: [
        G('quote', 440, 150, 200, '#ffbd59'),
        T('هر روز یک فرصت تازه است\nتا بهترین نسخه‌ی خودت باشی', 540, 540, 900, { fontFamily: 'Vazirmatn', bold: true, fontSize: 64, color: '#ffffff', lineHeight: 1.6 }),
        S('line', 440, 760, 200, 10, { fill: '#ffbd59', strokeWidth: 8 }),
        T('— ناشناس', 540, 840, 600, { fontFamily: 'Vazirmatn', fontSize: 40, color: '#c9c9d6' }),
      ],
    }],
  },
  {
    name: 'منوی کافه', cat: 'ig-post', tags: 'کافه قهوه منو رستوران',
    pages: [{
      background: color('#f5e6d3'),
      elements: [
        S('rect', 60, 60, 960, 960, { fill: 'transparent', strokeColor: '#7b4b2a', strokeWidth: 6, radius: 30 }),
        G('coffee', 470, 120, 140, '#7b4b2a'),
        T('کافه دنج', 540, 330, 800, { fontFamily: 'Lalezar', fontSize: 120, color: '#7b4b2a' }),
        T('اسپرسو ................ ۸۵\nلاته ...................... ۱۱۰\nکاپوچینو ............... ۱۰۵\nموکا ..................... ۱۲۰', 540, 640, 760, { fontFamily: 'Vazirmatn', fontSize: 46, color: '#4a2c17', lineHeight: 1.8 }),
        T('هزار تومان', 540, 900, 600, { fontFamily: 'Vazirmatn', fontSize: 32, color: '#7b4b2a' }),
      ],
    }],
  },
  {
    name: 'روز خوب', cat: 'ig-story', tags: 'صبح بخیر استوری',
    pages: [{
      background: grad('#a18cd1', '#fbc2eb', 180),
      elements: [
        E('☀️', 390, 380, 300),
        T('صبح بخیر', 540, 860, 900, { fontFamily: 'Lalezar', fontSize: 170, color: '#ffffff', shadow: { on: true, color: 'rgba(80,0,120,0.35)', blur: 30, x: 0, y: 8 } }),
        T('امروز روز توست ✨', 540, 1060, 900, { fontFamily: 'Vazirmatn', fontSize: 64, color: '#ffffff' }),
        S('rounded', 340, 1560, 400, 110, { fill: '#ffffff', radius: 55 }),
        T('@username', 540, 1615, 380, { fontFamily: 'Poppins', fontSize: 40, color: '#8c52ff', bold: true }),
      ],
    }],
  },
  {
    name: 'ورکشاپ', cat: 'ig-story', tags: 'رویداد کارگاه آموزش',
    pages: [{
      background: color('#0f172a'),
      elements: [
        S('blob', 380, -160, 900, 900, { fill: { type: 'linear', colors: ['#5e17eb', '#0cc0df'], angle: 120 } }),
        S('ring', -200, 1300, 600, 600, { fill: '#ffde59' }),
        T('ورکشاپ\nطراحی گرافیک', 540, 900, 960, { fontFamily: 'Lalezar', fontSize: 150, color: '#ffffff', lineHeight: 1.2 }),
        T('جمعه ۲۰ مهر · ساعت ۱۶', 540, 1180, 900, { fontFamily: 'Vazirmatn', fontSize: 56, color: '#5ce1e6' }),
        S('rounded', 290, 1400, 500, 130, { fill: '#ffde59', radius: 65 }),
        T('ثبت‌نام کنید', 540, 1465, 480, { fontFamily: 'Vazirmatn', bold: true, fontSize: 54, color: '#0f172a' }),
      ],
    }],
  },
  {
    name: 'کنسرت', cat: 'poster', tags: 'پوستر موسیقی کنسرت',
    pages: [{
      background: grad('#0f2027', '#2c5364', 180),
      elements: [
        S('ellipse', 220, 260, 800, 800, { fill: { type: 'radial', colors: ['#ff914d', 'rgba(255,145,77,0)'] } }),
        G('music', 470, 470, 300, '#ffffff'),
        T('شب موسیقی', 620, 1100, 1100, { fontFamily: 'Lalezar', fontSize: 190, color: '#ffde59' }),
        T('اجرای زنده · سالن میلاد', 620, 1290, 1000, { fontFamily: 'Vazirmatn', fontSize: 64, color: '#ffffff' }),
        S('line', 320, 1420, 600, 10, { fill: '#ff914d', strokeWidth: 6 }),
        T('۲۵ آبان ۱۴۰۵ · ساعت ۲۰', 620, 1530, 1000, { fontFamily: 'Vazirmatn', bold: true, fontSize: 56, color: '#ffffff' }),
      ],
    }],
  },
  {
    name: 'ارائه کسب‌وکار', cat: 'slide', tags: 'ارائه پرزنتیشن اسلاید',
    pages: [
      {
        background: color('#ffffff'),
        elements: [
          S('rect', 1200, 0, 720, 1080, { fill: { type: 'linear', colors: ['#5271ff', '#8c52ff'], angle: 160 } }),
          S('ellipse', 1450, 300, 360, 360, { fill: 'rgba(255,255,255,0.18)' }),
          T('گزارش عملکرد\nسالانه ۱۴۰۵', 600, 460, 1000, { fontFamily: 'Vazirmatn', bold: true, fontSize: 110, color: '#1e1e2f', lineHeight: 1.3 }),
          T('تیم محصول · پاییز', 600, 720, 1000, { fontFamily: 'Vazirmatn', fontSize: 48, color: '#5271ff' }),
        ],
      },
      {
        background: color('#f7f7fb'),
        elements: [
          T('نکات کلیدی', 960, 160, 1600, { fontFamily: 'Vazirmatn', bold: true, fontSize: 90, color: '#1e1e2f' }),
          S('rounded', 160, 320, 480, 560, { fill: '#ffffff', radius: 40, shadow: { on: true, color: 'rgba(0,0,0,0.08)', blur: 40, x: 0, y: 10 } }),
          S('rounded', 720, 320, 480, 560, { fill: '#ffffff', radius: 40, shadow: { on: true, color: 'rgba(0,0,0,0.08)', blur: 40, x: 0, y: 10 } }),
          S('rounded', 1280, 320, 480, 560, { fill: '#ffffff', radius: 40, shadow: { on: true, color: 'rgba(0,0,0,0.08)', blur: 40, x: 0, y: 10 } }),
          T('۴۵٪', 400, 520, 400, { fontFamily: 'Vazirmatn', bold: true, fontSize: 120, color: '#5271ff' }),
          T('رشد فروش', 400, 700, 400, { fontFamily: 'Vazirmatn', fontSize: 48, color: '#555' }),
          T('۱۲ک', 960, 520, 400, { fontFamily: 'Vazirmatn', bold: true, fontSize: 120, color: '#8c52ff' }),
          T('کاربر جدید', 960, 700, 400, { fontFamily: 'Vazirmatn', fontSize: 48, color: '#555' }),
          T('۹۸٪', 1520, 520, 400, { fontFamily: 'Vazirmatn', bold: true, fontSize: 120, color: '#00bf63' }),
          T('رضایت', 1520, 700, 400, { fontFamily: 'Vazirmatn', fontSize: 48, color: '#555' }),
        ],
      },
    ],
  },
  {
    name: 'تامبنیل ویدیو', cat: 'yt-thumb', tags: 'یوتیوب ویدیو آموزش',
    pages: [{
      background: grad('#f12711', '#f5af19', 120),
      elements: [
        S('rect', 0, 520, 1280, 200, { fill: '#111111' }),
        T('۱۰ ترفند\nطلایی!', 420, 300, 760, { fontFamily: 'Lalezar', fontSize: 150, color: '#ffffff', lineHeight: 1.15, stroke: { on: true, color: '#111111', width: 8 } }),
        G('play', 900, 140, 280, '#ffffff', { shadow: { on: true, color: 'rgba(0,0,0,0.35)', blur: 20, x: 0, y: 8 } }),
        T('آموزش کامل در ۵ دقیقه', 640, 620, 1200, { fontFamily: 'Vazirmatn', bold: true, fontSize: 64, color: '#ffde59' }),
        E('🔥', 60, 40, 140, { rotation: -12 }),
      ],
    }],
  },
  {
    name: 'لوگوی مینیمال', cat: 'logo', tags: 'لوگو برند',
    pages: [{
      background: color('#ffffff'),
      elements: [
        S('hexagon', 150, 70, 200, 200, { fill: { type: 'linear', colors: ['#11998e', '#38ef7d'], angle: 135 } }),
        G('leaf', 195, 115, 110, '#ffffff'),
        T('سبزینه', 250, 345, 440, { fontFamily: 'Lalezar', fontSize: 84, color: '#14532d' }),
        T('GREEN LIFE', 250, 425, 440, { fontFamily: 'Montserrat', bold: true, fontSize: 28, color: '#11998e', letterSpacing: 6 }),
      ],
    }],
  },
  {
    name: 'کارت ویزیت', cat: 'card', tags: 'کارت ویزیت تماس',
    pages: [{
      background: color('#1e293b'),
      elements: [
        S('rect', 0, 0, 24, 600, { fill: '#ffbd59' }),
        T('علی محمدی', 760, 140, 480, { fontFamily: 'Vazirmatn', bold: true, fontSize: 64, color: '#ffffff', align: 'right' }),
        T('طراح محصول', 760, 215, 480, { fontFamily: 'Vazirmatn', fontSize: 36, color: '#ffbd59', align: 'right' }),
        G('phone', 940, 330, 40, '#ffbd59'),
        T('۰۹۱۲ ۱۲۳ ۴۵۶۷', 680, 350, 480, { fontFamily: 'Vazirmatn', fontSize: 32, color: '#e2e8f0', align: 'right' }),
        G('mail', 940, 400, 40, '#ffbd59'),
        T('ali@example.com', 680, 420, 480, { fontFamily: 'Poppins', fontSize: 30, color: '#e2e8f0', align: 'right' }),
        G('pin', 940, 470, 40, '#ffbd59'),
        T('تهران، خیابان ولیعصر', 680, 490, 480, { fontFamily: 'Vazirmatn', fontSize: 32, color: '#e2e8f0', align: 'right' }),
        S('ellipse', 90, 170, 260, 260, { fill: 'transparent', strokeColor: '#ffbd59', strokeWidth: 6 }),
        T('ع.م', 220, 300, 240, { fontFamily: 'Lalezar', fontSize: 100, color: '#ffbd59' }),
      ],
    }],
  },
  {
    name: 'دعوت تولد', cat: 'ig-portrait', tags: 'تولد جشن دعوت',
    pages: [{
      background: color('#fff4f8'),
      elements: [
        E('🎈', 60, 60, 260, { rotation: -10 }),
        E('🎉', 760, 80, 240, { rotation: 10 }),
        T('جشن تولد', 540, 520, 900, { fontFamily: 'Lalezar', fontSize: 150, color: '#ff66c4' }),
        T('سارا ۷ ساله می‌شود!', 540, 700, 900, { fontFamily: 'Vazirmatn', bold: true, fontSize: 64, color: '#5e17eb' }),
        S('rounded', 190, 840, 700, 220, { fill: '#ffffff', radius: 40, strokeColor: '#ff66c4', strokeWidth: 4 }),
        T('پنجشنبه ۱ آذر · ساعت ۱۷\nمنزل ما', 540, 950, 660, { fontFamily: 'Vazirmatn', fontSize: 44, color: '#333333', lineHeight: 1.6 }),
        E('🎂', 430, 1110, 220),
      ],
    }],
  },
  {
    name: 'کاور صفحه', cat: 'fb-cover', tags: 'کاور هدر',
    pages: [{
      background: grad('#667eea', '#764ba2', 90),
      elements: [
        S('ellipse', 1250, -200, 600, 600, { fill: 'rgba(255,255,255,0.1)' }),
        S('ellipse', -150, 350, 500, 500, { fill: 'rgba(255,255,255,0.1)' }),
        T('استودیو خلاقیت', 820, 260, 1300, { fontFamily: 'Lalezar', fontSize: 140, color: '#ffffff' }),
        T('طراحی · برندینگ · محتوا', 820, 410, 1300, { fontFamily: 'Vazirmatn', fontSize: 54, color: '#f0e6ff' }),
      ],
    }],
  },
  {
    name: 'بنر تخفیف', cat: 'banner', tags: 'بنر وب سایت تخفیف',
    pages: [{
      background: color('#111111'),
      elements: [
        S('rect', 950, 0, 550, 500, { fill: '#c1ff72' }),
        T('۳۰٪', 1225, 250, 500, { fontFamily: 'Lalezar', fontSize: 220, color: '#111111' }),
        T('تخفیف جمعه سیاه', 470, 200, 860, { fontFamily: 'Lalezar', fontSize: 100, color: '#ffffff' }),
        T('روی همه‌ی محصولات فروشگاه', 470, 330, 860, { fontFamily: 'Vazirmatn', fontSize: 44, color: '#c1ff72' }),
      ],
    }],
  },
  {
    name: 'والپیپر', cat: 'wallpaper', tags: 'والپیپر پس زمینه',
    pages: [{
      background: grad('#30cfd0', '#330867', 180),
      elements: [
        S('blob', 140, 600, 800, 800, { fill: 'rgba(255,255,255,0.15)' }),
        S('star4', 760, 300, 120, 120, { fill: '#ffffff' }),
        S('star4', 200, 1700, 80, 80, { fill: '#ffffff' }),
        T('آرامش', 540, 1000, 900, { fontFamily: 'Lalezar', fontSize: 180, color: '#ffffff' }),
      ],
    }],
  },
];

export const TEMPLATES = defs.map((d, i) => ({ ...d, id: 'tpl' + i, format: fmt(d.cat) }));

// Instantiate a template as a fresh design (new ids).
export function designFromTemplate(tpl) {
  const pages = tpl.pages.map((p) => makePage({
    background: clone(p.background),
    elements: p.elements.map((e) => ({ ...clone(e), id: uid() })),
  }));
  return makeDesign({ name: tpl.name, w: tpl.format.w, h: tpl.format.h, pages });
}

export function templatePreviewDesign(tpl) {
  return { width: tpl.format.w, height: tpl.format.h, pages: tpl.pages, assets: {} };
}
