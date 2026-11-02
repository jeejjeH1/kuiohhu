/* MAGNITUDE 10.31 — a #ROCKYHalloween short.
   Deterministic, frame-driven: window.render(t) paints the frame at time t (seconds). */
(() => {
const W = 1080, H = 1350, DUR = 30;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');

// ---------------------------------------------------------------- math
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const P = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inCubic: x => x * x * x,
  inOutCubic: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  outBack: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  smooth: x => x * x * (3 - 2 * x),
};
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 57.31), hash(i + 1 + seed * 57.31), u) * 2 - 1;
}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = (c, k = 1, add = [0, 0, 0]) => `rgb(${clamp(c[0] * k + add[0], 0, 255) | 0},${clamp(c[1] * k + add[1], 0, 255) | 0},${clamp(c[2] * k + add[2], 0, 255) | 0})`;
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------------------------------------------------------------- timeline
const TH = [{ t: 3.4, a: .30 }, { t: 6.3, a: .55 }, { t: 7.7, a: .8 }, { t: 11.0, a: 1.0 }];
const T = {
  alarm: 9.6, lampDie: 11.0, paper: 12.0, alarmOff: 13.55, black: 14.0,
  rocky: 15.0, eyes: 15.3, logo: 16.2, seams: 17.0, seamsEnd: 18.7,
  tilt: 20.0, tiltEnd: 21.3, v1: 21.5, v2: 22.35, shake: 23.0, cut01: 23.6,
  sheet: 24.6, end: 27.3,
};
window.TIMELINE = { TH, T, DUR };

// ---------------------------------------------------------------- Seismic logo (extracted facets, 400px source)
const LOGO = [
  { c: '#593d49', p: [[95, 233], [190, 107], [263, 200], [165, 346]] },
  { c: '#746068', p: [[170, 353], [269, 206], [300, 244], [261, 354]] },
  { c: '#6d5760', p: [[198, 49], [275, 84], [265, 192], [195, 100]] },
  { c: '#897981', p: [[280, 108], [300, 234], [271, 199]] },
  { c: '#624a54', p: [[116, 195], [190, 59], [188, 99]] },
];
const LOGO_CX = 197.5, LOGO_CY = 201.5, LOGO_H = 305;
function logoPath(c, f, cx, cy, h) {
  const s = h / LOGO_H;
  c.beginPath();
  f.p.forEach(([x, y], i) => { const X = cx + (x - LOGO_CX) * s, Y = cy + (y - LOGO_CY) * s; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
  c.closePath();
}

// ---------------------------------------------------------------- seismic signal (drives pen, paper, shake)
function chaos(t) { return E.smooth(P(t, 8.7, 9.6)) * (1 - E.smooth(P(t, 11.7, 12.4))); }
function sig(t) {
  let s = 0.035 * Math.sin(t * 29.0) + 0.025 * Math.sin(t * 53.7 + 1.3) + 0.02 * Math.sin(t * 91.1 + .4);
  for (const th of TH) {
    const d = t - th.t;
    if (d > 0 && d < 4) s += th.a * 1.35 * Math.exp(-d * 2.4) * Math.sin(d * 2 * Math.PI * 5.5) * Math.min(1, d / .02);
  }
  const ch = chaos(t) * 1.5;
  if (ch > 0) s += ch * (.55 * Math.sin(t * 71.3) + .45 * Math.sin(t * 127.9 + 2.1) + .35 * Math.sin(t * 43.1 + .7) + .4 * vnoise(t * 40, 3));
  const d = t - (T.shake + 0.05);
  if (d > 0 && d < 1.2) s += 0.16 * Math.exp(-d * 4) * Math.sin(d * 2 * Math.PI * 7);
  return s;
}
function shakeAmt(t) {
  let a = 0;
  for (const th of TH) { const d = t - th.t; if (d > 0) a += th.a * Math.exp(-d * 4.5) * (th.a > .9 ? 46 : 26); }
  return a + chaos(t) * 9;
}
function thumpHop(t, seed) { // candy hop height
  let h = 0;
  for (const th of TH) {
    const d = t - th.t - hash(seed) * 0.04;
    if (d > 0 && d < 1.5) h += th.a * (10 + hash(seed + 3) * 16) * Math.exp(-d * 5) * Math.abs(Math.sin(d * 22));
  }
  return h;
}

// ---------------------------------------------------------------- lights
function lampLevel(t) {
  if (t >= T.lampDie + 0.07) return 0;
  if (t >= T.lampDie) return 2.2;                       // bulb pop flash
  let k = 1;
  const flick = (a, b, rate, p) => { if (t > a && t < b && hash(Math.floor(t * rate) + a * 13) < p) k = .18; };
  flick(6.3, 6.9, 22, .45); flick(7.7, 8.6, 26, .5); flick(9.6, 11, 18, .3);
  return k;
}
function redLevel(t) {
  if (t < T.alarm || t > T.black) return 0;
  let k = 1;
  if (t > T.alarmOff) k = (1 - P(t, T.alarmOff, T.black)) * (hash(Math.floor(t * 30)) < .3 ? .2 : 1);
  return k * (.62 + .38 * Math.abs(Math.sin((t - T.alarm) * Math.PI * 2.4)));
}

// ---------------------------------------------------------------- shared offscreens
const shade = mk(W, H), sctx = shade.getContext('2d');
const glow = mk(W, H), gctx = glow.getContext('2d');
const grains = [];
let sheetMask = null, rows = [], paperTex = null, markImg = null;

// ---------------------------------------------------------------- ROOM
const ROOM = {
  pen: 640, paperL: 255, paperR: 825, paperT: 630, paperB: 772, speed: 60,
};
const candies = [];
const dust = [];
function initRoom() {
  const r = mulberry32(7);
  const cols = ['#d6332f', '#2f8fd6', '#7c3cc4', '#2fae5a', '#f2c230', '#e35d9b'];
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * Math.PI;
    candies.push({
      x: Math.cos(a) * (60 + r() * 30) * (i % 2 ? 1 : .7), y: -Math.sin(a) * 26 - r() * 22 + 10,
      type: i % 3 === 0 ? 'corn' : (i === 7 ? 'pop' : 'wrap'), col: cols[i % cols.length], rot: (r() - .5) * 1.6, s: .9 + r() * .3, seed: i * 7.3,
    });
  }
  candies.sort((a, b) => a.y - b.y);
  for (let i = 0; i < 110; i++) dust.push({ x: r() * W, v: 50 + r() * 120, s: .8 + r() * 2.2, k: Math.floor(r() * 4), d: r() * .9, sw: r() * 6 });
}

function rr(c, x, y, w, h, rad) { c.beginPath(); c.roundRect(x, y, w, h, rad); }

function drawCandy(c, cd, x, y, rot, s) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  if (cd.type === 'corn') {
    c.beginPath(); c.moveTo(-15, 12); c.quadraticCurveTo(0, 16, 15, 12); c.lineTo(2, -20); c.quadraticCurveTo(0, -23, -2, -20); c.closePath();
    c.save(); c.clip();
    c.fillStyle = '#f7f1e3'; c.fillRect(-20, -25, 40, 40);
    c.fillStyle = '#f08a1c'; c.fillRect(-20, -9, 40, 12);
    c.fillStyle = '#f5c518'; c.fillRect(-20, 3, 40, 14);
    c.restore();
    c.strokeStyle = 'rgba(60,30,10,.5)'; c.lineWidth = 1.2; c.stroke();
  } else if (cd.type === 'pop') {
    c.strokeStyle = '#e9e2d2'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(10, 40); c.stroke();
    c.fillStyle = cd.col; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 8, 0, 4.2); c.stroke();
  } else {
    c.fillStyle = cd.col;
    c.beginPath(); c.moveTo(-14, 0); c.lineTo(-26, -9); c.lineTo(-24, 9); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(14, 0); c.lineTo(26, -9); c.lineTo(24, 9); c.closePath(); c.fill();
    c.beginPath(); c.ellipse(0, 0, 16, 11, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(-4, -4, 7, 3.5, -.3, 0, 7); c.fill();
  }
  c.restore();
}

