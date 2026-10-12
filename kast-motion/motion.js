/* KAST motion piece — deterministic, frame-driven timeline.
   window.render(t) paints the frame at time t (seconds). */
(() => {
const W = 1920, H = 1080, DURATION = 70;
const MINT = '#1EB997';
const $ = (id) => document.getElementById(id);

// ---------- math ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const P = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inCubic: x => x * x * x,
  inQuart: x => x * x * x * x,
  inOutCubic: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  inOutExpo: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outBack: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  outQuint: x => 1 - Math.pow(1 - x, 5),
  smooth: x => x * x * (3 - 2 * x),
};
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// in & out envelope: 0 → 1 (in over [a,a+di]) → 0 (out over [b,b+do])
const io = (t, a, di, b, dout, ein = E.outCubic, eout = E.inCubic) => ein(P(t, a, a + di)) * (1 - eout(P(t, b, b + dout)));

// ---------- DOM helpers ----------
function st(el, o) {
  if (o.op !== undefined) { el.style.opacity = o.op; el.style.visibility = o.op <= 0.002 ? 'hidden' : 'visible'; }
  let tr = el.classList.contains('center') ? 'translate(-50%,-50%) ' : '';
  if (o.persp) tr += `perspective(${o.persp}px) `;
  tr += `translate3d(${(o.x || 0).toFixed(2)}px,${(o.y || 0).toFixed(2)}px,${(o.z || 0).toFixed(2)}px) `;
  if (o.rx) tr += `rotateX(${o.rx}deg) `;
  if (o.ry) tr += `rotateY(${o.ry}deg) `;
  if (o.r) tr += `rotate(${o.r}deg) `;
  const s = o.s ?? 1;
  tr += `scale(${(o.sx ?? 1) * s},${(o.sy ?? 1) * s})`;
  el.style.transform = tr;
  if (o.blur !== undefined) el.style.filter = o.blur > 0.15 ? `blur(${o.blur.toFixed(2)}px)` : 'none';
}
function show(el, on) { el.style.display = on ? '' : 'none'; return on; }

function setWords(el, text) {
  if (el._text === text) return el._spans;
  el._text = text; el.innerHTML = '';
  const spans = [];
  text.split('|').forEach((line, li) => {
    if (li > 0) el.appendChild(document.createElement('br'));
    const toks = line.split(' ');
    toks.forEach((tok, i) => {
      const s = document.createElement('span'); s.className = 'word';
      let w = tok;
      if (w.startsWith('~')) { s.classList.add('mint'); w = w.slice(1); }
      else if (w.startsWith('^')) { s.classList.add('muted'); w = w.slice(1); }
      s.textContent = w + (i < toks.length - 1 ? ' ' : '');
      el.appendChild(s); spans.push(s);
    });
  });
  el._spans = spans; return spans;
}
function words(el, text, t, tin, tout, o = {}) {
  const spans = setWords(el, text);
  const stg = o.stagger ?? 0.07, dur = o.dur ?? 0.6, od = o.outDur ?? 0.4, dy = o.dy ?? 46;
  if (t < tin - 0.01 || t > tout + od + spans.length * stg * 0.3 + 0.05) { el.style.visibility = 'hidden'; return; }
  el.style.visibility = 'visible'; el.style.opacity = 1;
  spans.forEach((s, i) => {
    const p = E.outQuint(P(t, tin + i * stg, tin + i * stg + dur));
    const q = E.inCubic(P(t, tout + i * stg * 0.3, tout + i * stg * 0.3 + od));
    const blur = (1 - p) * 14 + q * 16;
    s.style.opacity = (p * (1 - q)).toFixed(3);
    s.style.transform = `translateY(${((1 - p) * dy - q * 34).toFixed(2)}px) scale(${(1 - q * 0.04).toFixed(3)})`;
    s.style.filter = blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : 'none';
  });
}

// ---------- icons ----------
const ICONS = {
  bag: 'M6 8h12l1 13H5L6 8z M9 8a3 3 0 0 1 6 0',
  coffee: 'M4 9h12v4.5A5.5 5.5 0 0 1 10.5 19h-1A5.5 5.5 0 0 1 4 13.5V9z M16 10h1.5a2.5 2.5 0 0 1 0 5H16 M8 3v3 M12 3v3',
  plane: 'M22 2L11 13 M22 2l-7 20-4-9-9-4z',
  house: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6',
  cart: 'M2 4h3l2.6 11h10.9L21 8H6.4 M9 20.5a.5.5 0 1 0 0-1a.5.5 0 0 0 0 1z M18 20.5a.5.5 0 1 0 0-1a.5.5 0 0 0 0 1z',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z M3 7l3-3h11v3 M16 13.5h2',
  swap: 'M7 4L3 8l4 4 M3 8h14 M17 20l4-4-4-4 M21 16H7',
  gas: 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16 M3 21h12 M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3 M7 7h4',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13z M20 20l-4.8-4.8',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  card: 'M3 6h18v12H3z M3 10h18 M7 15h3',
  user: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  laptop: 'M5 5h14v10H5z M2 19h20',
  building: 'M5 21V4h10v17 M15 9h4v12 M3 21h18 M8 8h1 M11 8h1 M8 12h1 M11 12h1 M8 16h1 M11 16h1',
};
const icon = (name, size = 28, color = '#fff', sw = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]}"/></svg>`;