function drawPumpkin(c, cx, cy, rx, ry, faceGlow = 0) {
  // body with ribs
  const g = c.createRadialGradient(cx - rx * .3, cy - ry * .4, 10, cx, cy, rx * 1.1);
  g.addColorStop(0, '#ffa040'); g.addColorStop(.6, '#e8701a'); g.addColorStop(1, '#a8430a');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, 7); c.fill();
  c.strokeStyle = 'rgba(120,45,5,.55)'; c.lineWidth = rx * .025;
  for (const k of [-.62, -.25, .25, .62]) { c.beginPath(); c.ellipse(cx + k * rx * .35, cy, rx * Math.abs(k) * .75 + rx * .12, ry * .98, 0, k < 0 ? Math.PI * .5 : -Math.PI * .5, k < 0 ? Math.PI * 1.5 : Math.PI * .5); c.stroke(); }
  // carved face
  c.fillStyle = faceGlow > 0 ? `rgb(${40 + 215 * faceGlow | 0},${18 + 140 * faceGlow | 0},${8 + 20 * faceGlow | 0})` : '#2a1206';
  const eye = (sx) => { c.beginPath(); c.moveTo(cx + sx * rx * .42, cy - ry * .05); c.lineTo(cx + sx * rx * .12, cy - ry * .05); c.lineTo(cx + sx * rx * .3, cy - ry * .42); c.closePath(); c.fill(); };
  eye(-1); eye(1);
  c.beginPath();
  c.moveTo(cx - rx * .55, cy + ry * .15);
  c.quadraticCurveTo(cx, cy + ry * .75, cx + rx * .55, cy + ry * .15);
  c.lineTo(cx + rx * .4, cy + ry * .3); c.lineTo(cx + rx * .28, cy + ry * .2); c.lineTo(cx + rx * .14, cy + ry * .38);
  c.lineTo(cx, cy + ry * .25); c.lineTo(cx - rx * .14, cy + ry * .38); c.lineTo(cx - rx * .28, cy + ry * .2); c.lineTo(cx - rx * .4, cy + ry * .3);
  c.closePath(); c.fill();
}

function drawRoomScene(t, cam, mode) {
  // mode: 'night' (lamp/red) or 'after' (orange glow from Rocky, no lamp)
  const sh = mode === 'night' ? shakeAmt(t) : 0;
  const shx = vnoise(t * 32, 1) * sh, shy = vnoise(t * 29, 2) * sh;
  const S = cam.s;
  const tx = W / 2 - cam.x * S + shx, ty = H / 2 - cam.y * S + shy;
  const toS = (x, y) => [x * S + tx, y * S + ty];
  const c = ctx;
  c.save(); c.setTransform(S, 0, 0, S, tx, ty);

  // wall
  c.fillStyle = '#272c38'; c.fillRect(-200, -200, 1500, 1100);
  c.fillStyle = 'rgba(0,0,0,.18)';
  for (let x = -180; x < 1300; x += 96) c.fillRect(x, -200, 3, 1100);
  c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(-200, 520, 1500, 6);

  // window with moon
  c.save(); rr(c, 60, 110, 270, 300, 6); c.clip();
  const sky = c.createLinearGradient(0, 110, 0, 410); sky.addColorStop(0, '#0d1638'); sky.addColorStop(1, '#253a6b');
  c.fillStyle = sky; c.fillRect(60, 110, 270, 300);
  const mg = c.createRadialGradient(240, 190, 30, 240, 190, 140); mg.addColorStop(0, 'rgba(240,235,210,.55)'); mg.addColorStop(1, 'rgba(240,235,210,0)');
  c.fillStyle = mg; c.fillRect(60, 110, 270, 300);
  c.fillStyle = '#f2ecd4'; c.beginPath(); c.arc(240, 190, 46, 0, 7); c.fill();
  c.fillStyle = 'rgba(180,170,140,.35)'; [[226, 176, 9], [256, 204, 7], [246, 170, 5], [228, 208, 5]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); });
  // bare branches
  c.strokeStyle = '#05060b'; c.lineCap = 'round';
  const br = (x, y, a, len, w, d) => { if (d > 5 || len < 8) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); br(x2, y2, a - .45 + hash(d * 7 + x) * .2, len * .72, w * .66, d + 1); br(x2, y2, a + .35 + hash(d * 3 + y) * .2, len * .62, w * .6, d + 1); };
  br(50, 395, -1.05, 110, 14, 0);
  // bat crossing
  const bp = P(t, .4, 3.2);
  if (bp > 0 && bp < 1) {
    const bx = lerp(340, 40, bp), by = 240 + Math.sin(bp * 9) * 18 - bp * 40, fl = Math.sin(t * 38) * 10;
    c.fillStyle = '#05060b'; c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx - 14, by - 8 - fl, bx - 26, by - 2 - fl); c.quadraticCurveTo(bx - 14, by + 2, bx, by + 5);
    c.quadraticCurveTo(bx + 14, by + 2, bx + 26, by - 2 - fl); c.quadraticCurveTo(bx + 14, by - 8 - fl, bx, by); c.fill();
  }
  c.restore();
  c.strokeStyle = '#3b2a1e'; c.lineWidth = 14; rr(c, 60, 110, 270, 300, 6); c.stroke();
  c.lineWidth = 8; c.beginPath(); c.moveTo(195, 110); c.lineTo(195, 410); c.moveTo(60, 260); c.lineTo(330, 260); c.stroke();
  c.fillStyle = '#4a3526'; c.fillRect(44, 408, 302, 16);

  // station sign
  const sg = c.createLinearGradient(0, 150, 0, 300); sg.addColorStop(0, '#9aa0a8'); sg.addColorStop(1, '#6d737b');
  c.fillStyle = sg; rr(c, 500, 150, 520, 150, 8); c.fill();
  c.strokeStyle = '#3d4248'; c.lineWidth = 4; rr(c, 512, 162, 496, 126, 4); c.stroke();
  c.fillStyle = '#41464d'; [[522, 172], [998, 172], [522, 278], [998, 278]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); });
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#16181c'; c.font = '700 62px Oswald'; c.letterSpacing = '4px'; c.fillText('SEISMIC STATION', 760, 207);
  c.fillStyle = '#8e1717'; c.font = '34px SpecialElite'; c.letterSpacing = '6px'; c.fillText('— OCT 31 —', 760, 262);
  c.letterSpacing = '0px';

  // wall clock
  const ckx = 935, cky = 440;
  c.fillStyle = '#1a1712'; c.beginPath(); c.arc(ckx, cky, 72, 0, 7); c.fill();
  c.fillStyle = '#e6dfca'; c.beginPath(); c.arc(ckx, cky, 62, 0, 7); c.fill();
  c.strokeStyle = '#2a251c';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.lineWidth = i % 3 ? 2 : 4; c.beginPath(); c.moveTo(ckx + Math.sin(a) * 52, cky - Math.cos(a) * 52); c.lineTo(ckx + Math.sin(a) * 60, cky - Math.cos(a) * 60); c.stroke(); }
  const secT = t < TH[0].t ? Math.floor(t) : Math.floor(TH[0].t);           // the clock stops at the first thump
  const wob = t > TH[0].t ? Math.sin((t - TH[0].t) * 30) * Math.exp(-(t - TH[0].t) * 3) * .12 : 0;
  const sec = 12 + secT, minA = (58 + sec / 60) / 60 * Math.PI * 2, hrA = (11 + 58 / 60) / 12 * Math.PI * 2, sA = sec / 60 * Math.PI * 2 + wob;
  const hand = (a, len, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(ckx, cky); c.lineTo(ckx + Math.sin(a) * len, cky - Math.cos(a) * len); c.stroke(); };
  hand(hrA, 32, 6, '#1a1712'); hand(minA, 48, 4, '#1a1712'); hand(sA, 54, 1.8, '#a31b1b');
  c.fillStyle = '#1a1712'; c.beginPath(); c.arc(ckx, cky, 5, 0, 7); c.fill();

  // desk
  const dg = c.createLinearGradient(0, 860, 0, 1010); dg.addColorStop(0, '#4a3020'); dg.addColorStop(1, '#6b4630');
  c.fillStyle = dg; c.fillRect(-200, 860, 1500, 150);
  c.strokeStyle = 'rgba(30,15,5,.35)'; c.lineWidth = 2;
  for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(-200, 875 + i * 16); c.bezierCurveTo(300, 870 + i * 16 + hash(i) * 10, 700, 880 + i * 16 - hash(i + 4) * 10, 1300, 872 + i * 16); c.stroke(); }
  c.fillStyle = '#7a5238'; c.fillRect(-200, 1008, 1500, 14);
  c.fillStyle = '#21150d'; c.fillRect(-200, 1022, 1500, 600);

  // fallen candy (from thump 2)
  const fc = candies[2];
  const fp = P(t, TH[1].t + .05, TH[1].t + .65);

  // ---- seismograph
  c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(540, 908, 360, 20, 0, 0, 7); c.fill();
  const bg = c.createLinearGradient(0, 600, 0, 905); bg.addColorStop(0, '#454b54'); bg.addColorStop(1, '#23272c');
  c.fillStyle = bg; rr(c, 210, 600, 660, 305, 14); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 3; rr(c, 212, 602, 656, 301, 13); c.stroke();
  c.fillStyle = '#121417'; rr(c, 238, 618, 604, 166, 6); c.fill();
  // paper
  const { paperL: pl, paperR: pr, paperT: pt, paperB: pb, pen, speed } = ROOM;
  c.fillStyle = '#efe7d3'; c.fillRect(pl, pt, pr - pl, pb - pt);
  c.save(); c.beginPath(); c.rect(pl, pt, pr - pl, pb - pt); c.clip();
  c.strokeStyle = 'rgba(80,120,170,.22)'; c.lineWidth = 1;
  for (let y = pt + 7; y < pb; y += 14) { c.beginPath(); c.moveTo(pl, y); c.lineTo(pr, y); c.stroke(); }
  const ph = (t * speed) % 60;
  c.strokeStyle = 'rgba(80,120,170,.32)';
  for (let x = pen - ph - 600; x < pr; x += 60) { c.beginPath(); c.moveTo(x, pt); c.lineTo(x, pb); c.stroke(); }
  const mid = (pt + pb) / 2, amp = 52;
  const penY = (tt) => mid + clamp(sig(tt), -1.3, 1.3) * amp;
  c.strokeStyle = '#1b1d6e'; c.lineWidth = 1.6; c.lineJoin = 'round';
  c.beginPath();
  for (let x = pl - 2; x <= pen; x += 1) { const tt = t - (pen - x) / speed; const y = penY(tt); x === pl - 2 ? c.moveTo(x, y) : c.lineTo(x, y); }
  c.stroke();
  c.restore();
  // rollers
  for (const rx of [232, 824]) { const rg = c.createLinearGradient(rx, 0, rx + 26, 0); rg.addColorStop(0, '#2b2f35'); rg.addColorStop(.5, '#9aa1aa'); rg.addColorStop(1, '#2b2f35'); c.fillStyle = rg; rr(c, rx, 614, 26, 174, 8); c.fill(); }
  // pen arm
  const py = penY(t), pivX = 805, pivY = mid;
  c.strokeStyle = '#b9c0c8'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(pivX, pivY); c.lineTo(pen + 4, py); c.stroke();
  c.strokeStyle = '#6c737b'; c.lineWidth = 2; c.beginPath(); c.moveTo(pivX, pivY + 2); c.lineTo(pen + 4, py + 2); c.stroke();
  c.fillStyle = '#c21d1d'; c.beginPath(); c.arc(pen, py, 6, 0, 7); c.fill();
  const pvg = c.createRadialGradient(pivX - 6, pivY - 6, 2, pivX, pivY, 28); pvg.addColorStop(0, '#aab1ba'); pvg.addColorStop(1, '#2a2e33');
  c.fillStyle = pvg; c.beginPath(); c.arc(pivX, pivY, 26, 0, 7); c.fill();
  // front panel + display
  c.fillStyle = '#1b1e22'; rr(c, 232, 795, 616, 100, 8); c.fill();
  c.fillStyle = '#040605'; rr(c, 250, 806, 470, 80, 6); c.fill();
  drawDisplay(c, t, mode);
  for (const kx of [760, 818]) {
    const kg = c.createRadialGradient(kx - 6, 838, 2, kx, 845, 24); kg.addColorStop(0, '#8d949c'); kg.addColorStop(1, '#1d2125');
    c.fillStyle = kg; c.beginPath(); c.arc(kx, 845, 21, 0, 7); c.fill();
    c.strokeStyle = '#e8e8e8'; c.lineWidth = 3; c.beginPath(); c.moveTo(kx, 845); c.lineTo(kx + Math.cos(kx) * 15, 845 + Math.sin(kx) * 15); c.stroke();
  }
  c.fillStyle = '#8a9099'; c.font = '13px SpecialElite'; c.textAlign = 'center'; c.fillText('STATION 31 · HELICORDER', 790, 882);
  // beacon
  const red = mode === 'night' ? redLevel(t) : 0;
  c.fillStyle = '#2b2f35'; c.fillRect(226, 590, 52, 14);
  const bcol = red > 0 ? `rgb(${120 + 135 * red | 0},${20 + 40 * red | 0},${18 + 20 * red | 0})` : '#4a1111';
  c.fillStyle = bcol; c.beginPath(); c.arc(252, 590, 24, Math.PI, 0); c.fill();
  c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(244, 578, 6, 9, -.5, 0, 7); c.fill();

  // ---- desk lamp
  const L = mode === 'night' ? lampLevel(t) : 0;
  c.fillStyle = '#15171b'; c.beginPath(); c.ellipse(118, 958, 78, 18, 0, 0, 7); c.fill();
  c.strokeStyle = '#2b3036'; c.lineWidth = 12; c.lineCap = 'round';
  c.beginPath(); c.moveTo(118, 950); c.lineTo(150, 720); c.lineTo(255, 560); c.stroke();
  c.fillStyle = '#3a4048'; c.beginPath(); c.arc(150, 720, 10, 0, 7); c.fill();
  c.save(); c.translate(270, 575); c.rotate(.62);
  c.fillStyle = '#1f6b4f'; c.beginPath(); c.moveTo(-28, -30); c.lineTo(28, -30); c.lineTo(62, 40); c.lineTo(-62, 40); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.15)'; c.beginPath(); c.moveTo(-22, -26); c.lineTo(-10, -26); c.lineTo(-30, 36); c.lineTo(-50, 36); c.closePath(); c.fill();
  c.fillStyle = L > 0 ? `rgba(255,${220 + 20 * Math.min(1, L) | 0},170,${Math.min(1, .3 + .7 * L)})` : '#3a3530';
  c.beginPath(); c.ellipse(0, 40, 50, 9, 0, 0, 7); c.fill();
  c.restore();

  // ---- pumpkin candy bowl
  const bx = 930, by = 922;
  drawPumpkin(c, bx, by, 138, 96);
  c.fillStyle = '#3a1806'; c.beginPath(); c.ellipse(bx, by - 78, 96, 20, 0, 0, 7); c.fill();
  candies.forEach((cd, i) => {
    if (i === 2 && fp > 0) return;
    const hop = mode === 'night' ? thumpHop(t, cd.seed) : 0;
    drawCandy(c, cd, bx + cd.x, by - 82 + cd.y - hop, cd.rot + hop * .02 * (i % 2 ? 1 : -1), cd.s);
  });
  if (fp > 0) {
    const x0 = bx + fc.x, y0 = by - 82 + fc.y, x1 = 770, y1 = 975;
    const fx = lerp(x0, x1, fp), fy = lerp(y0, y1, fp) - Math.sin(fp * Math.PI) * 70;
    const land = P(t, TH[1].t + .65, TH[1].t + 1.0);
    drawCandy(c, fc, fx + land * 14, fy - Math.sin(land * Math.PI) * 12, fc.rot + fp * 5 + land * 1.2, fc.s);
  }

  // ---- dust
  c.fillStyle = 'rgba(235,222,200,.8)';
  for (const p of dust) {
    const th = TH[p.k]; if (mode !== 'night') break;
    const d = t - th.t - p.d; if (d < 0 || d > 3.5) continue;
    const y = -60 + d * p.v * (1 + th.a), x = p.x + Math.sin(d * 2 + p.sw) * 12;
    c.globalAlpha = (1 - d / 3.5) * .8 * th.a; c.fillRect(x * 1, y, p.s, p.s);
  }
  c.globalAlpha = 1;
  c.restore();

  // ---- lighting pass (screen space)
  const s = S;
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, W, H);
  sctx.fillStyle = mode === 'night' ? 'rgba(3,4,9,.94)' : 'rgba(3,2,2,.95)';
  sctx.fillRect(0, 0, W, H);
  sctx.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a, mid = .55) => {
    if (a <= 0) return; const [X, Y] = toS(x, y);
    const g = sctx.createRadialGradient(X, Y, 0, X, Y, r * s); g.addColorStop(0, `rgba(0,0,0,${Math.min(1, a)})`); g.addColorStop(mid, `rgba(0,0,0,${Math.min(1, a) * .55})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = g; sctx.fillRect(0, 0, W, H);
  };
  if (mode === 'night') {
    hole(560, 720, 620, .97 * Math.min(1, L));
    hole(560, 300, 620, .55 * Math.min(1, L));
    hole(300, 620, 220, .9 * Math.min(1, L));
    hole(195, 260, 260, .5);
    hole(480, 846, 220, .35);
    if (red > 0) { hole(252, 590, 900, .6 * red, .3); }
    if (L > 1.5) hole(300, 620, 1600, 1);
  } else {
    const og = .75 + .25 * vnoise(t * 7, 9);
    hole(1150, 780, 1200, .97 * og, .45);
    hole(480, 846, 240, .45);
  }
  ctx.drawImage(shade, 0, 0);
  // color tints
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  if (mode === 'night') {
    if (L > 0) { const [X, Y] = toS(500, 700); const g = ctx.createRadialGradient(X, Y, 0, X, Y, 700 * s); g.addColorStop(0, `rgba(255,170,80,${.16 * Math.min(1, L)})`); g.addColorStop(1, 'rgba(255,170,80,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    if (L > 1.5) { ctx.fillStyle = 'rgba(255,240,210,.55)'; ctx.fillRect(0, 0, W, H); }
    if (red > 0) {
      const [X, Y] = toS(252, 590);
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, 1200 * s); g.addColorStop(0, `rgba(255,30,20,${.55 * red})`); g.addColorStop(1, 'rgba(255,30,20,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const cg = ctx.createConicGradient((t - T.alarm) * Math.PI * 2 * 1.1, X, Y);
      cg.addColorStop(0, `rgba(255,40,25,${.45 * red})`); cg.addColorStop(.09, 'rgba(255,40,25,0)'); cg.addColorStop(.5, 'rgba(255,40,25,0)'); cg.addColorStop(.59, `rgba(255,40,25,${.45 * red})`); cg.addColorStop(.6, 'rgba(255,40,25,0)'); cg.addColorStop(1, `rgba(255,40,25,${.45 * red})`);
      ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(255,${120 - 60 * red | 0},${110 - 60 * red | 0},1)`; ctx.fillRect(0, 0, W, H);
    }
  } else {
    const [X, Y] = toS(1250, 760); const g = ctx.createRadialGradient(X, Y, 0, X, Y, 1100 * s);
    g.addColorStop(0, 'rgba(255,120,30,.35)'); g.addColorStop(1, 'rgba(255,120,30,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  // display glow re-draw on top (emissive)
  ctx.save(); ctx.setTransform(S, 0, 0, S, tx, ty); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .55; drawDisplay(ctx, t, mode, true); ctx.restore();
  if (mode === 'night' && red > 0) { // emissive beacon
    ctx.save(); ctx.setTransform(S, 0, 0, S, tx, ty); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(252, 585, 0, 252, 585, 90); g.addColorStop(0, `rgba(255,60,40,${.9 * red})`); g.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = g; ctx.fillRect(150, 480, 200, 220); ctx.restore();
  }
}

function drawDisplay(c, t, mode, emissive = false) {
  let l1 = 'MAGNITUDE', val = '0.00', l2 = 'LISTENING', col = '#3dff8a', blink = 1;
  if (mode === 'after') { val = '0.01'; l2 = 'CANDY DETECTED'; }
  else {
    if (t >= TH[0].t) { val = '2.14'; l2 = 'EVENT'; col = '#9dff3d'; }
    if (t >= TH[1].t) { val = '4.87'; col = '#ffd23d'; }
    if (t >= TH[2].t) { val = '7.62'; col = '#ff9a3d'; l2 = 'STRONG EVENT'; }
    if (t >= 8.9) val = (8 + hash(Math.floor(t * 24)) * 2.2).toFixed(2);
    for (const th of TH) if (t > th.t && t < th.t + .22) val = (hash(Math.floor(t * 40)) * 9.99).toFixed(2);
    if (t >= T.alarm) { val = '10.31'; col = '#ff2e22'; l2 = 'DETECTED'; blink = Math.floor((t - T.alarm) * 4) % 2 ? .25 : 1; }
    if (t > T.alarmOff) blink *= 1 - P(t, T.alarmOff, T.black);
  }
  c.save();
  c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillStyle = col; c.shadowColor = col; c.shadowBlur = emissive ? 18 : 6;
  c.font = '700 30px "JetBrains Mono"'; c.fillText(l1, 268, 832);
  c.font = '700 50px "JetBrains Mono"'; c.textAlign = 'right'; c.fillText(val, 706, 834);
  c.globalAlpha *= blink; c.font = '700 20px "JetBrains Mono"'; c.textAlign = 'left'; c.letterSpacing = '5px';
  c.fillText(l2, 268, 868);
  c.letterSpacing = '0px';
  c.restore();
}

// ---------------------------------------------------------------- HELICORDER SHEET (logo raster)
const SW = 900, SHH = 1200, NROWS = 46, ROW0 = 70, ROWSP = (SHH - 130) / (NROWS - 1);
const SHEET_COLS = ['#1b1b24', '#a2252c', '#203f8c', '#1e6a3b'];
function initSheet() {
  const m = mk(SW, SHH), mc = m.getContext('2d');
  mc.fillStyle = '#000'; mc.fillRect(0, 0, SW, SHH);
  mc.fillStyle = '#fff';
  for (const f of LOGO) { logoPath(mc, f, SW / 2, 625, 860); mc.fill(); }
  const d = mc.getImageData(0, 0, SW, SHH).data;
  const cov = (x, y) => d[((y | 0) * SW + (x | 0)) * 4] / 255;
  for (let r = 0; r < NROWS; r++) {
    const yr = ROW0 + r * ROWSP;
    const amp = new Float32Array(SW), osc = new Float32Array(SW);
    const ph1 = hash(r * 3.1) * 6, ph2 = hash(r * 5.7) * 6, ph3 = hash(r * 9.3) * 6;
    for (let x = 0; x < SW; x++) {
      let a = 0; for (let k = -3; k <= 3; k++) a += cov(x, clamp(yr + k * ROWSP / 7, 0, SHH - 1));
      amp[x] = a / 7;
      osc[x] = clamp(.62 * Math.sin(x * .93 + ph1) + .45 * Math.sin(x * 1.87 + ph2) + .3 * Math.sin(x * .41 + ph3) + .5 * (hash(x * 1.3 + r * 977) - .5), -1, 1);
    }
    // approaching footsteps in the rows above the logo, a tiny candy blip near the end
    const ev = { 0: [[640, .12]], 1: [[260, .22]], 2: [[700, .38]], 3: [[330, .55]], 43: [[520, .08]] }[r] || [];
    for (const [ex, ea] of ev) for (let x = 0; x < SW; x++) { const dx = x - ex; if (dx > 0 && dx < 120) amp[x] = Math.max(amp[x], ea * Math.exp(-dx / 30)); }
    rows.push({ yr, amp, osc, col: SHEET_COLS[r % 4] });
  }
  // paper fibre texture
  paperTex = mk(SW, SHH); const pc = paperTex.getContext('2d');
  pc.fillStyle = '#efe6cf'; pc.fillRect(0, 0, SW, SHH);
  const r = mulberry32(42);
  for (let i = 0; i < 9000; i++) { pc.fillStyle = `rgba(${r() < .5 ? '120,100,70' : '255,255,245'},${r() * .08})`; pc.fillRect(r() * SW, r() * SHH, 1 + r() * 3, 1); }
  const vg = pc.createRadialGradient(SW / 2, SHH / 2, 200, SW / 2, SHH / 2, 900); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(90,60,20,.18)');
  pc.fillStyle = vg; pc.fillRect(0, 0, SW, SHH);
}
function drawSheet(c, seamGlow = 0) {
  c.drawImage(paperTex, 0, 0);
  c.strokeStyle = 'rgba(70,110,160,.18)'; c.lineWidth = 1;
  for (let x = 60; x < SW; x += 60) { c.beginPath(); c.moveTo(x, 40); c.lineTo(x, SHH - 40); c.stroke(); }
  c.fillStyle = '#5b5446'; c.font = '15px SpecialElite'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText('SEISMIC STATION 31  ·  OCT 31  ·  23:00 — 23:59', 40, 32);
  c.textAlign = 'right'; c.fillText('CH: Z   GAIN: 10.31', SW - 40, 32);
  c.font = '11px SpecialElite'; c.textAlign = 'left';
  for (let r = 0; r < NROWS; r += 5) c.fillText(`23:${String(Math.round(r * 59 / NROWS)).padStart(2, '0')}`, 6, rows[r].yr);
  c.lineWidth = 1.15; c.lineJoin = 'round';
  for (const row of rows) {
    c.strokeStyle = row.col; c.beginPath();
    for (let x = 44; x < SW - 20; x++) {
      const y = row.yr + row.amp[x] * row.osc[x] * ROWSP * .62 + Math.sin(x * .7 + row.yr) * .35;
      x === 44 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
  if (seamGlow > 0) { // the seams of the logo glow like Rocky's
    c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = seamGlow * .5;
    c.strokeStyle = '#ff7a18'; c.lineWidth = 9;
    for (const f of LOGO) { logoPath(c, f, SW / 2, 625, 860); c.stroke(); }
    c.restore();
  }
}
function drawSheetScene(t, cam, light) {
  ctx.fillStyle = '#0a0706'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2 + (cam.shx || 0), H / 2 + (cam.shy || 0)); ctx.rotate(cam.r || 0); ctx.scale(cam.s, cam.s); ctx.translate(-cam.x, -cam.y);
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(10, 18, SW, SHH);
  drawSheet(ctx, cam.seam || 0);
  ctx.restore();
  // lighting
  ctx.save();
  if (light.kind === 'red') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${90 + 165 * light.k | 0},${18 + 30 * light.k | 0},${16 + 26 * light.k | 0})`; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    const cg = ctx.createConicGradient(t * 7, -200, -200);
    cg.addColorStop(0, 'rgba(0,0,0,0)'); cg.addColorStop(.12, `rgba(0,0,0,${.45 * light.k})`); cg.addColorStop(.25, 'rgba(0,0,0,0)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);
  } else {
    ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createRadialGradient(W * .85, H * .4, 50, W * .6, H * .5, 1100);
    g.addColorStop(0, '#ffd2a0'); g.addColorStop(.6, '#e09060'); g.addColorStop(1, '#3a1d10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- ROCKY
const RH = 1765;
function rp(x, y) { const h = clamp(-y / RH, 0, 1.15); const sx = 1 - .30 * h; return [x * sx, -RH * (h - .1 * h * h)]; }
const mirror = (p) => p.map(([x, y]) => [-x, y]).reverse();
const BL = [];
function block(p, opt = {}) { BL.push({ p, ...opt }); }
function buildRocky() {
  const brown = ['#7a5240', '#6e4936', '#83594a', '#6a4535', '#77503e'];
  const blue = '#4d5361', dark = '#2a2223';
  const r = mulberry32(31);
  const pick = () => brown[Math.floor(r() * brown.length)];
  const legs = (m) => {
    const f = m ? mirror : (p) => p;
    block(f([[-250, -1010], [-50, -990], [-90, -650], [-280, -630], [-320, -820]]), { c: m ? pick() : blue });
    block(f([[-310, -680], [-80, -690], [-60, -540], [-120, -500], [-320, -510]]), { c: pick() });
    block(f([[-330, -530], [-90, -540], [-110, -200], [-340, -190], [-360, -360]]), { c: pick() });
    block(f([[-480, -210], [-100, -220], [-60, -120], [-70, 0], [-500, 0], [-530, -90]]), { c: pick() });
  };
  legs(false); legs(true);
  block([[-210, -1055], [210, -1055], [170, -920], [0, -890], [-170, -920]], { c: pick() });
  block([[-250, -1135], [250, -1135], [265, -1085], [230, -1040], [-230, -1040], [-265, -1085]], { c: dark, inset: .8 });
  block([[-210, -1270], [210, -1270], [180, -1120], [-180, -1120]], { c: pick() });
  // right arm (viewer's right) hangs and holds the bucket
  block([[360, -1400], [500, -1420], [540, -1160], [400, -1150]], { c: pick() });
  block([[390, -1180], [555, -1190], [570, -1060], [400, -1050]], { c: pick() });
  block([[400, -1070], [570, -1080], [580, -850], [420, -830]], { c: pick() });
  // left arm akimbo
  block([[-500, -1420], [-360, -1400], [-430, -1150], [-570, -1170]], { c: blue });
  block([[-600, -1200], [-440, -1190], [-420, -1080], [-560, -1050], [-620, -1110]], { c: pick() });
  // torso + shoulders + chest plate + head
  block([[-300, -1590], [300, -1590], [345, -1450], [280, -1250], [-280, -1250], [-345, -1450]], { c: pick() });
  block([[-470, -1600], [-320, -1630], [-250, -1540], [-270, -1400], [-420, -1370], [-510, -1470]], { c: pick(), innerC: dark });
  block(mirror([[-470, -1600], [-320, -1630], [-250, -1540], [-270, -1400], [-420, -1370], [-510, -1470]]), { c: pick(), innerC: dark });
  block([[-185, -1545], [185, -1545], [200, -1335], [-200, -1335]], { c: '#1d1819', inset: .9, chest: true });
  block([[-85, -1745], [40, -1765], [95, -1700], [100, -1600], [60, -1555], [-70, -1555], [-105, -1620]], { c: pick(), head: true });
  // forearm + fist (left, on hip) in front of torso
  block([[-560, -1110], [-430, -1120], [-260, -1030], [-300, -950], [-470, -990]], { c: pick() });
  block([[-330, -1060], [-220, -1060], [-190, -960], [-240, -910], [-330, -930]], { c: pick() });
  // right fist (bucket handle passes under it)
  block([[400, -860], [600, -870], [620, -760], [580, -700], [420, -700], [390, -770]], { c: pick(), fistR: true });

  const L = [-.45, -.89];
  for (const b of BL) {
    if (!b.chest && !b.head) { // chip the edges: insert a displaced midpoint on each long edge
      const q = [];
      b.p.forEach((a, i) => { const c2 = b.p[(i + 1) % b.p.length]; q.push(a); const len = Math.hypot(c2[0] - a[0], c2[1] - a[1]);
        if (len > 120) { const t0 = .35 + r() * .3, nx = (c2[1] - a[1]) / len, ny = -(c2[0] - a[0]) / len, d = (r() - .35) * len * .07; q.push([lerp(a[0], c2[0], t0) + nx * d, lerp(a[1], c2[1], t0) + ny * d]); } });
      b.p = q;
    }
    const n = b.p.length;
    let cx = 0, cy = 0; b.p.forEach(([x, y]) => { cx += x; cy += y; }); cx /= n; cy /= n;
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9; b.p.forEach(([x, y]) => { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); });
    const k = b.inset ?? (.6 + r() * .12), ox = -(maxx - minx) * .05, oy = -(maxy - miny) * .07;
    b.inner = b.p.map(([x, y]) => [cx + (x - cx) * k + ox, cy + (y - cy) * k + oy]);
    b.col = hex(b.c); b.icol = hex(b.innerC || b.c);
    b.bev = [];
    for (let i = 0; i < n; i++) {
      const a = b.p[i], c2 = b.p[(i + 1) % n];
      let nx = c2[1] - a[1], ny = -(c2[0] - a[0]); const ln = Math.hypot(nx, ny) || 1; nx /= ln; ny /= ln;
      // ensure outward
      const mx = (a[0] + c2[0]) / 2 - cx, my = (a[1] + c2[1]) / 2 - cy; if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      const d = nx * L[0] + ny * L[1];
      b.bev.push({ i, sh: .62 + .55 * Math.max(0, d) - .18 * Math.max(0, -d) });
    }
    b.h = -cy / RH;
    b.cracks = [];
    if (!b.chest && b.c !== dark && r() < .8) {
      const nc = 1 + (r() < .4 ? 1 : 0);
      for (let k = 0; k < nc; k++) {
        const i = Math.floor(r() * n), a = b.p[i], c2 = b.p[(i + 1) % n], u = .3 + r() * .4;
        let x = lerp(a[0], c2[0], u), y = lerp(a[1], c2[1], u);
        const pts = [[x, y]], tx = lerp(x, cx, .55 + r() * .25), ty = lerp(y, cy, .55 + r() * .25);
        for (let j = 1; j <= 4; j++) { const f = j / 4; pts.push([lerp(x, tx, f) + (r() - .5) * 26, lerp(y, ty, f) + (r() - .5) * 26]); }
        b.cracks.push(pts);
      }
    }
  }
}
function markInit() {
  markImg = mk(400, 400);
  const m = markImg.getContext('2d');
  const cres = (cxA, cxB) => { const o = mk(400, 400), oc = o.getContext('2d'); oc.fillStyle = '#fff'; oc.beginPath(); oc.arc(cxA, 200, 110, 0, 7); oc.fill(); oc.globalCompositeOperation = 'destination-out'; oc.beginPath(); oc.arc(cxB, 200, 112, 0, 7); oc.fill(); return o; };
  m.drawImage(cres(118, 66), 0, 0); m.drawImage(cres(282, 334), 0, 0);
  m.strokeStyle = '#fff'; m.lineWidth = 7; m.lineCap = 'round';
  m.beginPath(); m.arc(120, 200, 128, .95, 1.35); m.stroke();
  m.beginPath(); m.arc(280, 200, 128, Math.PI - 1.35, Math.PI - .95); m.stroke();
  m.beginPath(); m.arc(120, 200, 128, -1.35, -.95); m.stroke();
  m.beginPath(); m.arc(280, 200, 128, Math.PI + .95, Math.PI + 1.35); m.stroke();
}

const embers = [];
function initEmbers() { const r = mulberry32(99); for (let i = 0; i < 90; i++) embers.push({ x: (r() - .5) * 1100, y: -r() * 1700, v: 40 + r() * 90, ph: r() * 6, s: 1.5 + r() * 3, d: r() * 1.5 }); }

function drawBucket(c, X, Y, k, rot, t) {
  c.save(); c.translate(X, Y); c.rotate(rot); c.scale(k, k);
  // handle
  c.strokeStyle = '#141414'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-24, 22); c.quadraticCurveTo(0, -18, 24, 22); c.stroke();
  // candy poking out
  const hop = Math.max(0, Math.sin((t - T.shake) * 26)) * Math.exp(-(t - T.shake) * 3) * (t > T.shake ? 10 : 0);
  c.fillStyle = '#2f8fd6'; c.beginPath(); c.ellipse(-8, 18 - hop, 8, 5.5, .3, 0, 7); c.fill();
  c.fillStyle = '#f5c518'; c.beginPath(); c.moveTo(6, 22 - hop * .7); c.lineTo(14, 6 - hop * .7); c.lineTo(18, 22 - hop * .7); c.fill();
  // body
  const g = c.createLinearGradient(-28, 0, 28, 0); g.addColorStop(0, '#c4500a'); g.addColorStop(.45, '#ff8f2a'); g.addColorStop(1, '#b44508');
  c.fillStyle = g; c.beginPath(); c.moveTo(-28, 22); c.lineTo(28, 22); c.quadraticCurveTo(30, 66, 18, 70); c.lineTo(-18, 70); c.quadraticCurveTo(-30, 66, -28, 22); c.fill();
  c.fillStyle = '#d0600f'; c.beginPath(); c.ellipse(0, 22, 28, 6, 0, 0, 7); c.fill();
  c.fillStyle = '#331300'; c.beginPath(); c.ellipse(0, 22, 23, 4, 0, 0, 7); c.fill();
  // face
  c.fillStyle = '#2a0f02';
  c.beginPath(); c.moveTo(-15, 40); c.lineTo(-5, 40); c.lineTo(-10, 32); c.fill();
  c.beginPath(); c.moveTo(15, 40); c.lineTo(5, 40); c.lineTo(10, 32); c.fill();
  c.beginPath(); c.moveTo(-16, 48); c.quadraticCurveTo(0, 64, 16, 48); c.lineTo(9, 52); c.lineTo(4, 49); c.lineTo(0, 54); c.lineTo(-4, 49); c.lineTo(-9, 52); c.closePath(); c.fill();
  c.restore();
}

function drawRockyScene(t, cam) {
  const c = ctx;
  const S = cam.s;
  const sh = cam.shake || 0;
  const tx = W / 2 - cam.x * S + vnoise(t * 25, 4) * sh, ty = H / 2 - cam.y * S + vnoise(t * 23, 5) * sh;
  const tf = (x, y) => { const [a, b] = rp(x, y); return [a * S + tx, b * S + ty]; };

  const eyes = t < T.eyes ? 0 : (t < T.eyes + .25 ? (hash(Math.floor(t * 40)) > .4 ? 1 : .15) : 1);
  const logoOn = E.outCubic(P(t, T.logo, T.logo + .5)) * (t < T.logo + .12 ? (hash(Math.floor(t * 50) + 3) > .5 ? 1 : .3) : 1);
  const seamP = P(t, T.seams, T.seamsEnd);
  const flick = .86 + .14 * vnoise(t * 9, 6);
  const glowAll = E.smooth(P(t, T.seams, T.seams + .6)) * flick;
  const lit = .05 + .5 * E.smooth(seamP);
  const door = .12 + .88 * E.smooth(P(t, T.logo - .4, T.seams + .4));

  // background: doorway light behind him + fog
  c.fillStyle = '#030305'; c.fillRect(0, 0, W, H);
  const [dx0, dy0] = [tx - 520 * S * .8, ty - 2300 * S * .8];
  const dg = c.createLinearGradient(0, dy0, 0, ty);
  dg.addColorStop(0, `rgba(40,55,85,${.25 * door})`); dg.addColorStop(.7, `rgba(70,90,125,${.55 * door})`); dg.addColorStop(1, `rgba(110,125,150,${.75 * door})`);
  c.fillStyle = dg; c.fillRect(dx0, dy0, 1040 * S * .8, ty - dy0 + 40 * S);
  c.strokeStyle = '#020203'; c.lineWidth = 40 * S; c.strokeRect(dx0, dy0, 1040 * S * .8, ty - dy0 + 200 * S);
  // fog
  for (let i = 0; i < 6; i++) {
    const fx = W * (hash(i * 3) * 1.4 - .2) + Math.sin(t * .3 + i) * 80, fy = ty - 200 * S - i * 120 * S;
    const g = c.createRadialGradient(fx, fy, 0, fx, fy, 420 * S);
    g.addColorStop(0, `rgba(120,135,160,${.10 * door})`); g.addColorStop(1, 'rgba(120,135,160,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  // floor
  const fg = c.createLinearGradient(0, ty - 40 * S, 0, ty + 300 * S); fg.addColorStop(0, '#0d0e12'); fg.addColorStop(1, '#030304');
  c.fillStyle = fg; c.fillRect(0, ty - 20 * S, W, H);

  // body blocks
  gctx.clearRect(0, 0, W, H);
  const orange = [255, 110, 25];
  let fistPos = null;
  for (const b of BL) {
    if (b.fistR) {
      // bucket hangs from right fist; drawn before the fist so the fist overlaps the handle
      const [hx, hy] = tf(505, -722);
      const sw = t > T.shake ? .38 * Math.sin((t - T.shake) * 2 * Math.PI * 3.6) * Math.exp(-(t - T.shake) * 1.6) : Math.sin(t * 1.3) * .03;
      const lift = t > T.shake ? Math.abs(Math.sin((t - T.shake) * 2 * Math.PI * 3.6)) * Math.exp(-(t - T.shake) * 1.6) * 8 * S : 0;
      drawBucket(c, hx, hy - lift, S * 1.2, sw, t);
      fistPos = [hx, hy];
    }
    const outer = b.p.map(([x, y]) => tf(x, y)), inner = b.inner.map(([x, y]) => tf(x, y));
    const n = outer.length;
    const rev = clamp((seamP * 1.25 * 1.0 - b.h) / .18);
    const tint = [orange[0] * .2 * glowAll * rev, orange[1] * .14 * glowAll * rev, orange[2] * .06 * glowAll * rev];
    // bevel faces
    for (const bv of b.bev) {
      const i = bv.i, j = (i + 1) % n;
      c.fillStyle = rgb(b.col, bv.sh * lit, tint);
      c.beginPath(); c.moveTo(...outer[i]); c.lineTo(...outer[j]); c.lineTo(...inner[j]); c.lineTo(...inner[i]); c.closePath(); c.fill();
    }
    c.fillStyle = rgb(b.icol, .92 * lit, tint);
    c.beginPath(); inner.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.fill();
    // outlines
    c.strokeStyle = '#0b0807'; c.lineJoin = 'round';
    c.lineWidth = 3.2 * S; c.beginPath(); outer.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.stroke();
    c.lineWidth = 1.8 * S; c.beginPath(); inner.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath();
    for (let i = 0; i < n; i++) { c.moveTo(...outer[i]); c.lineTo(...inner[i]); }
    c.stroke();
    c.strokeStyle = '#0b0807'; c.lineWidth = 2.2 * S; c.lineCap = 'round';
    for (const cr of b.cracks) { c.beginPath(); cr.forEach(([x, y], i) => { const q = tf(x, y); i ? c.lineTo(...q) : c.moveTo(...q); }); c.stroke(); }
    // rim light from the doorway
    c.strokeStyle = `rgba(150,175,215,${.16 * door * (1 - .6 * glowAll)})`; c.lineWidth = 1.5 * S;
    c.beginPath(); outer.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.stroke();
    // seam glow → glow buffer
    if (rev > 0 && glowAll > 0 && !b.chest) {
      gctx.lineJoin = 'round'; gctx.lineCap = 'round';
      gctx.strokeStyle = `rgba(255,${95 + 35 * flick | 0},20,${rev * glowAll})`;
      gctx.lineWidth = 6 * S; gctx.beginPath(); outer.forEach((p, i) => i ? gctx.lineTo(...p) : gctx.moveTo(...p)); gctx.closePath(); gctx.stroke();
      gctx.lineWidth = 3.2 * S;
      for (const cr of b.cracks) { gctx.beginPath(); cr.forEach(([x, y], i) => { const q = tf(x, y); i ? gctx.lineTo(...q) : gctx.moveTo(...q); }); gctx.stroke(); }
      gctx.strokeStyle = `rgba(255,90,20,${.16 * rev * glowAll})`; gctx.lineWidth = 2 * S; gctx.beginPath();
      for (let i = 0; i < n; i++) { gctx.moveTo(...outer[i]); gctx.lineTo(...inner[i]); }
      gctx.stroke();
    }
    if (b.chest) {
      const [mx, my] = tf(0, -1440), [, my2] = tf(0, -1520);
      const ms = (my - my2) * 2 / 230;
      c.save(); c.globalAlpha = .12 + .88 * logoOn;
      c.drawImage(markImg, mx - 200 * ms, my - 200 * ms, 400 * ms, 400 * ms); c.restore();
      if (logoOn > 0) { gctx.save(); gctx.globalAlpha = logoOn * .8; gctx.drawImage(markImg, mx - 200 * ms, my - 200 * ms, 400 * ms, 400 * ms); gctx.restore(); }
    }
    if (b.head) {
      // brow + eyes
      const eyeP = (sx) => [[-72 * sx, -1652], [-18 * sx, -1626], [-22 * sx, -1611], [-66 * sx, -1622]].map(([x, y]) => tf(x, y));
      for (const sx of [1, -1]) {
        const ep = eyeP(sx);
        c.fillStyle = `rgba(255,255,255,${eyes})`; c.beginPath(); ep.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.fill();
        if (eyes > 0) { gctx.fillStyle = `rgba(230,240,255,${eyes})`; gctx.beginPath(); ep.forEach((p, i) => i ? gctx.lineTo(...p) : gctx.moveTo(...p)); gctx.closePath(); gctx.fill(); }
        const bw = [[-88 * sx, -1668], [-12 * sx, -1634]].map(([x, y]) => tf(x, y));
        c.strokeStyle = '#0b0807'; c.lineWidth = 6 * S; c.beginPath(); c.moveTo(...bw[0]); c.lineTo(...bw[1]); c.stroke();
      }
    }
  }
  // composite glow
  c.save(); c.globalCompositeOperation = 'lighter';
  c.filter = `blur(${30 * S}px)`; c.globalAlpha = 1; c.drawImage(glow, 0, 0); c.drawImage(glow, 0, 0);
  c.filter = `blur(${7 * S}px)`; c.globalAlpha = 1; c.drawImage(glow, 0, 0);
  c.filter = 'none'; c.drawImage(glow, 0, 0);
  c.restore();
  // hot core of seams
  if (glowAll > 0) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(255,210,120,${.6 * glowAll})`; c.lineWidth = 1.1 * S; c.lineJoin = 'round'; c.lineCap = 'round';
    for (const b of BL) {
      if (b.chest) continue;
      const rev = clamp((seamP * 1.25 - b.h) / .18); if (rev <= 0) continue;
      c.globalAlpha = rev; const outer = b.p.map(([x, y]) => tf(x, y));
      c.beginPath(); outer.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath();
      for (const cr of b.cracks) cr.forEach(([x, y], i) => { const q = tf(x, y); i ? c.lineTo(...q) : c.moveTo(...q); });
      c.stroke();
    }
    c.restore();
  }
  // embers
  if (glowAll > 0) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const e of embers) {
      const d = ((t - T.seams - e.d) * e.v) ; if (d < 0) continue;
      const y = e.y - d * 1.0, x = e.x + Math.sin(t * 1.5 + e.ph) * 30;
      const [X, Y] = tf(x, y);
      const a = glowAll * (.5 + .5 * Math.sin(t * 8 + e.ph)) * clamp(1 - d / 900);
      if (a <= 0) continue;
      c.fillStyle = `rgba(255,${140 + 60 * Math.sin(e.ph) | 0},40,${a})`; c.beginPath(); c.arc(X, Y, e.s * S, 0, 7); c.fill();
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- overlays
function grainAndVignette(t, k = 1) {
  const g = grains[Math.floor(t * 24) % grains.length];
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = .35 * k; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g, 0, 0, W, H); ctx.restore();
  const vg = ctx.createRadialGradient(W / 2, H * .48, H * .3, W / 2, H / 2, H * .82);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${.6 * k})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}