// ---------- KAST mark + wordmark ----------
const K_W = 510, K_H = 580;
const K_TOP = 'M0,0 L125,0 L125,150 L410,0 L510,0 L510,105 L122,290 L0,236 Z';
const K_BOT = 'M0,580 L125,580 L125,430 L410,580 L510,580 L510,475 L122,290 L0,344 Z';
const SVGNS = 'http://www.w3.org/2000/svg';
let gradSeq = 0;
function makeLogo(el, Wb, Hb, fs, withText = true) {
  const id = 'g' + (gradSeq++);
  const kh = fs * 0.727, kw = kh * K_W / K_H, gap = fs * 0.2;
  el.innerHTML = `<svg width="${Wb}" height="${Hb}" viewBox="0 0 ${Wb} ${Hb}">
    <defs>
      <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${Wb}" y2="0">
        <stop offset="0" stop-color="#fff"/><stop offset=".42" stop-color="#fff"/>
        <stop offset=".5" stop-color="#8ff5d7"/><stop offset=".58" stop-color="#fff"/><stop offset="1" stop-color="#fff"/>
      </linearGradient>
      <clipPath id="${id}c"><rect x="0" y="0" width="0" height="${Hb}"/></clipPath>
      <filter id="${id}f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
    </defs>
    <g class="kglow" opacity="0" filter="url(#${id}f)"><path d="${K_TOP}" fill="${MINT}"/><path d="${K_BOT}" fill="${MINT}"/></g>
    <g class="k"><path class="kt" d="${K_TOP}" fill="url(#${id})"/><path class="kb" d="${K_BOT}" fill="url(#${id})"/></g>
    ${withText ? `<g clip-path="url(#${id}c)"><text class="wm" x="0" y="0" font-family="Inter Display" font-weight="500" font-size="${fs}" letter-spacing="${fs * 0.03}" fill="url(#${id})">KAST</text></g>` : ''}
  </svg>`;
  const svg = el.querySelector('svg');
  const L = { el, svg, fs, kw, kh, Wb, Hb, grad: svg.querySelector('linearGradient'), clip: svg.querySelector('clipPath rect'),
    k: svg.querySelector('.k'), kglow: svg.querySelector('.kglow'), kt: svg.querySelector('.kt'), kb: svg.querySelector('.kb'),
    kglowParts: svg.querySelectorAll('.kglow path'), text: svg.querySelector('.wm') };
  const tw = L.text ? L.text.getBBox().width - fs * 0.03 : 0;
  const total = withText ? kw + gap + tw : kw;
  L.kx = (Wb - total) / 2; L.ky = (Hb - kh) / 2; L.tx = L.kx + kw + gap; L.tw = tw; L.base = L.ky + kh;
  if (L.text) { L.text.setAttribute('x', L.tx); L.text.setAttribute('y', L.base); }
  return L;
}
// animate the logo: pieces converge and snap at tSnap, then K slides left and the wordmark wipes in.
function animLogo(L, t, tSnap, o = {}) {
  const conv = o.conv ?? 1.0, dist = o.dist ?? 520, startScale = o.startScale ?? 1.7;
  const p = E.inQuart(P(t, tSnap - conv, tSnap));
  const off = (1 - p) * dist;
  const kS = L.kw / K_W;
  const bump = t > tSnap ? 1 + 0.09 * Math.exp(-(t - tSnap) * 9) * Math.cos((t - tSnap) * 30) : 1;
  const mv = withTextMove(L, t, tSnap);
  const cx = lerp(L.Wb / 2, L.kx + L.kw / 2, mv), cy = L.Hb / 2;
  const sc = lerp(startScale, 1, mv) * bump;
  const tr = `translate(${cx},${cy}) scale(${sc * kS}) translate(${-K_W / 2},${-K_H / 2})`;
  L.k.setAttribute('transform', tr); L.kglow.setAttribute('transform', tr);
  L.kt.setAttribute('transform', `translate(${-off * 0.35},${-off})`);
  L.kb.setAttribute('transform', `translate(${off * 0.35},${off})`);
  L.kglowParts[0].setAttribute('transform', `translate(${-off * 0.35},${-off})`);
  L.kglowParts[1].setAttribute('transform', `translate(${off * 0.35},${off})`);
  L.k.setAttribute('opacity', E.outCubic(P(t, tSnap - conv, tSnap - conv + 0.25)));
  const glow = t < tSnap ? 0.25 * p : 0.25 + 0.75 * Math.exp(-(t - tSnap) * 2.2);
  L.kglow.setAttribute('opacity', (glow * E.outCubic(P(t, tSnap - conv, tSnap - conv + 0.25))).toFixed(3));
  if (L.text) {
    const r = E.outExpo(P(t, tSnap + 0.35, tSnap + 1.0));
    L.clip.setAttribute('x', L.tx - 20); L.clip.setAttribute('width', (L.tw + 60) * r);
    L.text.setAttribute('x', L.tx - 50 * (1 - r));
  }
  // shine sweep
  const sp = P(t, tSnap + (o.shine ?? 1.5), tSnap + (o.shine ?? 1.5) + 1.1);
  const sx = lerp(-L.Wb, L.Wb, E.inOutCubic(sp));
  L.grad.setAttribute('gradientTransform', `translate(${sx},0)`);
}
function withTextMove(L, t, tSnap) { return L.text ? E.outExpo(P(t, tSnap + 0.22, tSnap + 0.9)) : 0; }

// ---------- background canvases ----------
const bg = $('bg').getContext('2d');
const fx = $('fx').getContext('2d');
const grainC = $('grain'), grain = grainC.getContext('2d');
const grainImg = grain.createImageData(480, 270);

const rnd = mulberry32(7);
const DUST = Array.from({ length: 140 }, () => ({ x: rnd() * W, y: rnd() * H, z: 0.2 + rnd() * 0.8, ph: rnd() * 6.28, sp: 0.3 + rnd() }));

function drawBG(t) {
  bg.fillStyle = '#0C0C0E'; bg.fillRect(0, 0, W, H);
  // soft floor gradient
  const g = bg.createRadialGradient(960, 1250, 50, 960, 1250, 1100);
  g.addColorStop(0, 'rgba(30,185,151,0.10)'); g.addColorStop(1, 'rgba(30,185,151,0)');
  bg.fillStyle = g; bg.fillRect(0, 0, W, H);
  for (const d of DUST) {
    const x = (d.x + t * 14 * d.z * d.sp) % (W + 40) - 20;
    const y = (d.y - t * 22 * d.z * d.sp + H * 10) % (H + 40) - 20;
    const a = (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.7 * d.sp + d.ph))) * d.z * 0.55;
    bg.fillStyle = `rgba(150,240,215,${a.toFixed(3)})`;
    bg.beginPath(); bg.arc(x, y, 0.6 + d.z * 1.8, 0, 6.283); bg.fill();
  }
}

function drawGrain(frame) {
  const r = mulberry32(frame * 9973 + 1);
  const d = grainImg.data;
  for (let i = 0; i < d.length; i += 4) { const v = (r() * 255) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  grain.putImageData(grainImg, 0, 0);
}

// glow keyframes: [t, opacity, x, y, rot, scale]
const GLOW = [
  [0, 0, 0, 0, -10, .8], [1.0, .6, 0, 0, -6, 1.0], [6.5, .5, 0, 0, 4, 1.1],
  [7.3, .4, -430, 60, 20, .9], [12.5, .4, -380, 40, 26, .95],
  [13.3, .28, 0, -200, 0, 1.2], [22.0, .28, 0, -150, 10, 1.25],
  [22.6, .06, 0, 0, 0, .6], [24.9, .2, 0, 0, 0, .7], [25.05, 1.0, 0, 0, -4, 1.05], [27.5, .62, 0, 0, 6, 1.15],
  [28.3, .42, -520, 220, -20, 1.0], [33.0, .42, -480, 200, -14, 1.05],
  [33.8, .42, 520, 120, 30, 1.0], [38.5, .42, 480, 100, 36, 1.05],
  [39.3, .5, 480, 120, 0, 1.15], [44.0, .5, 460, 100, 8, 1.2],
  [44.8, .46, 300, 60, -30, 1.0], [49.5, .46, 280, 40, -24, 1.05],
  [50.3, .45, 0, 260, 0, 1.2], [53.4, .45, 0, 220, 6, 1.2], [54.0, .5, 0, 60, 10, 1.1], [55.55, .5, 0, 60, 14, 1.1], [55.7, .85, 0, 60, 16, 1.15], [58.0, .6, 0, 60, 22, 1.2],
  [58.8, .22, 0, 0, 0, 1.0], [63.6, .18, 0, 0, 0, .8], [64.3, .18, 0, 0, 0, .8], [64.4, .95, 0, 0, -4, 1.05], [68.6, .55, 0, 0, 6, 1.15], [70, 0, 0, 0, 8, 1.2],
];
function glowAt(t) {
  let i = 0; while (i < GLOW.length - 2 && GLOW[i + 1][0] <= t) i++;
  const a = GLOW[i], b = GLOW[i + 1];
  const p = E.smooth(P(t, a[0], b[0]));
  return a.map((v, k) => lerp(v, b[k], p));
}

// ---------- scene setup ----------
// S2 coins & icons
const COINS = [['₿', 230, 330], ['$', 520, 270], ['Ξ', 380, 520], ['$', 640, 600], ['₮', 220, 690]];
const coinEls = COINS.map(([g, x, y]) => {
  const d = document.createElement('div');
  d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:130px;height:130px;border-radius:50%;display:grid;place-items:center;
    font-family:'Inter';font-weight:700;font-size:58px;color:${MINT};
    background:radial-gradient(circle at 35% 30%,#1d3a33,#0b1311 70%);border:2px solid rgba(30,185,151,.55);
    box-shadow:0 0 40px rgba(30,185,151,.25), inset 0 0 24px rgba(30,185,151,.18);`;
  d.textContent = g; $('s2coins').appendChild(d); return d;
});
const RICONS = [['bag', 300, 300], ['coffee', 560, 520], ['plane', 220, 560], ['cart', 600, 260], ['house', 360, 720]];
const riconEls = RICONS.map(([n, x, y]) => {
  const d = document.createElement('div');
  d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:130px;height:130px;border-radius:34px;display:grid;place-items:center;
    background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.16);box-shadow:0 20px 50px rgba(0,0,0,.5)`;
  d.innerHTML = icon(n, 58, '#fff', 1.6); $('s2icons').appendChild(d); return d;
});
// crack
(() => {
  const r = mulberry32(42); let pts = []; for (let y = 90; y <= 840; y += 30) pts.push([960 + (r() - .5) * 46, y]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1]).join(' ');
  $('s2gap').innerHTML = `
    <defs><linearGradient id="chasm" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".95"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
    <rect id="chasmR" x="860" y="60" width="200" height="800" fill="url(#chasm)"/>
    <path id="crack" d="${d}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/>
    <g id="bridgeG"><line id="bridge" x1="640" y1="470" x2="640" y2="470" stroke="${MINT}" stroke-width="6" stroke-dasharray="18 12" stroke-linecap="round"/>
      <circle id="bridgeEnd" cx="640" cy="470" r="9" fill="${MINT}"/></g>`;
})();
const crack = $('crack'); const crackLen = crack.getTotalLength();
crack.style.strokeDasharray = crackLen;

// S3 rows
const ROWS = [['wallet', 'Transferring assets between wallets'], ['swap', 'Swapping tokens'], ['gas', 'Dealing with transaction fees'], ['search', 'Finding practical ways to spend']];
const rowEls = ROWS.map(([ic, txt], i) => {
  const d = document.createElement('div'); d.className = 'row'; d.style.top = (290 + i * 135) + 'px';
  d.innerHTML = `<div class="num">0${i + 1}</div><div class="ico">${icon(ic, 30, '#CFCFCF', 1.8)}</div>
    <div style="flex:1"><span class="txt">${txt}</span></div><div class="x">● FRICTION</div><div class="strike"></div>`;
  $('s3rows').appendChild(d); return d;
});

// S5 header data
const PILLARS = [
  { a: 28, b: 33.5, num: '01', lab: '01 / 04 — Payments', title: 'Bring crypto to ~everyday ~payments', body: 'Eligible users can pay at supported online|and in-store merchants with a KAST card.' },
  { a: 33.5, b: 39, num: '02', lab: '02 / 04 — Stablecoins', title: 'Make digital ~dollars ~useful', body: 'Stablecoins are designed to hold a relatively|stable value against assets like the US dollar.' },
  { a: 39, b: 44.5, num: '03', lab: '03 / 04 — Global', title: 'Simplify ~global ~money', body: 'For freelancers, travelers, remote workers|and international businesses.' },
  { a: 44.5, b: 50, num: '04', lab: '04 / 04 — Experience', title: 'Make crypto ~easier ~to ~use', body: 'No networks, addresses or swaps to juggle.|Simple experience. Transparent fees.' },
];
// P1 transactions
const TXS = [['coffee', 'Coffee shop', 'In-store · KAST card', '− 4.80 USD'], ['bag', 'Online store', 'Online · KAST card', '− 59.00 USD'], ['plane', 'Flight booking', 'Abroad · KAST card', '− 320.00 USD']];
const txEls = TXS.map(([ic, n, s, a], i) => {
  const d = document.createElement('div'); d.className = 'tx'; d.style.left = '1110px'; d.style.top = (390 + i * 128) + 'px';
  d.innerHTML = `<div class="ic">${icon(ic, 28, '#fff', 1.8)}</div><div><div class="n">${n}</div><div class="s">${s}</div></div>
    <div class="a">${a}<div class="s" style="color:${MINT}">✓ Approved</div></div>`;
  $('p1tx').appendChild(d); return d;
});
$('posNfc').innerHTML = `<g fill="none" stroke="#AFAFB2" stroke-width="5" stroke-linecap="round">
  <path d="M150 90 a40 40 0 0 1 0 60"/><path d="M168 72 a65 65 0 0 1 0 96"/><path d="M186 54 a90 90 0 0 1 0 132"/></g>
  <circle cx="130" cy="120" r="7" fill="#AFAFB2"/>`;

// P2 chart
const chart = $('p2chart');
(() => {
  const r = mulberry32(5); let v = 0.5, vol = [], stab = [];
  for (let i = 0; i <= 60; i++) { v += (r() - .5) * .16 + (i > 30 ? -.012 : .01); v = clamp(v, .08, .95); vol.push(v); stab.push(.5 + (r() - .5) * 0.012); }
  const X = i => 40 + i * 16.5, Y = v => 460 - v * 400;
  const path = arr => arr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
  let grid = ''; for (let i = 0; i < 5; i++) grid += `<line x1="40" x2="1030" y1="${60 + i * 100}" y2="${60 + i * 100}" stroke="rgba(255,255,255,.07)"/>`;
  chart.innerHTML = `${grid}
    <path id="volP" d="${path(vol)}" fill="none" stroke="#6f7176" stroke-width="3" stroke-linejoin="round"/>
    <path id="stabG" d="${path(stab)}" fill="none" stroke="${MINT}" stroke-width="16" opacity=".25" style="filter:blur(8px)"/>
    <path id="stabP" d="${path(stab)}" fill="none" stroke="${MINT}" stroke-width="5" stroke-linecap="round"/>
    <circle id="stabDot" cx="${X(60)}" cy="${Y(stab[60])}" r="10" fill="${MINT}"/>
    <circle id="stabRing" cx="${X(60)}" cy="${Y(stab[60])}" r="10" fill="none" stroke="${MINT}" stroke-width="2"/>
    <text id="volT" x="${X(22)}" y="${Y(Math.max(...vol)) - 26}" text-anchor="middle" font-family="Inter" font-size="22" fill="#8a8c90" letter-spacing="2">VOLATILE ASSET</text>
    <text id="stabT" x="${X(60) - 4}" y="${Y(stab[60]) + 56}" text-anchor="end" font-family="Inter" font-weight="600" font-size="24" fill="${MINT}" letter-spacing="2">STABLECOIN ≈ $1.00</text>`;
})();
const volP = $('volP'), stabP = $('stabP'), stabG = $('stabG');
const volLen = volP.getTotalLength(), stabLen = stabP.getTotalLength();
[volP, stabP, stabG].forEach(p => p.style.strokeDasharray = p.getTotalLength());

// P3 tags
const TAGS = [['user', 'Freelancers', 960, 330], ['plane', 'Travelers', 1600, 230], ['laptop', 'Remote workers', 1560, 860], ['building', 'Businesses', 990, 800]];
const tagEls = TAGS.map(([ic, txt, x, y]) => {
  const d = document.createElement('div'); d.className = 'chip'; d.style.left = x + 'px'; d.style.top = y + 'px';
  d.style.display = 'flex'; d.style.alignItems = 'center'; d.style.gap = '14px'; d.style.color = '#fff';
  d.innerHTML = `${icon(ic, 26, MINT, 2)}<span>${txt}</span>`; $('p3tags').appendChild(d); return d;
});
// globe data
const gr = mulberry32(11);
const NOISE = Array.from({ length: 64 }, () => gr());
function vnoise(a, b) { // cheap smooth value noise on sphere coords
  const s = Math.sin(a * 2.1 + NOISE[3] * 6) * Math.cos(b * 1.7 + NOISE[5] * 6) + Math.sin(a * 4.3 + b * 2.2 + NOISE[9] * 6) * .55 + Math.cos(b * 3.7 - a * 1.3 + NOISE[13] * 6) * .45;
  return s;
}
const GPTS = [];
for (let lat = -78; lat <= 78; lat += 4.2) {
  const n = Math.max(6, Math.round(86 * Math.cos(lat * Math.PI / 180)));
  for (let j = 0; j < n; j++) { const lon = j / n * 360; GPTS.push([lat * Math.PI / 180, lon * Math.PI / 180, vnoise(lat * Math.PI / 180, lon * Math.PI / 180) > 0.1]); }
}
const CITIES = [[40.7, -74], [51.5, 0], [1.35, 103.8], [25.2, 55.3], [35.7, 139.7], [-23.5, -46.6], [19.4, -99.1], [6.5, 3.4], [-33.9, 151.2], [52.5, 13.4]];
const ARCS = [[0, 1], [1, 3], [3, 2], [2, 4], [5, 0], [7, 1], [6, 0], [9, 3], [2, 8]];

// P4 chips
const CHIPS = [['Select network ▾', 1010, 250], ['0x7a3F…9c21', 1300, 240], ['Swap USDT → USDC', 1580, 340], ['Gas fee: 0.0042', 900, 520],
  ['Bridge funds', 1650, 650], ['Confirmations 3/12', 930, 760], ['Slippage 0.5%', 1290, 820], ['Approve token', 1620, 500]];
const chipEls = CHIPS.map(([txt, x, y]) => {
  const d = document.createElement('div'); d.className = 'chip'; d.style.left = x + 'px'; d.style.top = y + 'px';
  d.style.fontFamily = txt.startsWith('0x') ? 'DejaVu Sans Mono, monospace' : 'Inter';
  d.textContent = txt; $('p4chips').appendChild(d); return d;
});

// S6 K badge
$('s6K').innerHTML = `<div style="position:absolute;inset:-16px;border-radius:50%;background:radial-gradient(circle,#13201c 0%,#0c0f0e 70%);border:2px solid rgba(30,185,151,.7);box-shadow:0 0 80px rgba(30,185,151,.55)"></div>
  <svg viewBox="0 0 510 580" width="110" height="125" style="position:absolute;left:45px;top:51px"><path d="${K_TOP}" fill="#fff"/><path d="${K_BOT}" fill="#fff"/></svg>`;

// logos
let L4, L7;
function initLogos() {
  L4 = makeLogo($('s4logo'), 1200, 300, 230);
  L7 = makeLogo($('endLogo'), 900, 200, 150);
}
// construction grid lines for the logo scenes
const gridSvg = $('grid');
function gridLinesFor(L, ox, oy) {
  const xs = [L.kx, L.kx + L.kw, L.tx, L.tx + L.tw].map(v => ox + v);
  const ys = [L.ky, L.base].map(v => oy + v);
  const g = document.createElementNS(SVGNS, 'g');
  const lines = [];
  xs.forEach(x => { const l = document.createElementNS(SVGNS, 'line'); l._v = 1; l._c = x; g.appendChild(l); lines.push(l); });
  ys.forEach(y => { const l = document.createElementNS(SVGNS, 'line'); l._v = 0; l._c = y; g.appendChild(l); lines.push(l); });
  lines.forEach(l => { l.setAttribute('stroke', 'rgba(255,255,255,.16)'); l.setAttribute('stroke-width', '1.5'); l.setAttribute('stroke-dasharray', '10 12'); });
  gridSvg.appendChild(g); return { g, lines };
}
let G4, G7;
function animGrid(G, t, a, out) {
  const vis = t > a && t < out + 0.6;
  G.g.style.display = vis ? '' : 'none'; if (!vis) return;
  G.lines.forEach((l, i) => {
    const p = E.outExpo(P(t, a + i * 0.07, a + i * 0.07 + 0.9));
    const o = 1 - P(t, out, out + 0.5);
    if (l._v) { const c = 540, h = 600 * p; l.setAttribute('x1', l._c); l.setAttribute('x2', l._c); l.setAttribute('y1', c - h); l.setAttribute('y2', c + h); }
    else { const c = 960, h = 1000 * p; l.setAttribute('y1', l._c); l.setAttribute('y2', l._c); l.setAttribute('x1', c - h); l.setAttribute('x2', c + h); }
    l.setAttribute('opacity', o);
  });
}

// ---------- FX ----------
const STREAKS = [6.75, 12.85, 22.35, 27.85, 33.35, 38.85, 44.35, 49.85, 53.4, 58.35];
const RINGS = [[1.0, .6], [25.0, 1], [55.6, .7], [64.3, .9], [30.85, .0]];
const FLASH = [[1.0, .2], [25.0, .6], [55.6, .25], [64.3, .5], [47.65, .1]];
const SHAKE = [[1.0, 4], [25.0, 16], [55.6, 6], [64.3, 11], [30.85, 4], [47.65, 5]];

function drawFX(t) {
  fx.clearRect(0, 0, W, H);
  fx.globalCompositeOperation = 'lighter';
  for (const ts of STREAKS) {
    const p = P(t, ts - 0.35, ts + 0.35); if (p <= 0 || p >= 1) continue;
    const x = lerp(-900, W + 900, E.inOutCubic(p));
    fx.save(); fx.translate(x, H / 2); fx.rotate(-0.38);
    const g = fx.createLinearGradient(-260, 0, 260, 0);
    g.addColorStop(0, 'rgba(30,185,151,0)'); g.addColorStop(.42, 'rgba(30,185,151,.28)'); g.addColorStop(.5, 'rgba(210,255,240,.55)');
    g.addColorStop(.58, 'rgba(30,185,151,.28)'); g.addColorStop(1, 'rgba(30,185,151,0)');
    fx.fillStyle = g; fx.fillRect(-260, -1400, 520, 2800);
    fx.fillStyle = 'rgba(255,255,255,.7)'; fx.fillRect(-1.5, -1400, 3, 2800);
    fx.restore();
  }
  for (const [ts, amp] of RINGS) {
    const p = P(t, ts, ts + 1.3); if (p <= 0 || p >= 1 || amp === 0) continue;
    const r = 40 + 1300 * E.outExpo(p);
    fx.strokeStyle = `rgba(30,185,151,${(amp * (1 - p) * .8).toFixed(3)})`; fx.lineWidth = 2 + 26 * (1 - p);
    fx.beginPath(); fx.arc(960, ts === 55.6 ? 580 : ts === 25.0 ? 470 : ts === 64.3 ? 440 : 540, r, 0, 6.283); fx.stroke();
  }
  // NFC waves at tap
  if (t > 30.75 && t < 32.2) {
    for (let k = 0; k < 4; k++) {
      const p = P(t, 30.8 + k * 0.16, 30.8 + k * 0.16 + 0.9); if (p <= 0 || p >= 1) continue;
      fx.strokeStyle = `rgba(30,185,151,${(1 - p) * .9})`; fx.lineWidth = 4;
      fx.beginPath(); fx.arc(1500, 660, 40 + p * 380, -1.1, 1.1); fx.stroke();
      fx.beginPath(); fx.arc(1500, 660, 40 + p * 380, Math.PI - 1.1, Math.PI + 1.1); fx.stroke();
    }
  }
  // S2 sparks when the bridge breaks
  if (t > 10.3 && t < 12.2) {
    const r = mulberry32(99);
    for (let i = 0; i < 40; i++) {
      const dt = t - 10.35 - r() * 0.15; if (dt < 0) continue;
      const vx = (r() - .2) * 300, vy = -200 + r() * 260;
      const x = 950 + vx * dt, y = 470 + vy * dt + 520 * dt * dt;
      const a = Math.max(0, 1 - dt / 1.4);
      fx.fillStyle = `rgba(120,240,205,${a})`; fx.beginPath(); fx.arc(x, y, 2 + r() * 2.5, 0, 6.283); fx.fill();
    }
  }
  // S6 beam particles
  if (t > 55.0 && t < 58.6) {
    const a = Math.min(P(t, 55.0, 55.6), 1 - P(t, 58.0, 58.5));
    const r = mulberry32(3);
    for (let i = 0; i < 70; i++) {
      const sp = 0.25 + r() * 0.35, ph = r(), dir = r() < .5 ? 1 : -1;
      let u = (ph + t * sp) % 1; if (dir < 0) u = 1 - u;
      const x = lerp(630, 1290, u), y = 580 + Math.sin(u * 18 + i) * (6 + r() * 16) * Math.sin(u * Math.PI);
      fx.fillStyle = `rgba(150,250,220,${(a * (0.4 + 0.6 * Math.sin(u * Math.PI))).toFixed(3)})`;
      fx.beginPath(); fx.arc(x, y, 1.5 + r() * 2.5, 0, 6.283); fx.fill();
    }
  }
  fx.globalCompositeOperation = 'source-over';
}

// ---------- globe ----------
const gctx = $('globe').getContext('2d');
function drawGlobe(t, alpha) {
  const c = gctx; c.clearRect(0, 0, 1000, 1000);
  const R = 360, cx = 500, cy = 500, rot = t * 0.32 + 1.2, tilt = 0.32;
  const ct = Math.cos(tilt), stt = Math.sin(tilt);
  const proj = (lat, lon, alt = 1) => {
    const x0 = Math.cos(lat) * Math.sin(lon + rot), y0 = Math.sin(lat), z0 = Math.cos(lat) * Math.cos(lon + rot);
    const y1 = y0 * ct - z0 * stt, z1 = y0 * stt + z0 * ct;
    return [cx + x0 * R * alt, cy - y1 * R * alt, z1];
  };
  // atmosphere
  const g = c.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.25);
  g.addColorStop(0, `rgba(30,185,151,${0.22 * alpha})`); g.addColorStop(1, 'rgba(30,185,151,0)');
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 1.25, 0, 6.283); c.fill();
  c.fillStyle = `rgba(10,14,13,${0.9 * alpha})`; c.beginPath(); c.arc(cx, cy, R, 0, 6.283); c.fill();
  c.strokeStyle = `rgba(30,185,151,${0.35 * alpha})`; c.lineWidth = 1.5; c.stroke();
  for (const [la, lo, land] of GPTS) {
    const [x, y, z] = proj(la, lo); if (z < 0) continue;
    const a = (land ? 1 : 0.22) * (0.2 + 0.8 * z) * alpha;
    c.fillStyle = land ? `rgba(120,230,200,${a.toFixed(3)})` : `rgba(200,200,205,${a.toFixed(3)})`;
    const s = land ? 3.2 : 1.6; c.fillRect(x - s / 2, y - s / 2, s, s);
  }
  const rad = d => d * Math.PI / 180;
  ARCS.forEach(([i, j], k) => {
    const st0 = 39.9 + k * 0.32; const p = E.outCubic(P(t, st0, st0 + 1.1)); if (p <= 0) return;
    const A = CITIES[i], B = CITIES[j];
    const va = [Math.cos(rad(A[0])) * Math.cos(rad(A[1])), Math.cos(rad(A[0])) * Math.sin(rad(A[1])), Math.sin(rad(A[0]))];
    const vb = [Math.cos(rad(B[0])) * Math.cos(rad(B[1])), Math.cos(rad(B[0])) * Math.sin(rad(B[1])), Math.sin(rad(B[0]))];
    const N = 50; const pts = [];
    for (let s = 0; s <= N * p; s++) {
      const u = s / N; let v = va.map((a, q) => a * (1 - u) + vb[q] * u); const n = Math.hypot(...v); v = v.map(q => q / n);
      const lat = Math.asin(v[2]), lon = Math.atan2(v[1], v[0]);
      pts.push(proj(lat, lon, 1 + 0.22 * Math.sin(Math.PI * u)));
    }
    c.lineWidth = 2.5; c.strokeStyle = `rgba(30,185,151,${0.9 * alpha})`; c.beginPath();
    let pen = false; for (const [x, y, z] of pts) { if (z < -0.15) { pen = false; continue; } if (!pen) { c.moveTo(x, y); pen = true; } else c.lineTo(x, y); }
    c.stroke();
    // endpoints
    [A, B].forEach((C, q) => { if (q === 1 && p < 1) return; const [x, y, z] = proj(rad(C[0]), rad(C[1])); if (z < 0) return;
      c.fillStyle = `rgba(220,255,245,${alpha})`; c.beginPath(); c.arc(x, y, 5, 0, 6.283); c.fill();
      c.strokeStyle = `rgba(30,185,151,${alpha * 0.6})`; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 9 + 6 * Math.sin(t * 5 + k), 0, 6.283); c.stroke(); });
    // pulse
    if (p >= 1) { const u = (t * 0.6 + k * 0.17) % 1; const v0 = va.map((a, q) => a * (1 - u) + vb[q] * u); const n = Math.hypot(...v0);
      const [x, y, z] = proj(Math.asin(v0[2] / n), Math.atan2(v0[1], v0[0]), 1 + 0.22 * Math.sin(Math.PI * u));
      if (z > -0.1) { c.fillStyle = `rgba(255,255,255,${alpha})`; c.beginPath(); c.arc(x, y, 4, 0, 6.283); c.fill(); } }
  });
}