function subtitle(text, a, y = 1165) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '104px Creepster'; ctx.letterSpacing = '3px';
  ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(10,4,2,.9)'; ctx.strokeText(text, W / 2, y);
  ctx.shadowColor = 'rgba(255,110,20,.9)'; ctx.shadowBlur = 30;
  ctx.fillStyle = '#ff8a1f'; ctx.fillText(text, W / 2, y);
  ctx.restore();
}

function drawEnd(t) {
  const u = t - T.end;
  ctx.fillStyle = '#060508'; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W / 2, 470, 20, W / 2, 520, 760);
  bg.addColorStop(0, `rgba(255,110,25,${.22 * E.smooth(P(u, 0, .8))})`); bg.addColorStop(1, 'rgba(255,110,25,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // logo with igniting seams
  const lp = E.outCubic(P(u, .05, .7)), ign = E.smooth(P(u, .35, .95)) * (.88 + .12 * vnoise(t * 9, 2));
  ctx.save(); ctx.globalAlpha = lp; ctx.translate(0, (1 - lp) * 30);
  gctx.clearRect(0, 0, W, H);
  gctx.strokeStyle = '#ff7a18'; gctx.lineWidth = 9; gctx.lineJoin = 'round';
  for (const f of LOGO) { logoPath(gctx, f, W / 2, 420, 380); gctx.stroke(); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = lp * ign;
  ctx.filter = 'blur(22px)'; ctx.drawImage(glow, 0, 0); ctx.filter = 'blur(6px)'; ctx.drawImage(glow, 0, 0); ctx.filter = 'none'; ctx.drawImage(glow, 0, 0);
  ctx.restore();
  for (const f of LOGO) { logoPath(ctx, f, W / 2, 420, 380); ctx.fillStyle = rgb(hex(f.c), .55 + .25 * ign); ctx.fill(); }
  ctx.restore();
  // title
  const tp = E.outCubic(P(u, .55, 1.15));
  ctx.save(); ctx.globalAlpha = tp; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 118px Oswald'; ctx.letterSpacing = '6px';
  ctx.shadowColor = 'rgba(255,60,30,.8)'; ctx.shadowBlur = 34; ctx.fillStyle = '#f6f0e6';
  ctx.fillText('MAGNITUDE 10.31', W / 2, 760 + (1 - tp) * 20);
  ctx.restore();
  const hp = E.outBack(P(u, 1.0, 1.5));
  ctx.save(); ctx.globalAlpha = clamp(hp); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.translate(W / 2, 880); ctx.scale(.8 + .2 * hp, .8 + .2 * hp);
  ctx.font = '86px Creepster'; ctx.letterSpacing = '2px'; ctx.shadowColor = 'rgba(255,110,20,.9)'; ctx.shadowBlur = 26; ctx.fillStyle = '#ff8a1f';
  ctx.fillText('#ROCKYHalloween', 0, 0);
  ctx.restore();
  // receding footsteps on a live trace
  const lp2 = E.smooth(P(u, .9, 1.4));
  ctx.save(); ctx.globalAlpha = lp2; ctx.strokeStyle = 'rgba(255,140,60,.85)'; ctx.lineWidth = 2.2; ctx.beginPath();
  const steps = [[T.end + 1.1, .9], [T.end + 1.75, .5], [T.end + 2.3, .26]];
  for (let x = 110; x <= 970; x += 1.5) {
    const tt = t - (970 - x) / 260;
    let s = .02 * Math.sin(tt * 60);
    for (const [st, a] of steps) { const d = tt - st; if (d > 0 && d < 1.5) s += a * Math.exp(-d * 4) * Math.sin(d * 2 * Math.PI * 7); }
    const y = 1035 + s * 55; x === 110 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = '#8b8378'; ctx.font = '26px SpecialElite'; ctx.textAlign = 'center'; ctx.letterSpacing = '4px';
  ctx.fillText('SEISMIC STATION  —  OCT 31  —  23:59', W / 2, 1170);
  ctx.restore();
}

// ---------------------------------------------------------------- main render
function render(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

  if (t < T.paper) {
    // scenes 1–4: the station
    let cam;
    if (t < 7.7) { const p = E.smooth(P(t, 0, 7.7)); cam = { x: lerp(540, 548, p), y: lerp(700, 735, p), s: lerp(1.12, 1.22, p) }; }
    else if (t < T.alarm) { const p = P(t, 7.7, T.alarm); cam = { x: lerp(585, 600, p), y: 705, s: lerp(2.25, 2.45, p) }; }
    else if (t < 10.75) { const p = P(t, T.alarm, 10.75); cam = { x: 486, y: 846, s: lerp(2.0, 2.18, E.outCubic(p)) }; }
    else { const p = P(t, 10.75, T.paper); cam = { x: 540, y: 700, s: lerp(1.08, 1.02, p) }; }
    drawRoomScene(t, cam, 'night');
    grainAndVignette(t);
    const fin = E.smooth(P(t, 0, .7)); if (fin < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - fin})`; ctx.fillRect(0, 0, W, H); }
  } else if (t < T.black) {
    // scene 5: paper spits out under the red alarm (only chaos, no logo readable)
    const p = E.outCubic(P(t, T.paper, T.paper + .5));
    const sh = 10 * (1 - P(t, T.paper, 13.2));
    const cam = { x: 250, y: lerp(980, 700, p), s: 2.7, r: -.06, shx: vnoise(t * 30, 7) * sh, shy: vnoise(t * 27, 8) * sh };
    drawSheetScene(t, cam, { kind: 'red', k: redLevel(t) });
    grainAndVignette(t);
    const k = redLevel(t); ctx.fillStyle = `rgba(0,0,0,${t > T.alarmOff ? 1 - k * .9 : 0})`; ctx.fillRect(0, 0, W, H);
  } else if (t < T.rocky) {
    // scene 6: silence
  } else if (t < T.cut01) {
    // scenes 7–8: Rocky
    let cam;
    const pin = P(t, T.rocky, T.tilt);
    const base = { x: 0, y: lerp(-1115, -1150, pin), s: lerp(1.07, 1.16, pin) };
    const tp = E.inOutCubic(P(t, T.tilt, T.tiltEnd));
    const tgt = { x: 370, y: -790, s: 1.6 };
    cam = { x: lerp(base.x, tgt.x, tp), y: lerp(base.y, tgt.y, tp), s: lerp(base.s, tgt.s, tp) };
    if (t > T.tiltEnd) { const q = P(t, T.tiltEnd, T.cut01); cam.s = lerp(1.6, 1.7, q); cam.y = lerp(-790, -780, q); }
    cam.shake = (t > T.seams && t < T.seamsEnd + .4 ? 5 * Math.sin(P(t, T.seams, T.seamsEnd + .4) * Math.PI) : 0) + (t > T.shake ? 4 * Math.exp(-(t - T.shake) * 2) : 0);
    drawRockyScene(t, cam);
    grainAndVignette(t, .9);
    subtitle('Trick…', E.outCubic(P(t, T.v1, T.v1 + .25)) * (1 - P(t, T.v2 - .05, T.v2 + .1)), 1150);
    subtitle('…or treat.', E.outCubic(P(t, T.v2, T.v2 + .25)) * (1 - P(t, T.cut01 - .2, T.cut01)), 1150);
  } else if (t < T.sheet) {
    // 0.01 — candy detected
    const p = P(t, T.cut01, T.sheet);
    drawRoomScene(t, { x: lerp(500, 495, p), y: lerp(790, 800, p), s: lerp(1.75, 1.85, p) }, 'after');
    grainAndVignette(t);
  } else if (t < T.end) {
    // scene 9: the reveal — pull back from the paper
    const p = E.inOutCubic(P(t, T.sheet + .15, 26.5));
    const cam = { x: lerp(300, SW / 2, p), y: lerp(560, SHH / 2 + 5, p), s: lerp(3.3, 1.08, p), r: lerp(-.06, -.015, p), seam: E.smooth(P(t, 26.2, 26.9)) * (.85 + .15 * vnoise(t * 9, 3)) };
    drawSheetScene(t, cam, { kind: 'orange' });
    grainAndVignette(t, .8);
    const fo = P(t, T.end - .3, T.end); if (fo > 0) { ctx.fillStyle = `rgba(0,0,0,${fo})`; ctx.fillRect(0, 0, W, H); }
  } else {
    drawEnd(t);
    grainAndVignette(t, .7);
    const fo = P(t, DUR - .45, DUR); if (fo > 0) { ctx.fillStyle = `rgba(0,0,0,${fo})`; ctx.fillRect(0, 0, W, H); }
  }
}

// ---------------------------------------------------------------- init
function init() {
  const r = mulberry32(5);
  for (let i = 0; i < 6; i++) {
    const g = mk(360, 450), gc = g.getContext('2d'), id = gc.createImageData(360, 450);
    for (let j = 0; j < id.data.length; j += 4) { const v = 128 + (r() - .5) * 120; id.data[j] = id.data[j + 1] = id.data[j + 2] = v; id.data[j + 3] = 255; }
    gc.putImageData(id, 0, 0); grains.push(g);
  }
  initRoom(); initSheet(); buildRocky(); markInit(); initEmbers();
}
window.render = render;
window.ready = Promise.all([
  document.fonts.load('40px Creepster'), document.fonts.load('40px SpecialElite'), document.fonts.load('700 40px Oswald'), document.fonts.load('700 40px "JetBrains Mono"'),
]).then(() => { init(); render(0); });
})();