// ---------- main render ----------
let lastPillar = -1;
function render(t) {
  const frame = Math.round(t * 30);
  drawBG(t);
  drawGrain(frame);
  const [, gop, gx, gy, grot, gs] = glowAt(t);
  const breathe = 1 + 0.03 * Math.sin(t * 1.3);
  st($('glow'), { op: gop, x: gx, y: gy, r: grot + t * 1.5, s: gs * breathe });

  // camera shake + flash
  let sx = 0, sy = 0; for (const [ts, a] of SHAKE) if (t >= ts) { const k = a * Math.exp(-(t - ts) * 7); sx += k * Math.sin((t - ts) * 71); sy += k * Math.cos((t - ts) * 53); }
  $('stage').style.transform = `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`;
  let fl = 0; for (const [ts, a] of FLASH) if (t >= ts) fl += a * Math.exp(-(t - ts) * 7);
  $('flash').style.opacity = Math.min(1, fl).toFixed(3);

  // ===== S1 =====
  if (show($('s1'), t < 7.2)) {
    const lp = E.outExpo(P(t, 0.15, 1.0)), lp2 = E.outExpo(P(t, 3.7, 4.4));
    const lineOp = (t < 2.2 ? 1 - P(t, 1.4, 2.2) : lp2 * (1 - P(t, 5.7, 6.2))) * 0.9;
    st($('s1line'), { op: Math.max(0, t < 1.4 ? 1 : lineOp), sx: t < 2.2 ? lp : lp2, y: t < 2.2 ? 0 : 0 });
    st($('s1label'), { op: io(t, 0.9, 0.6, 5.6, 0.4), y: (1 - E.outCubic(P(t, 0.9, 1.5))) * 20 });
    const split = E.inOutCubic(P(t, 3.6, 4.3)) * (1 - E.inCubic(P(t, 5.8, 6.4)));
    words($('s1a'), 'How do we bridge the gap', t, 1.0, 5.75, { stagger: 0.09 });
    words($('s1b'), 'between ~crypto and the ~real ~world?', t, 2.2, 5.85, { stagger: 0.09 });
    const zo = E.inCubic(P(t, 5.8, 6.6));
    st($('s1a'), { y: -split * 26, s: 1 + zo * 0.12 });
    st($('s1b'), { y: split * 26, s: 1 + zo * 0.12 });
  }

  // ===== S2 =====
  if (show($('s2'), t > 6.9 && t < 13.2)) {
    const out = E.inCubic(P(t, 12.4, 12.95));
    coinEls.forEach((el, i) => {
      const p = E.outBack(P(t, 7.0 + i * 0.12, 7.6 + i * 0.12));
      st(el, { op: clamp(p) * (1 - out), x: (1 - p) * -260 - out * 200, y: Math.sin(t * 1.6 + i) * 12, s: 0.6 + 0.4 * p, r: Math.sin(t + i) * 6 });
    });
    riconEls.forEach((el, i) => {
      const p = E.outBack(P(t, 7.25 + i * 0.12, 7.85 + i * 0.12));
      st(el, { op: clamp(p) * (1 - out), x: (1 - p) * 260 + out * 200, y: Math.cos(t * 1.4 + i) * 12, s: 0.6 + 0.4 * p });
    });
    st($('s2Llab'), { op: io(t, 7.3, 0.5, 12.4, 0.4), y: (1 - E.outCubic(P(t, 7.3, 7.8))) * 20 });
    st($('s2Rlab'), { op: io(t, 7.45, 0.5, 12.4, 0.4), y: (1 - E.outCubic(P(t, 7.45, 7.95))) * 20 });
    const cp = E.outCubic(P(t, 7.6, 8.5));
    crack.style.strokeDashoffset = crackLen * (1 - cp);
    const flick = t > 10.35 && t < 10.9 ? (Math.sin(t * 90) > 0 ? 1 : 0.3) : 1;
    crack.setAttribute('stroke', t > 10.35 && t < 11.2 ? `rgba(255,120,120,${0.8 * flick})` : 'rgba(255,255,255,.55)');
    $('s2gap').style.opacity = 1 - out;
    $('chasmR').setAttribute('opacity', cp);
    const bp = E.outCubic(P(t, 9.0, 10.3));
    const bx = lerp(640, 948, bp);
    const bridge = $('bridge'); bridge.setAttribute('x2', bx); $('bridgeEnd').setAttribute('cx', bx);
    const fall = E.inCubic(P(t, 10.45, 11.3));
    $('bridgeG').setAttribute('transform', `rotate(${fall * 38} 640 470) translate(0 ${fall * 60})`);
    $('bridgeG').setAttribute('opacity', (P(t, 8.95, 9.05) * (1 - fall)).toFixed(3));
    words($('s2cap'), 'Owning digital assets ≠ ~using ~them in everyday life.', t, 9.6, 12.3, { stagger: 0.06 });
  }

  // ===== S3 =====
  if (show($('s3'), t > 12.9 && t < 22.6)) {
    st($('s3lab'), { op: io(t, 13.1, 0.5, 18.4, 0.4) });
    rowEls.forEach((el, i) => {
      const a = 13.5 + i * 1.0, p = E.outExpo(P(t, a, a + 0.6));
      const jitter = t > a && t < a + 0.18 ? (Math.sin(t * 400 + i) * 14) : 0;
      const col = E.inOutCubic(P(t, 18.55 + i * 0.05, 19.0 + i * 0.05));
      st(el, { op: clamp(p) * (1 - col), x: (1 - p) * 160 + jitter, sy: 1 - col * 0.9, blur: (1 - p) * 10 });
      const strike = el.querySelector('.strike'), txt = el.querySelector('.txt');
      const sp = E.inOutCubic(P(t, 17.9 + i * 0.1, 18.3 + i * 0.1));
      strike.style.left = txt.offsetLeft + 'px'; strike.style.width = (txt.offsetWidth * sp) + 'px';
      txt.style.color = sp > 0.5 ? '#7d7f83' : '#fff';
    });
    words($('s3q1'), "Adoption isn't just buying ₿ or launching tokens.", t, 19.0, 21.9, { stagger: 0.05 });
    const q1 = $('s3q1'); const w1 = q1.offsetWidth;
    const sp = E.inOutCubic(P(t, 20.0, 20.45));
    st($('s3q1s'), { op: t > 20.0 && t < 22.3 ? 1 - P(t, 21.9, 22.3) : 0 });
    $('s3q1s').style.left = (960 - w1 / 2) + 'px'; $('s3q1s').style.width = (w1 * sp) + 'px';
    words($('s3q2'), "It's about making digital assets ~useful.", t, 20.5, 21.95, { stagger: 0.07 });
  }

  // ===== S4 =====
  if (show($('s4'), t > 22.4 && t < 28.2)) {
    words($('s4pre'), 'This is where', t, 22.6, 23.7, { stagger: 0.1 });
    const out = E.inCubic(P(t, 27.45, 27.95));
    animLogo(L4, t, 25.0, { conv: 1.0, dist: 560 });
    st($('s4logo'), { op: (t > 23.95 ? 1 : 0) * (1 - out), s: 1 - out * 0.1, blur: out * 14 });
    words($('s4handle'), 'comes in.', t, 26.0, 27.35, { stagger: 0.08 });
    st($('s4tag'), { op: io(t, 26.4, 0.6, 27.35, 0.4), y: (1 - E.outCubic(P(t, 26.4, 27.0))) * 16 });
    $('s4tag').textContent = 'Stablecoins  ⟷  Everyday payments';
  }
  animGrid(G4, t, 23.4, 26.6);

  // ===== S5 =====
  if (show($('s5'), t > 27.9 && t < 50.2)) {
    let k = PILLARS.findIndex(p => t >= p.a - 0.1 && t < p.b); if (k < 0) k = t < 28 ? 0 : 3;
    const Pk = PILLARS[k], lt0 = Pk.a, lt1 = Pk.b - 0.5;
    st($('pNum'), { op: io(t, lt0 + 0.05, 0.6, lt1, 0.35) * 0.9, x: (1 - E.outExpo(P(t, lt0 + 0.05, lt0 + 0.8))) * -80 });
    $('pNum').textContent = Pk.num;
    words($('pLab'), Pk.lab, t, lt0 + 0.1, lt1, { stagger: 0.04, dy: 20 });
    words($('pTitle'), Pk.title, t, lt0 + 0.2, lt1, { stagger: 0.06 });
    words($('pBody'), Pk.body, t, lt0 + 0.45, lt1, { stagger: 0.02, dy: 20, dur: 0.5 });
    st($('pHead'), { y: -30 });

    // P1 payments
    if (show($('p1'), t > 27.9 && t < 33.6)) {
      const out = E.inCubic(P(t, 33.0, 33.45));
      const fin = E.outExpo(P(t, 28.25, 29.4));
      const tap = E.inOutCubic(P(t, 30.15, 30.8)), back = E.inOutCubic(P(t, 31.05, 31.7));
      const tp = tap * (1 - back);
      const fl = Math.sin(t * 1.4);
      st($('p1card'), {
        persp: 1600, op: clamp(P(t, 28.25, 28.5)) * (1 - out),
        x: lerp(1500, -340, fin) + tp * 760 - out * 300, y: lerp(120, 140, fin) + fl * 8 - tp * 150,
        ry: lerp(-70, -14, fin) + fl * 4 + tp * 22, rx: lerp(25, 8, fin) - tp * 10, r: lerp(-18, -4, fin) + tp * 6,
        s: 0.82 - tp * 0.18,
      });
      const shp = P(t, 29.3, 30.1);
      const sh = $('p1card').firstChild;
      sh.style.background = `linear-gradient(105deg, transparent ${lerp(-40, 110, shp) - 18}%, rgba(255,255,255,.35) ${lerp(-40, 110, shp)}%, transparent ${lerp(-40, 110, shp) + 18}%)`;
      const pin = E.outExpo(P(t, 28.6, 29.5)), pout = E.inCubic(P(t, 31.4, 31.9));
      st($('pos'), { op: clamp(pin) * (1 - pout), x: (1 - pin) * 300 + pout * 300, y: Math.sin(t * 1.2) * 4 });
      const ok = t >= 30.85;
      $('posAmt').innerHTML = ok ? `<span style="color:${MINT}">✓</span>` : '$4.80';
      $('posAmt').style.transform = ok ? `scale(${1 + 0.4 * Math.exp(-(t - 30.85) * 8)})` : 'none';
      $('posStat').textContent = ok ? 'APPROVED' : 'TAP TO PAY';
      $('posStat').style.color = ok ? MINT : '#AFAFB2';
      txEls.forEach((el, i) => {
        const a = 31.6 + i * 0.3, p = E.outBack(P(t, a, a + 0.55));
        st(el, { op: clamp(P(t, a, a + 0.25)) * (1 - out), x: (1 - p) * 120, s: 0.85 + 0.15 * p });
      });
    }
    // P2 stablecoins
    if (show($('p2'), t > 33.4 && t < 39.1)) {
      const out = E.inCubic(P(t, 38.5, 38.95));
      st(chart, { op: clamp(P(t, 33.7, 34.0)) * (1 - out), y: 70 });
      const vp = E.inOutCubic(P(t, 33.8, 35.2)), sp = E.inOutCubic(P(t, 34.3, 35.6));
      volP.style.strokeDashoffset = volLen * (1 - vp);
      stabP.style.strokeDashoffset = stabLen * (1 - sp); stabG.style.strokeDashoffset = stabLen * (1 - sp);
      const dOp = P(t, 35.5, 35.7);
      $('stabDot').setAttribute('opacity', dOp);
      const rp = ((t - 35.6) % 1.2) / 1.2;
      $('stabRing').setAttribute('r', 10 + Math.max(0, rp) * 34); $('stabRing').setAttribute('opacity', t > 35.6 ? (1 - rp) : 0);
      $('volT').setAttribute('opacity', P(t, 35.1, 35.5)); $('stabT').setAttribute('opacity', P(t, 35.6, 36.0));
      // rolling counter
      let txt;
      if (t < 35.6) { const r = mulberry32(Math.floor(t * 20)); txt = '$' + (r() * 9).toFixed(2); } else txt = '$1.00';
      $('p2big').innerHTML = t < 35.6 ? `<span style="color:#8a8c90">${txt}</span>` : `<span class="mint" style="text-shadow:0 0 40px rgba(30,185,151,.5)">${txt}</span>`;
      st($('p2big'), { op: clamp(P(t, 34.3, 34.6)) * (1 - out), s: t > 35.6 ? 1 + 0.12 * Math.exp(-(t - 35.6) * 7) : 1, y: 40 });
      words($('p2sub'), 'Stable value.|Real-world use.', t, 35.8, 38.45, { stagger: 0.07, dy: 20 });
      st($('p2sub'), { y: 60 });
    }
    // P3 global
    if (show($('p3'), t > 38.9 && t < 44.6)) {
      const out = E.inCubic(P(t, 44.0, 44.45));
      const gin = E.outExpo(P(t, 39.2, 40.2));
      const alpha = clamp(gin) * (1 - out);
      drawGlobe(t, alpha);
      st($('globe'), { op: 1, s: 0.85 + 0.15 * gin + out * 0.05 });
      tagEls.forEach((el, i) => {
        const a = 40.2 + i * 0.35, p = E.outBack(P(t, a, a + 0.5));
        st(el, { op: clamp(P(t, a, a + 0.2)) * (1 - out), s: 0.5 + 0.5 * p, y: Math.sin(t * 1.5 + i * 2) * 8 });
      });
      words($('p3foot'), '*Availability and costs depend on the user’s location and the specific service.', t, 41.5, 44.0, { stagger: 0.01, dy: 10, dur: 0.4 });
    }
    // P4 simple
    if (show($('p4'), t > 44.4 && t < 50.2)) {
      const out = E.inCubic(P(t, 49.5, 49.95));
      chipEls.forEach((el, i) => {
        const a = 44.8 + i * 0.1, p = E.outBack(P(t, a, a + 0.45));
        const suck = E.inExpo(P(t, 46.6 + i * 0.05, 47.35 + i * 0.05));
        const r0 = mulberry32(i * 31 + 1); const jx = (r0() - .5), jy = (r0() - .5);
        const cx = 1370 - (CHIPS[i][1] + el.offsetWidth / 2), cy = 540 - (CHIPS[i][2] + el.offsetHeight / 2);
        const chaos = t < 46.6 ? 1 : 1 - suck;
        st(el, {
          op: clamp(P(t, a, a + 0.15)) * (1 - P(t, 47.1 + i * 0.05, 47.4 + i * 0.05)),
          x: cx * suck + Math.sin(t * 3 + i * 1.7) * 14 * chaos + jx * 10, y: cy * suck + Math.cos(t * 2.6 + i) * 12 * chaos + jy * 10,
          r: (jx * 12) * chaos + suck * 90 * (i % 2 ? 1 : -1), s: (0.6 + 0.4 * p) * (1 - suck * 0.8),
        });
      });
      const bin = E.outBack(P(t, 44.9, 45.6));
      const press = t > 47.55 && t < 47.8 ? 0.92 : 1;
      const done = t >= 47.65;
      const pop = done ? 1 + 0.08 * Math.exp(-(t - 47.65) * 8) : 1;
      st($('p4btn'), { op: clamp(P(t, 44.9, 45.2)) * (1 - out), s: (0.7 + 0.3 * bin) * press * pop * (1 + 0.04 * Math.sin(Math.max(0, t - 46.6) * 30) * (t > 46.6 && t < 47.4 ? 1 : 0)) });
      $('p4btn').innerHTML = done ? `<span style="display:flex;align-items:center;gap:16px">${icon('check', 52, '#04140f', 3)}Paid</span>` : 'Pay';
      st($('p4ok'), { op: io(t, 47.85, 0.4, 49.4, 0.4), y: (1 - E.outCubic(P(t, 47.85, 48.3))) * 14 });
      $('p4ok').textContent = 'SIMPLE · TRANSPARENT · RELIABLE';
      $('p4ok').style.width = '600px'; $('p4ok').style.left = '1070px';
    }
  }

  // ===== S6 =====
  if (show($('s6'), t > 49.9 && t < 58.7)) {
    st($('s6lab'), { op: io(t, 50.1, 0.5, 57.9, 0.4) });
    const cards = [$('c1'), $('c2'), $('c3')];
    const fan = E.outExpo(P(t, 50.4, 51.6)), col = E.inCubic(P(t, 52.9, 53.5));
    const fl = Math.sin(t * 1.3);
    [[-1, $('c1')], [0, $('c2')], [1, $('c3')]].forEach(([d, el], i) => {
      const rise = E.outExpo(P(t, 50.35 + i * 0.12, 51.3 + i * 0.12));
      el.style.left = '560px'; el.style.top = '389px';
      st(el, {
        persp: 1800, op: clamp(P(t, 50.35 + i * 0.12, 50.6 + i * 0.12)) * (1 - col),
        x: d * 430 * fan * (1 - col), y: 30 + (1 - rise) * 700 + col * 240 + fl * 6 * (d === 0 ? 1 : -1) + Math.abs(d) * 30 * fan,
        r: d * 9 * fan * (1 - col), ry: d * -18 * fan + fl * 3, rx: 8, s: 0.6 * (1 - col * 0.4) * (d === 0 ? 1.08 : 1),
      });
      const shp = P(t, 51.7 + i * 0.12, 52.6 + i * 0.12);
      el.firstChild.style.background = `linear-gradient(105deg, transparent ${lerp(-40, 110, shp) - 18}%, rgba(255,255,255,.3) ${lerp(-40, 110, shp)}%, transparent ${lerp(-40, 110, shp) + 18}%)`;
    });
    // two worlds
    const out = E.inCubic(P(t, 58.0, 58.45));
    words($('s6t'), t < 53.2 ? 'KAST is more than just a ~payment ~card.' : "It's about connecting ~two ~worlds.", t, t < 53.2 ? 50.2 : 53.6, t < 53.2 ? 53.0 : 58.0, { stagger: 0.07 });
    const lin = E.outExpo(P(t, 54.0, 54.9)), rin = E.outExpo(P(t, 54.15, 55.05));
    st($('s6L'), { op: clamp(P(t, 54.0, 54.3)) * (1 - out), x: (1 - lin) * -300 });
    st($('s6R'), { op: clamp(P(t, 54.15, 54.45)) * (1 - out), x: (1 - rin) * 300 });
    const bp = E.inOutCubic(P(t, 54.8, 55.6));
    $('s6svg').innerHTML = bp > 0 ? `<line x1="630" y1="580" x2="${lerp(630, 1290, bp)}" y2="580" stroke="${MINT}" stroke-width="18" opacity="${.3 * (1 - out)}" style="filter:blur(10px)"/>
      <line x1="630" y1="580" x2="${lerp(630, 1290, bp)}" y2="580" stroke="#bff7e8" stroke-width="4" opacity="${1 - out}"/>` : '';
    const kp = E.outBack(P(t, 55.6, 56.1));
    st($('s6K'), { op: clamp(P(t, 55.6, 55.7)) * (1 - out), s: kp * (1 + 0.03 * Math.sin(t * 3)), r: (1 - kp) * -40 });
  }

  // ===== S7 =====
  if (show($('s7'), t > 58.3)) {
    words($('s7a'), "Crypto adoption won't be measured only", t, 58.6, 61.4, { stagger: 0.06 });
    words($('s7b'), 'by how many people ^own digital assets.', t, 59.2, 61.45, { stagger: 0.06 });
    words($('s7c'), "It's how easily people can|actually ~use ~them.", t, 61.8, 63.75, { stagger: 0.08 });
    st($('s7a'), { y: -50 }); st($('s7b'), { y: 0 });
    st($('s7c'), { y: -80 });
    animLogo(L7, t, 64.3, { conv: 0.6, dist: 380, startScale: 1.9 });
    const fin = E.inCubic(P(t, 69.1, 69.95));
    st($('endLogo'), { op: (t > 63.7 ? 1 : 0) * (1 - fin), y: -40 });
    words($('endLine'), 'Building better ways to use the assets we ~already ~have.', t, 65.1, 69.0, { stagger: 0.05, outDur: 0.6 });
    st($('endLine'), { y: -30 });
    const hp = E.outBack(P(t, 65.9, 66.5));
    st($('endHandle'), { op: clamp(P(t, 65.9, 66.1)) * (1 - fin), s: 0.6 + 0.4 * hp, y: -20 });
    st($('endDisc'), { op: io(t, 66.3, 0.8, 69.0, 0.6) * 0.9 });
  }
  animGrid(G7, t, 63.6, 68.4);

  drawFX(t);
  // global fade in/out
  $('stage').style.opacity = (Math.min(1, t / 0.25) * (1 - P(t, 69.5, 70))).toFixed(3);
}

window.DURATION = DURATION;
window.ready = (async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = r; i.onerror = r; })));
  await Promise.all(['assets/card-penguin.webp', 'assets/card-gold.webp', 'assets/card-infinite.webp'].map(src => new Promise(r => { const i = new Image(); i.onload = r; i.onerror = r; i.src = src; })));
  initLogos();
  G4 = gridLinesFor(L4, 960 - 600, 470 - 150);
  G7 = gridLinesFor(L7, 960 - 450, 400 - 100);
  window.render = render;
  render(0);
  return true;
})();
})();
