/* PrismaX motion piece — deterministic, frame-driven timeline.
   window.render(t) paints the frame at time t (seconds). */
import * as S3 from './scene3d.js';

const W = 1920, H = 1080;
const $ = id => document.getElementById(id);
const loadJSON = u => { const x = new XMLHttpRequest(); x.open('GET', u, false); x.send(); return JSON.parse(x.responseText); };   // file:// has no fetch
const TL = loadJSON('timeline.json');
const WORDS = loadJSON('vo/words.json');
const VO = TL.vo, DUR = TL.duration, FPS = TL.fps;
const GOLD = '#B9986A', BRONZE = '#B56654', BROWN = '#7A6B5A', CREAM = '#DFD8D0', BLACK = '#202020';

// ---------- math ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const P = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  outCubic: x => 1 - Math.pow(1 - x, 3), inCubic: x => x * x * x, outQuint: x => 1 - Math.pow(1 - x, 5),
  inOut: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x), inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  outBack: x => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
};
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const io = (t, a, di, b, dout) => E.outCubic(P(t, a, a + di)) * (1 - E.inCubic(P(t, b, b + dout)));
const w = (id, i) => VO[id] + WORDS[id][Math.min(i, WORDS[id].length - 1)].s;   // absolute time of word i of a VO line
const fmt = n => Math.floor(n).toLocaleString('en-US');

// ---------- DOM helpers ----------
function st(el, o) {
  if (o.op !== undefined) { el.style.opacity = o.op.toFixed(3); el.style.visibility = o.op <= .002 ? 'hidden' : 'visible'; }
  let tr = el.classList.contains('center') ? 'translate(-50%,-50%) ' : '';
  tr += `translate(${(o.x || 0).toFixed(2)}px,${(o.y || 0).toFixed(2)}px) `;
  if (o.r) tr += `rotate(${o.r.toFixed(3)}deg) `;
  tr += `scale(${(o.s ?? 1).toFixed(4)})`;
  el.style.transform = tr;
  if (o.blur !== undefined) el.style.filter = o.blur > .15 ? `blur(${o.blur.toFixed(2)}px)` : 'none';
}
const vis = (el, on) => { el.style.display = on ? '' : 'none'; return on; };
const norm = s => s.toLowerCase().replace(/[^a-z0-9']/g, '');

// tokens: ~gold italic, !bronze italic, *italic, ^muted; "|" = line break; "word@3" pins the token to VO word 3
function setWords(el, text) {
  if (el._text === text) return el._spans;
  el._text = text; el.innerHTML = ''; el._times = null;
  const spans = [];
  text.split('|').forEach((line, li) => {
    if (li > 0) el.appendChild(document.createElement('br'));
    const toks = line.split(' ').filter(Boolean);
    toks.forEach((tok, i) => {
      const s = document.createElement('span'); s.className = 'word';
      let x = tok;
      const cls = { '~': 'w-gold', '!': 'w-bronze', '*': 'w-it', '^': 'w-muted' };
      while (cls[x[0]]) { s.classList.add(cls[x[0]]); x = x.slice(1); }
      const m = x.match(/@(\d+)$/); if (m) { s._pin = +m[1]; x = x.slice(0, m.index); }
      s.textContent = x + (i < toks.length - 1 ? ' ' : '');
      s._norm = norm(x);
      el.appendChild(s); spans.push(s);
    });
  });
  el._spans = spans; return spans;
}
function syncTimes(spans, id) {   // match tokens to whisper words in order
  const ws = WORDS[id]; let k = 0, last = VO[id];
  return spans.map(s => {
    if (s._pin !== undefined) { k = s._pin + 1; return last = VO[id] + ws[s._pin].s; }
    for (let j = k; j < ws.length; j++) if (norm(ws[j].w) === s._norm) { k = j + 1; return last = VO[id] + ws[j].s; }
    return last = last + .1;
  });
}
// reveal words: start = number (stagger) or VO id (synced)
function words(el, text, t, start, tout, o = {}) {
  const spans = setWords(el, text);
  if (!el._times) el._times = typeof start === 'string' ? syncTimes(spans, start) : spans.map((s, i) => start + i * (o.stagger ?? .08));
  const T = el._times, dur = o.dur ?? .6, od = o.outDur ?? .45, dy = o.dy ?? 40;
  if (t < T[0] - .05 || t > tout + od + spans.length * .03 + .05) { el.style.visibility = 'hidden'; return; }
  el.style.visibility = 'visible'; el.style.opacity = 1;
  spans.forEach((s, i) => {
    const p = E.outQuint(P(t, T[i] - .04, T[i] - .04 + dur));
    const q = E.inCubic(P(t, tout + i * .03, tout + i * .03 + od));
    const blur = (1 - p) * 16 + q * 18;
    s.style.opacity = (p * (1 - q)).toFixed(3);
    s.style.transform = `translateY(${((1 - p) * dy - q * 30).toFixed(2)}px)`;
    s.style.filter = blur > .2 ? `blur(${blur.toFixed(2)}px)` : 'none';
  });
}
function hideWords(el) { el.style.visibility = 'hidden'; }

// ---------- logo ----------
function logoSVG(id, c = '#fff') {
  return `<svg viewBox="${LOGO.vb}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="sw_${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="600" y2="0">
      <stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset=".5" stop-color="${c}" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
    <path fill="currentColor" fill-rule="evenodd" d="${LOGO.word}"/><path fill="currentColor" d="${LOGO.x}"/>
    <g class="sweep" style="mix-blend-mode:normal"><path fill="url(#sw_${id})" fill-rule="evenodd" d="${LOGO.word}"/><path fill="url(#sw_${id})" d="${LOGO.x}"/></g>
  </svg>`;
}
$('logoBig').innerHTML = logoSVG('big');
$('logoSmall').innerHTML = logoSVG('small', GOLD);
$('endLogo').innerHTML = logoSVG('end', GOLD);
function sweep(id, p) {   // p 0..1 moves highlight across the wordmark
  const g = document.getElementById('sw_' + id);
  const x = lerp(-700, 3100, p);
  g.setAttribute('x1', x); g.setAttribute('x2', x + 600);
}

// ---------- static builds ----------
const rndB = mulberry32(42);
// object tags in the quality scene
const OBJ_NAMES = ['Cylinder', 'Sphere', 'Ring', 'Cone', 'Block'];
OBJ_NAMES.forEach((n, i) => { const d = document.createElement('div'); d.className = 'tag light'; d.id = 'ot' + i; d.style.color = BROWN; d.style.fontSize = '12px'; d.style.padding = '6px 10px 5px'; d.textContent = n; $('gObjTags').appendChild(d); });
const SKILLS = ['Grasp', 'Stack', 'Sort', 'Pour', 'Fold', 'Open', 'Insert', 'Wipe'];
SKILLS.forEach((n, i) => { const d = document.createElement('div'); d.className = 'chip'; d.id = 'chip' + i; d.innerHTML = `<span style="font-family:'IBM Plex Mono';font-size:14px;color:${GOLD};margin-right:14px;letter-spacing:.1em">0${i + 1}</span>${n}`; $('chips').appendChild(d); });
// pipeline cards
const CARD_N = 16, ACCEPT = [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0];
const SCORES = ACCEPT.map((a, i) => a ? (0.86 + rndB() * .13).toFixed(2) : (0.18 + rndB() * .3).toFixed(2));
function trajSVG(r, good, w0 = 210, h0 = 138) {
  let x = 22, y = h0 * (.35 + r() * .3), d = `M${x} ${y.toFixed(1)}`;
  const pts = [];
  for (let k = 0; k < 4; k++) {
    const nx = 22 + (w0 - 44) * (k + 1) / 4, ny = good ? h0 * (.25 + r() * .4) : h0 * (.1 + r() * .7);
    const c1x = x + (nx - x) * .5, c1y = good ? y : y + (r() - .5) * 80;
    d += ` Q${c1x.toFixed(1)} ${c1y.toFixed(1)} ${nx.toFixed(1)} ${ny.toFixed(1)}`;
    if (!good) d += ` l${((r() - .5) * 14).toFixed(1)} ${((r() - .5) * 18).toFixed(1)}`;
    x = nx; y = ny; pts.push([x, y]);
  }
  const col = good ? GOLD : BRONZE;
  return `<svg width="${w0}" height="${h0}"><path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" ${good ? '' : 'stroke-dasharray="1 0"'}/>
    ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${col}"/>`).join('')}
    <circle cx="22" cy="${(h0 * .5).toFixed(0)}" r="0" /></svg>`;
}
for (let i = 0; i < CARD_N; i++) {
  const d = document.createElement('div'); d.className = 'card'; d.id = 'card' + i;
  d.innerHTML = trajSVG(mulberry32(100 + i), ACCEPT[i]) + `<div class="ep">EP ${String(4120 + i * 37).padStart(5, '0')}</div><div class="score" style="opacity:0"></div>`;
  $('cards').appendChild(d);
}
$('lone').innerHTML = trajSVG(mulberry32(5), 1) + `<div class="ep">EP 04120</div><div class="score" style="background:${GOLD}">Q 0.97 ✓</div>`;
// balance minis
const MINI_C = 12, MINI_R = 6;
const SHAPES = [['50%', GOLD], ['3px', BRONZE], ['50% 50% 3px 3px', BROWN], ['0', BLACK], ['50%', BRONZE], ['3px', GOLD], ['2px 12px', BLACK], ['50%', BROWN]];
const MINI_SK = ['Grasp', 'Pour', 'Fold', 'Stack', 'Open', 'Sort', 'Wipe', 'Insert', 'Push', 'Hand-over', 'Turn', 'Hang'];
for (let i = 0; i < MINI_C * MINI_R; i++) {
  const d = document.createElement('div'); d.className = 'mini'; d.id = 'mini' + i;
  d.innerHTML = `<i></i><span></span>`; $('minis').appendChild(d);
}
// r3 chart
$('r3chart').innerHTML = `
  <line x1="0" y1="220" x2="800" y2="220" stroke="#DFD8D0" stroke-opacity=".3"/>
  <path id="cData" d="M0 220 C 300 218, 520 170, 800 10" fill="none" stroke="${BROWN}" stroke-width="2.5"/>
  <path id="cLearn" d="M0 220 C 120 150, 240 128, 400 124 S 700 122, 800 121" fill="none" stroke="${GOLD}" stroke-width="2.5"/>
  <text id="lData" x="806" y="14" fill="${BROWN}" font-family="IBM Plex Mono" font-size="14" letter-spacing="3">DATA</text>
  <text id="lLearn" x="806" y="126" fill="${GOLD}" font-family="IBM Plex Mono" font-size="14" letter-spacing="3">LEARNING</text>`;
const cData = $('cData'), cLearn = $('cLearn');
const lenData = cData.getTotalLength(), lenLearn = cLearn.getTotalLength();
cData.style.strokeDasharray = lenData; cLearn.style.strokeDasharray = lenLearn;
// balance triangle
const TRI = { c: [960, 640], v: [[960, 360], [717.5, 780], [1202.5, 780]] };
$('tri').innerHTML = `
  <defs><radialGradient id="triFill" cx="50%" cy="60%" r="60%"><stop offset="0" stop-color="${GOLD}" stop-opacity=".22"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient></defs>
  <path id="triFillP" d="M${TRI.v.map(p => p.join(' ')).join(' L')} Z" fill="url(#triFill)"/>
  <path id="triEdge" d="M${TRI.v.map(p => p.join(' ')).join(' L')} Z" fill="none" stroke="${BLACK}" stroke-width="2"/>
  ${TRI.v.map((p, i) => `<line id="spoke${i}" x1="${TRI.c[0]}" y1="${TRI.c[1]}" x2="${p[0]}" y2="${p[1]}" stroke="${BROWN}" stroke-width="1.2" stroke-dasharray="3 7"/>`).join('')}
  ${TRI.v.map((p, i) => `<circle id="vdot${i}" cx="${p[0]}" cy="${p[1]}" r="9" fill="${BLACK}"/>`).join('')}
  ${[0, 1, 2].map(i => `<circle id="ripple${i}" cx="${TRI.c[0]}" cy="${TRI.c[1]}" r="10" fill="none" stroke="${GOLD}" stroke-width="1.5"/>`).join('')}
  <circle id="balDot" cx="0" cy="0" r="14" fill="${GOLD}"/>`;
const triEdge = $('triEdge'); const triLen = triEdge.getTotalLength(); triEdge.style.strokeDasharray = triLen;

// ---------- canvases ----------
const bg = $('bg2d').getContext('2d'), fx = $('fx').getContext('2d'), gl = $('glow').getContext('2d'), gr = $('grain').getContext('2d');
const grainTiles = [];
for (let k = 0; k < 6; k++) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); const im = g.createImageData(512, 512); const r = mulberry32(900 + k);
  for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 120; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); grainTiles.push(gr.createPattern(c, 'repeat'));
}
// question-scene particles
const QN = 3200, QP = [];
{ const r = mulberry32(11);
  for (let i = 0; i < QN; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, rad = 2.6 * Math.cbrt(r()) * (.75 + .25 * r());
    const s = Math.sqrt(1 - u * u);
    const tx = Math.cos(a) * s * rad * 1.5, ty = u * rad * .82, tz = Math.sin(a) * s * rad;
    const ts = .25 + 6.0 * Math.pow(r(), .55);
    QP.push({ tx, ty, tz, fx: tx * 4 + (r() - .5) * 6, fy: ty * 4 + (r() - .5) * 4, fz: tz * 4 - 6 - r() * 6, ts, gold: r() < .14, sz: .6 + r() * 1.3, dl: r() * .35, vx: (r() - .5) * 2.2, vz: (r() - .5) * 1.5 });
  } }
const DUST = []; { const r = mulberry32(21); for (let i = 0; i < 90; i++) DUST.push({ x: r() * W, y: r() * H, s: .6 + r() * 2.2, v: .2 + r() * .8, ph: r() * 6 }); }

function line(ctx, pts, color, alpha, width, dash) {
  if (pts.length < 2 || alpha <= .005) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.restore();
}
function arrow(ctx, x0, y0, x1, y1, color, alpha, width = 2.5) {
  if (alpha <= .005) return;
  const a = Math.atan2(y1 - y0, x1 - x0), hl = 16;
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * hl * .6, y1 - Math.sin(a) * hl * .6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.cos(a - .42) * hl, y1 - Math.sin(a - .42) * hl); ctx.lineTo(x1 - Math.cos(a + .42) * hl, y1 - Math.sin(a + .42) * hl); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function label(ctx, txt, x, y, color, alpha, size = 15, align = 'left') {
  if (alpha <= .005) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.font = `400 ${size}px "IBM Plex Mono"`; ctx.textAlign = align;
  ctx.letterSpacing = '3px'; ctx.fillText(txt, x, y); ctx.restore();
}
function glowDot(ctx, x, y, r, color, alpha) {
  if (alpha <= .005) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,248,236,${alpha})`); g.addColorStop(.12, color.replace('A', alpha * .9)); g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
const GOLDA = 'rgba(185,152,106,A)';
function brackets(ctx, x0, y0, x1, y1, color, alpha, len = 18) {
  if (alpha <= .005) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { ctx.moveTo(x + sx * len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * len); }
  ctx.stroke(); ctx.restore();
}
function anchorTag(el, anchor, dx, dy, op, ctx, color) {   // place a DOM tag near a 3D anchor with a leader line
  if (!anchor || op <= .005) { el.style.visibility = 'hidden'; return; }
  const x = anchor[0] + dx, y = anchor[1] + dy;
  st(el, { op, x, y, blur: (1 - op) * 6 });
  el.style.left = '0px'; el.style.top = '0px';
  if (ctx) {
    ctx.save(); ctx.globalAlpha = op * .9; ctx.strokeStyle = color; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(anchor[0], anchor[1]); ctx.lineTo(x + (dx < 0 ? el.offsetWidth : 0), y + el.offsetHeight / 2); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(anchor[0], anchor[1], 4, 0, 7); ctx.fill(); ctx.restore();
  }
}

// ---------- chapters / theme ----------
const CHAPTERS = [[0, 'The question'], [9.0, 'Quantity'], [24.9, 'Quality'], [35.0, 'The physical world'], [47.4, 'PrismaX'], [56.9, 'Balance'], [70.9, 'The future']];
const darkAt = t => !((t >= 24.9 && t < 35.0) || (t >= 50.45 && t < 70.9) || t >= 81.0);

// ============================================================ scenes
function sceneQ(t) {
  const on = vis($('q'), t < 9.2);
  if (!on) return;
  // particles
  const rot = (Math.min(t, 6.65)) * .13 + .4;
  const camZ = lerp(8.2, 5.8, E.inOut(P(t, 0, 6.6)));
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const fall = t - 7.0;
  let spawned = 0;
  for (const p of QP) {
    if (t < p.ts) continue;
    spawned++;
    const k = E.outCubic(P(t, p.ts, p.ts + 1.3));
    let x = lerp(p.fx, p.tx, k), y = lerp(p.fy, p.ty, k), z = lerp(p.fz, p.tz, k);
    let a = 1;
    if (fall > 0) {
      const f = Math.max(0, fall - p.dl * .5);
      y -= 4.9 * f * f; x += p.vx * f; z += p.vz * f;
      a = 1 - P(f, .3, 1.4);
    }
    const rx = x * cs - z * sn, rz = x * sn + z * cs;
    const zz = camZ - rz; if (zz < .3) continue;
    const f = 1000 / zz;
    const sx = W / 2 + rx * f, sy = H / 2 - y * f;
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 40) continue;
    const depth = clamp(1.4 - zz / 9, .15, 1);
    const sz = p.sz * f / 260;
    bg.globalAlpha = a * depth * (k < 1 ? .5 + .5 * k : 1) * (t > 6.65 && t < 7.0 ? .6 : 1);
    bg.fillStyle = p.gold ? GOLD : '#E8E2DA';
    bg.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
    if (k < .98 && fall <= 0) {   // flight streak
      const k2 = E.outCubic(P(t - .06, p.ts, p.ts + 1.3));
      const x2 = lerp(p.fx, p.tx, k2), y2 = lerp(p.fy, p.ty, k2), z2 = lerp(p.fz, p.tz, k2);
      const rx2 = x2 * cs - z2 * sn, rz2 = x2 * sn + z2 * cs, zz2 = camZ - rz2;
      if (zz2 > .3) { bg.strokeStyle = bg.fillStyle; bg.lineWidth = sz * .7; bg.beginPath(); bg.moveTo(sx, sy); bg.lineTo(W / 2 + rx2 * 1000 / zz2, H / 2 - y2 * 1000 / zz2); bg.stroke(); }
    }
  }
  bg.globalAlpha = 1;
  // text backdrop
  const tb = bg.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 820);
  tb.addColorStop(0, `rgba(12,11,10,${.78 * io(t, 2.2, .6, 6.4, .5)})`); tb.addColorStop(1, 'rgba(12,11,10,0)');
  bg.fillStyle = tb; bg.fillRect(0, 0, W, H);
  // counter
  const c = $('qCount');
  const n = Math.pow(spawned / QN, 2.2) * 14_200_000;
  c.innerHTML = `<span style="color:${GOLD}">●</span>&nbsp;&nbsp;Data collected&nbsp;&nbsp;<span style="color:#F2EEE8">${fmt(n).padStart(10, ' ')}</span>`;
  st(c, { op: io(t, .6, .6, 6.6, .3) });
  words($('q1a'), 'Does collecting ^more ^data', t, 'q1', 6.45);
  words($('q1b'), 'always lead to ~smarter ~AI?', t, 'q1', 6.45);
  // "Not necessarily." — hard cut in, chromatic split
  const q2 = $('q2');
  setWords(q2, 'Not !necessarily.');
  const tq = VO.q2;
  const on2 = t >= tq - .02 && t < 8.95;
  q2.style.visibility = on2 ? 'visible' : 'hidden';
  if (on2) {
    const sp = q2._spans;
    const p0 = P(t, tq, tq + .02), p1 = E.outQuint(P(t, w('q2', 1) - .02, w('q2', 1) + .35));
    const out = E.inCubic(P(t, 8.35, 8.9));
    sp[0].style.opacity = p0 * (1 - out); sp[1].style.opacity = p1 * (1 - out);
    sp[0].style.transform = sp[1].style.transform = `translateY(${-out * 20}px)`;
    const ch = Math.max(0, 1 - (t - tq) / .35) * 14 + Math.max(0, 1 - Math.abs(t - w('q2', 1)) / .15) * 8;
    q2.style.textShadow = ch > .3 ? `${ch}px 0 rgba(181,102,84,.8), ${-ch}px 0 rgba(185,152,106,.7)` : 'none';
    q2.style.filter = out > .01 ? `blur(${out * 20}px)` : 'none';
    st(q2, { s: lerp(1.06, 1, E.outExpo(P(t, tq, tq + .5))) + out * .04 });
  }
  // the light slit that opens into the 3D scene
  if (t > 8.45) {
    const k = E.inOut(P(t, 8.45, 9.0));
    gl.fillStyle = `rgba(185,152,106,${.9 * (1 - P(t, 9.0, 9.4))})`;
    gl.fillRect(W / 2 - k * W / 2, H / 2 - 1, k * W, 2);
    glowDot(gl, W / 2, H / 2, 260 * k, GOLDA, .5 * (1 - P(t, 9.0, 9.4)));
  }
}

function sceneR(t, o) {
  const on = vis($('r'), t >= 9.0 && t < 25.0);
  if (!on) return;
  // trails
  if (o && o.trails) o.trails.forEach((tr, i) => {
    if (i === 0 && tr.color === GOLD) { fx.save(); fx.shadowColor = GOLD; fx.shadowBlur = 14; line(fx, tr.pts, tr.color, tr.alpha, tr.width); fx.restore(); }
    else line(fx, tr.pts, tr.color, tr.alpha, tr.width);
  });
  words($('r1a'), 'The same task.', t, 'r1', 13.75);
  words($('r1b'), '~Thousands ~of ~times.', t, 'r1', 13.75);
  const pre = $('r2pre');
  pre.textContent = 'But the data is full of —'; st(pre, { op: io(t, VO.r2, .4, 20.2, .4), y: (1 - E.outCubic(P(t, VO.r2, VO.r2 + .5))) * 16 });
  $('rScrim').style.opacity = Math.max(io(t, 11.0, .6, 13.8, .5), io(t, VO.r2 - .2, .5, 20.3, .5));
  const dimOld = (el, tNext) => { el.style.opacity = lerp(1, .32, E.outCubic(P(t, tNext, tNext + .4))); };
  words($('r2a'), '!Incorrect !movements,', t, 'r2', 20.2); dimOld($('r2a'), w('r2', 8));
  words($('r2b'), '!Poor !execution,', t, 'r2', 20.2); dimOld($('r2b'), w('r2', 11));
  words($('r2c'), 'and !repetitive !experiences.', t, 'r2', 20.2);
  ['r2a', 'r2b', 'r2c'].forEach(id => { if ($(id).style.visibility !== 'hidden') $(id).style.opacity = Math.min(+$(id).style.opacity, 1 - E.inCubic(P(t, 20.2, 20.6))); });
  // tags
  if (o && o.anchors) {
    const dev = (12 + 4 * Math.sin(t * 9)).toFixed(1);
    $('tagGhost').textContent = `✕ Trajectory deviation · ${dev} cm`;
    anchorTag($('tagGhost'), o.anchors.ghost, 120, -120, io(t, w('r2', 6), .3, 18.3, .3), fx, BRONZE);
    $('tagDrop').textContent = '✕ Grasp failed · object dropped';
    anchorTag($('tagDrop'), o.anchors.cube, 110, 40, io(t, 17.15, .25, 18.4, .3), fx, BRONZE);
    $('tagGrid').textContent = `✕ Duplicate experience × ${fmt(lerp(1, 4812, E.outCubic(P(t, 18.6, 20.0))))}`;
    st($('tagGrid'), { op: io(t, w('r2', 11), .3, 20.4, .3), x: 1250, y: 300 });
    $('tagGrid').style.left = $('tagGrid').style.top = '0px';
  }
  // dim + the equation
  $('dim').style.opacity = .62 * io(t, 20.5, .5, 24.3, .6);
  words($('r3'), 'More data !≠@2 better learning.', t, 'r3', 23.75, { dy: 50 });
  const ck = E.inOut(P(t, 21.0, 23.4)), co = 1 - P(t, 23.75, 24.2);
  cData.style.strokeDashoffset = lenData * (1 - ck); cLearn.style.strokeDashoffset = lenLearn * (1 - ck);
  st($('r3chart'), { op: (t > 20.9 ? 1 : 0) * co });
  $('lData').style.opacity = P(t, 23.0, 23.3); $('lLearn').style.opacity = P(t, 23.0, 23.3);
  // HUD counter
  const ep = t < 13.6 ? lerp(1, 4812, Math.pow(P(t, 9.4, 13.6), 2.3)) : t < 18.6 ? 4812 + (t - 13.6) * 2 : lerp(4822, 376524, E.outCubic(P(t, 18.6, 21.5)));
  $('hudBL').innerHTML = `Episode&nbsp;&nbsp;<span style="color:${t > 15.3 ? BRONZE : GOLD}">${fmt(ep).padStart(7, '0')}</span>`;
  $('hudBR').textContent = t < 18.6 ? 'Cell 001 · Pick & place' : '77 cells · same task';
  // transition to cream: light streak + circular reveal
  if (t > 23.8) {
    const k = E.inExpo(P(t, 23.8, 24.6));
    gl.fillStyle = `rgba(242,230,210,${.85 * k})`; gl.fillRect(0, H / 2 - 1 - k * 4, W, 2 + k * 8);
    glowDot(gl, W / 2, H / 2, 200 + k * 900, GOLDA, k * .9);
  }
}

function sceneG(t, o) {
  const on = vis($('g'), t >= 24.9 && t < 35.1);
  if (!on) return;
  if (o && o.trails) o.trails.forEach(tr => line(fx, tr.pts, tr.color, tr.alpha, tr.width, tr.dash));
  const out1 = 28.75;
  words($('g1a'), 'Accurate.@0', t, 'g1', out1, { dy: 60 });
  words($('g1b'), 'Diverse.@1', t, 'g1', out1, { dy: 60 });
  words($('g1c'), 'Relevant.@3', t, 'g1', out1, { dy: 60 });
  [['g1la', '(a) Precision', 0], ['g1lb', '(b) Variety', 1], ['g1lc', '(c) Context', 3]].forEach(([id, s, i]) => {
    $(id).textContent = s; st($(id), { op: io(t, w('g1', i) + .1, .4, out1, .3) });
  });
  words($('g1d'), '—@4 data@4 that@5 is@5 *different.@6', t, 'g1', out1);
  // anchored tags
  if (o && o.anchors) {
    $('tagTarget').innerHTML = `<span style="color:${GOLD}">✓</span> Placement error · 0.4 mm`;
    anchorTag($('tagTarget'), o.anchors.target, 70, 60, io(t, 26.65, .3, 28.9, .3), fx, GOLD);
    OBJ_NAMES.forEach((n, i) => {
      const el = $('ot' + i), a = o.anchors['obj' + i];
      if (!a) { el.style.visibility = 'hidden'; return; }
      st(el, { op: io(t, 26.3 + i * .12, .3, 28.6, .3), x: a[0] - 40, y: a[1] - 44 }); el.style.left = el.style.top = '0px';
    });
    if (o.anchors.knot) {
      const ok = t > 34.1;
      $('tagKnot').innerHTML = ok ? `<span style="color:${GOLD}">✓</span> Grasped · generalized` : `<span style="color:${BRONZE}">?</span> Unseen object`;
      $('tagKnot').style.color = ok ? BLACK : BRONZE;
      anchorTag($('tagKnot'), o.anchors.knot, 90, -70, io(t, 32.8, .3, 34.85, .2), fx, ok ? GOLD : BRONZE);
    } else $('tagKnot').style.visibility = 'hidden';
  }
  $('g2a').style.top = '150px'; $('g2b').style.top = '150px';
  words($('g2a'), 'It teaches AI ~useful ~skills,', t, 'g2', 32.15);
  SKILLS.forEach((n, i) => {
    const t0 = w('g2', 4) + i * .11;
    const p = E.outBack(P(t, t0, t0 + .45)), q = E.inCubic(P(t, 32.05 + i * .03, 32.35 + i * .03));
    st($('chip' + i), { op: P(t, t0, t0 + .2) * (1 - q), x: 120 + (i % 4) * 200, y: 300 + Math.floor(i / 4) * 104 + (1 - p) * 30, s: lerp(.85, 1, p), blur: q * 10 });
    $('chip' + i).style.left = $('chip' + i).style.top = '0px';
  });
  words($('g2b'), '*and perform in situations|it has ~never ~seen.', t, 'g2', 34.7);
  if (t > 34.75) { const k = P(t, 34.75, 35.0); $('flash').style.background = '#0C0B0A'; $('flash').style.opacity = k; }
}

function sceneP(t, o) {
  const on = vis($('p'), t >= 35.0 && t < 47.5);
  if (!on) return;
  // dust in the light
  if (t < 38.4) {
    for (const d of DUST) {
      const y = (d.y - (t - 35) * 18 * d.v + H) % H, x = d.x + Math.sin(t * .7 + d.ph) * 14;
      const a = .55 * io(t, 35.1, .6, 38.0, .4) * (.4 + .6 * Math.sin(t * 1.3 + d.ph * 3) ** 2);
      glowDot(gl, x, y, d.s * 5, 'rgba(230,205,165,A)', a);
    }
  }
  words($('p1'), 'In robotics, this matters ~even ~more.', t, 'p1', 38.1);
  words($('p2a'), 'AI must ~interact with the ~physical ~world.', t, 'p2', 41.2);
  words($('p2b'), '~Manipulate ~objects.', t, 'p2', 43.25);
  words($('p2c'), 'And ~adapt to environments that never stop changing.', t, 'p2', 46.2);
  if (o && o.anchors && t >= 38.3 && t < 41.4) {
    const a = io(t, 38.9, .4, 41.1, .3), A = o.anchors;
    const jit = (v, k) => (v + Math.sin(t * 7 + k) * .08).toFixed(2);
    arrow(fx, A.cube[0], A.cube[1], A.cubeFront[0], A.cubeFront[1], GOLD, a, 3);
    label(fx, `F  ${jit(4.2, 1)} N`, A.cubeFront[0] - 20, A.cubeFront[1] - 22, GOLD, a, 16, 'right');
    arrow(fx, A.cube[0], A.cube[1], A.cube[0], A.cube[1] + 95, CREAM, a * .8, 2);
    label(fx, `mg  3.43 N`, A.cube[0] + 14, A.cube[1] + 88, CREAM, a * .8, 14);
    const fxv = [A.cube[0] - A.cubeFront[0], A.cube[1] - A.cubeFront[1]], L = Math.hypot(...fxv) || 1;
    arrow(fx, A.floorUnder[0], A.floorUnder[1] + 6, A.floorUnder[0] + fxv[0] / L * 90, A.floorUnder[1] + 6 + fxv[1] / L * 90, BRONZE, a * .9, 2);
    label(fx, `μ  ${jit(.62, 3)}`, A.floorUnder[0] + fxv[0] / L * 100, A.floorUnder[1] + 34, BRONZE, a * .9, 14);
    label(fx, 'Contact · force estimate', 76, 236, CREAM, a * .7, 13);
  }
  if (o && o.bbox) {
    const xs = o.bbox.map(p => p[0]), ys = o.bbox.map(p => p[1]);
    const x0 = Math.min(...xs) - 16, x1 = Math.max(...xs) + 16, y0 = Math.min(...ys) - 16, y1 = Math.max(...ys) + 16;
    const a = io(t, 41.5, .3, 43.2, .2);
    brackets(fx, x0, y0, x1, y1, GOLD, a);
    const pz = o.pose;
    $('poseLab').innerHTML = `6-DoF pose&nbsp;&nbsp;x ${pz.x.toFixed(2)}&nbsp;&nbsp;y ${pz.y.toFixed(2)}&nbsp;&nbsp;z ${pz.z.toFixed(2)}&nbsp;&nbsp;θ ${Math.round(o.roll * 57.3)}°`;
    st($('poseLab'), { op: a, x: x1 + 18, y: y0 - 6 }); $('poseLab').style.left = $('poseLab').style.top = '0px';
  } else $('poseLab').style.visibility = 'hidden';
  if (o && o.env) {
    $('envLab').innerHTML = `<span style="color:${GOLD}">Env ${String(o.envIndex + 1).padStart(2, '0')} / 06</span>&nbsp;&nbsp;—&nbsp;&nbsp;${o.env}`;
    st($('envLab'), { op: 1 });
    const A = o.anchors.obj; brackets(fx, A[0] - 46, A[1] - 30, A[0] + 46, A[1] + 62, GOLD, .9, 12);
    const lt = (t - 43.4) % .5; $('flash').style.background = '#fff'; $('flash').style.opacity = (.16 * (1 - P(lt, 0, .12))).toFixed(3);
  } else st($('envLab'), { op: 0 });
}

function sceneX(t) {
  const on = vis($('x'), t >= 47.3 && t < 57.0);
  if (!on) return;
  const tp = t - 47.4;
  const pipeOn = t >= 50.45;
  vis($('pipe'), pipeOn);
  // ---- prism (on black)
  if (t < 50.5 && tp > 0) {
    const cx = 960, cy = 560, s = 380, hgt = s * Math.sqrt(3) / 2;
    const v = [[cx, cy - hgt * 2 / 3], [cx - s / 2, cy + hgt / 3], [cx + s / 2, cy + hgt / 3]];
    const pa = io(t, 47.4, .15, 48.25, .5);
    const conv = E.inOut(P(t, 48.1, 48.6));
    // incoming beam
    const bk = E.outExpo(P(tp, 0, .28));
    const entry = [lerp(v[1][0], v[0][0], .52), lerp(v[1][1], v[0][1], .52)];
    const exitP = [lerp(v[2][0], v[0][0], .45), lerp(v[2][1], v[0][1], .45)];
    gl.save(); gl.globalCompositeOperation = 'lighter';
    if (pa > 0) {
      const sx = -40, sy = entry[1] + 150;
      gl.strokeStyle = `rgba(255,250,240,${.95 * pa})`; gl.lineWidth = 3; gl.shadowColor = '#fff'; gl.shadowBlur = 24;
      gl.beginPath(); gl.moveTo(sx, sy); gl.lineTo(lerp(sx, entry[0], bk), lerp(sy, entry[1], bk)); gl.stroke();
      // inside the glass
      const ik = E.outCubic(P(tp, .22, .45));
      if (ik > 0) { gl.lineWidth = 6; gl.strokeStyle = `rgba(255,245,230,${.6 * pa})`; gl.beginPath(); gl.moveTo(entry[0], entry[1]); gl.lineTo(lerp(entry[0], exitP[0], ik), lerp(entry[1], exitP[1], ik)); gl.stroke(); }
      // dispersion fan
      const fk = E.outExpo(P(tp, .4, 1.0));
      const RAYS = [['242,238,232', -.13], ['223,216,208', -.06], ['185,152,106', .01], ['181,102,84', .08], ['122,107,90', .15]];
      gl.shadowBlur = 30;
      RAYS.forEach(([c, ang], i) => {
        const a0 = .14 + ang;
        const L = 1500 * fk;
        let ex = exitP[0] + Math.cos(a0) * L, ey = exitP[1] + Math.sin(a0) * L;
        // converge back toward the logo
        ex = lerp(ex, 960 + (i - 2) * 30, conv); ey = lerp(ey, 520, conv);
        const sx2 = lerp(exitP[0], 960, conv), sy2 = lerp(exitP[1], 520, conv);
        gl.strokeStyle = `rgba(${c},${.9 * pa})`; gl.lineWidth = 6 + i * .6 + fk * 4;
        gl.beginPath(); gl.moveTo(sx2, sy2); gl.lineTo(ex, ey); gl.stroke();
      });
    }
    gl.restore();
    // prism glass
    if (pa > 0) {
      const sc = lerp(1, .2, conv);
      bg.save(); bg.translate(cx, cy); bg.scale(sc, sc); bg.translate(-cx, -cy);
      const gg = bg.createLinearGradient(v[1][0], v[0][1], v[2][0], v[1][1]);
      gg.addColorStop(0, 'rgba(223,216,208,.10)'); gg.addColorStop(.5, 'rgba(185,152,106,.05)'); gg.addColorStop(1, 'rgba(223,216,208,.14)');
      bg.globalAlpha = pa * E.outCubic(P(tp, 0, .2));
      bg.fillStyle = gg; bg.strokeStyle = 'rgba(238,233,227,.9)'; bg.lineWidth = 2;
      bg.beginPath(); v.forEach((p, i) => i ? bg.lineTo(p[0], p[1]) : bg.moveTo(p[0], p[1])); bg.closePath(); bg.fill(); bg.stroke();
      bg.restore();
    }
    // anamorphic flare
    const fl = Math.max(E.outCubic(P(tp, .35, .6)) * (1 - P(tp, .6, 1.4)) * .8, Math.max(0, 1 - Math.abs(t - 48.5) / .35) * .9);
    if (fl > 0) {
      const fy = conv > .5 ? 520 : exitP[1];
      const lg = gl.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, 'rgba(185,152,106,0)'); lg.addColorStop(.5, `rgba(255,240,215,${fl})`); lg.addColorStop(1, 'rgba(185,152,106,0)');
      gl.fillStyle = lg; gl.fillRect(0, fy - 2, W, 4);
      glowDot(gl, conv > .5 ? 960 : exitP[0], fy, 380, GOLDA, fl * .8);
    }
  }
  // ---- wordmark
  const lb = $('logoBig');
  const lin = E.outExpo(P(t, 48.3, 49.3)), lout = E.inCubic(P(t, 50.1, 50.5));
  st(lb, { op: P(t, 48.3, 48.6) * (1 - lout), s: lerp(1.18, 1, lin) * (1 + lout * .06), blur: (1 - lin) * 22 + lout * 10 });
  sweep('big', P(t, 48.6, 49.9));
  $('logoSub').innerHTML = `Physical AI&nbsp;&nbsp;<span style="color:${GOLD}">·</span>&nbsp;&nbsp;Robotics data`;
  st($('logoSub'), { op: io(t, 49.0, .5, 50.05, .3), y: (1 - E.outCubic(P(t, 49.0, 49.6))) * 14 });
  if (t > 50.0 && t < 50.9) {   // cream bloom into the pipeline
    const k = E.inOut(P(t, 50.0, 50.5));
    $('flash').style.background = CREAM; $('flash').style.opacity = 1 - P(t, 50.5, 50.9);
    $('flash').style.clipPath = `circle(${(k * 1200).toFixed(0)}px at 960px 527px)`;
  }
  if (!pipeOn) return;
  // ---- pipeline
  const po = 1 - E.inCubic(P(t, 56.5, 56.95));
  $('pipe').style.opacity = po;
  st($('logoSmall'), { op: P(t, 50.6, 51.0), y: (1 - E.outCubic(P(t, 50.6, 51.2))) * -10 });
  sweep('small', P(t, 51.0, 52.2));
  [['st1', '(01) Collect', 0], ['st2', '(02) Evaluate', 2], ['st3', '(03) Train', 7]].forEach(([id, s, i]) => {
    $(id).innerHTML = `<span style="color:${GOLD}">${s.slice(0, 4)}</span>&nbsp;${s.slice(4)}`;
    st($(id), { op: P(t, w('x2', i), w('x2', i) + .35), y: (1 - E.outCubic(P(t, w('x2', i), w('x2', i) + .5))) * 14 });
  });
  const gk = E.outCubic(P(t, w('x2', 2), w('x2', 2) + .5));
  $('gate').style.transform = `scaleY(${gk})`; $('gate').style.opacity = gk;
  const nk = E.outBack(P(t, w('x2', 7) - .3, w('x2', 7) + .3));
  let absorbed = 0;
  for (let i = 0; i < CARD_N; i++) {
    const el = $('card' + i), s0 = 50.65 + i * .3, tau = t - s0;
    if (tau < 0 || tau > 3.2) { el.style.visibility = 'hidden'; if (tau > 2.5 && ACCEPT[i]) absorbed++; continue; }
    const lane = [0, 1, 2][i % 3], y0 = 345 + lane * 150;
    let x, y = y0, s = 1, op = 1, r = 0;
    const gateX = 958 - 105;
    if (tau < 1.6) x = lerp(-260, gateX, E.inOut(P(tau, 0, 1.6)));
    else if (ACCEPT[i]) {
      const k = E.inOut(P(tau, 1.75, 2.7));
      x = lerp(gateX, 1650 - 105, k); y = lerp(y0, 540 - 69, k); s = lerp(1, .25, E.inCubic(k)); op = 1 - P(tau, 2.45, 2.7);
      if (tau > 2.5) absorbed++;
    } else {
      const k = P(tau, 1.8, 2.6);
      x = gateX + k * 60; y = y0 + 260 * k * k; r = k * 14; op = 1 - k;
    }
    if (t < w('x2', 7) - .2 && tau > 1.75 && ACCEPT[i]) { x = gateX + (tau - 1.75) * 40; }   // wait at the gate until "trains"
    st(el, { op: op * P(tau, 0, .2), x, y, s, r }); el.style.left = el.style.top = '0px';
    const sc = el.querySelector('.score');
    sc.textContent = ACCEPT[i] ? `Q ${SCORES[i]} ✓` : `Q ${SCORES[i]} ✕`;
    sc.style.background = ACCEPT[i] ? GOLD : BRONZE; sc.style.opacity = P(tau, 1.5, 1.65) * (t > w('x2', 2) ? 1 : 0);
    el.style.borderColor = tau > 1.55 ? (ACCEPT[i] ? GOLD : BRONZE) : '#D5CCC1';
  }
  st($('node'), { op: P(t, w('x2', 7) - .3, w('x2', 7)), s: nk * (1 + .04 * Math.sin(t * 6) * P(t, 53.5, 54)) });
  $('nodeRing').setAttribute('transform', `rotate(${(t * 40) % 360} 150 150)`);
  $('nodeCount').textContent = `Training · ${String(absorbed).padStart(3, '0')} ep`;
  $('realTag').innerHTML = `→&nbsp;&nbsp;Deployed in the real world`;
  st($('realTag'), { op: P(t, w('x2', 12), w('x2', 12) + .4), y: (1 - E.outCubic(P(t, w('x2', 12), w('x2', 12) + .5))) * 12 });
  words($('x2a'), 'Collecting and evaluating robotics data', t, 'x2', 56.35);
  words($('x2b'), 'that trains ~Physical ~AI for the real world.', t, 'x2', 56.35);
}

function sceneB(t) {
  const on = vis($('b'), t >= 56.9 && t < 71.0);
  if (!on) return;
  const lone = $('lone');
  const lk = E.outBack(P(t, 56.95, 57.5));
  st(lone, { op: P(t, 56.95, 57.2) * (1 - P(t, w('b2', 3), w('b2', 3) + .3)), s: lerp(.6, 1, lk) * lerp(1, .55, E.inOut(P(t, 59.2, 60.4))), y: lerp(0, 120, E.inOut(P(t, 59.2, 60.4))) });
  words($('b1'), 'But quality !alone isn’t enough.', t, 'b1', 59.25);
  // grid of experiences
  const tGrid = w('b2', 3), tDiv = w('b2', 6), tSk = w('b2', 9), tCol = 66.0;
  const cx = 960, cy = 465;
  for (let i = 0; i < MINI_C * MINI_R; i++) {
    const el = $('mini' + i), c = i % MINI_C, r = Math.floor(i / MINI_C);
    const gx = 168 + c * 132, gy = 180 + r * 96;
    const d = Math.hypot(gx - cx, gy - cy);
    const t0 = tGrid + d * .0007;
    const k = E.outBack(P(t, t0, t0 + .55)), ck = E.inOut(P(t, tCol + d * .0003, tCol + .7 + d * .0003));
    if (t < t0 || ck >= 1) { el.style.visibility = 'hidden'; continue; }
    const x = lerp(lerp(cx - 56, gx, k), TRI.c[0] - 56, ck), y = lerp(lerp(cy - 37, gy, k), TRI.c[1] - 37, ck);
    st(el, { op: P(t, t0, t0 + .15) * (1 - P(ck, .7, 1)), x, y, s: lerp(.4, 1, P(t, t0, t0 + .4)) * (1 - ck * .8) });
    el.style.left = el.style.top = '0px';
    const diverse = t > tDiv + (c + r) * .025;
    const ic = el.firstChild;
    const sh = diverse ? SHAPES[(i * 7 + r * 3) % SHAPES.length] : ['3px', GOLD];
    ic.style.borderRadius = sh[0]; ic.style.background = sh[1];
    ic.style.transform = diverse ? `rotate(${(i * 37) % 90}deg) scale(${.8 + ((i * 13) % 5) * .1})` : 'none';
    el.style.background = diverse ? ['#fff', '#F6F2EC', '#fff', '#F1EBE3'][(i + r) % 4] : '#fff';
    el.lastChild.textContent = t > tSk + d * .0012 ? MINI_SK[(i * 5 + r) % MINI_SK.length] : (diverse ? '' : 'EP 04120');
  }
  words($('b2a'), 'Models also need ~enough ~data, and ~diverse ~experience,', t, 'b2', 65.5);
  words($('b2b'), 'to learn a wide range of skills.', t, 'b2', 65.5);
  st($('b2bg'), { op: io(t, VO.b2, .4, 65.6, .4) });
  // the triangle
  words($('b3'), 'The real challenge is ~balance.', t, 'b3', 70.3);
  const tq = w('b3', 5), tn = Math.max(w('b3', 6), tq + .45), td = w('b3', 7);
  const ek = E.inOut(P(t, w('b3', 4) - .2, w('b3', 4) + .7));
  const fade = 1 - E.inCubic(P(t, 70.3, 70.85));
  const tri = $('tri'); tri.style.opacity = fade; tri.style.visibility = t > 66.6 ? 'visible' : 'hidden';
  triEdge.style.strokeDashoffset = triLen * (1 - ek);
  $('triFillP').style.opacity = P(t, 69.8, 70.2);
  [tq, tn, td].forEach((tv, i) => {
    const k = E.outBack(P(t, tv, tv + .45));
    $('vdot' + i).setAttribute('r', (9 * k).toFixed(2));
    $('vdot' + i).setAttribute('fill', t > tv + .1 ? GOLD : BLACK);
    $('spoke' + i).style.opacity = P(t, tv, tv + .3) * .8;
    const el = $(['vQ', 'vN', 'vD'][i]), v = TRI.v[i];
    const y = i === 0 ? v[1] - 130 : v[1] + 26;
    st(el, { op: P(t, tv - .02, tv + .3) * fade, x: v[0] - 250, y: y + (1 - E.outCubic(P(t, tv, tv + .5))) * 18, blur: (1 - P(t, tv, tv + .3)) * 10 });
    el.style.left = el.style.top = '0px';
  });
  // the balance point
  let bx = TRI.c[0], by = TRI.c[1];
  const pull = (tv, i) => { const k = Math.sin(Math.PI * P(t, tv, tv + .6)) * .38; bx += (TRI.v[i][0] - TRI.c[0]) * k; by += (TRI.v[i][1] - TRI.c[1]) * k; };
  pull(tq, 0); pull(tn, 1); pull(td, 2);
  const bd = $('balDot'); bd.setAttribute('cx', bx); bd.setAttribute('cy', by);
  bd.setAttribute('r', (14 * E.outBack(P(t, w('b3', 4), w('b3', 4) + .4))).toFixed(2));
  if (t > 66.6 && t < 70.9) glowDot(gl, bx, by, 90, GOLDA, .55 * P(t, w('b3', 4), w('b3', 4) + .4) * fade);
  for (let i = 0; i < 3; i++) {
    const rt = P(t, 70.0 + i * .22, 71.0 + i * .22);
    $('ripple' + i).setAttribute('r', (14 + rt * 160).toFixed(1)); $('ripple' + i).style.opacity = (rt > 0 ? (1 - rt) * .8 : 0) * fade;
  }
  $('balLab').textContent = 'Balance';
  st($('balLab'), { op: P(t, 70.0, 70.3) * fade, x: TRI.c[0] - 150, y: TRI.c[1] + 30 }); $('balLab').style.left = $('balLab').style.top = '0px';
  if (t > 70.6) { $('flash').style.background = '#0B0A09'; $('flash').style.opacity = P(t, 70.6, 70.9); }
}

function sceneF(t, o) {
  const on = vis($('f'), t >= 70.9 && t < 81.1);
  if (!on) return;
  words($('f1a'), 'The future of robotics AI', t, 'f1', 76.2);
  words($('f1b'), 'won’t depend only on building ~larger ~models.', t, 'f1', 76.2);
  words($('f2a'), 'It will depend on', t, 'f2', 79.9);
  words($('f2b'), 'the ~quality of the ~experiences', t, 'f2', 79.9, { dy: 50 });
  words($('f2c'), 'they learn from.', t, 'f2', 79.9);
  const c = o && o.anchors ? o.anchors.center : [W / 2, H / 2];
  const k = E.inExpo(P(t, 78.6, 80.9));
  glowDot(gl, c[0], c[1], 40 + k * 520, GOLDA, .25 + k * .75);
  glowDot(gl, c[0], c[1], 14 + k * 30, 'rgba(255,246,230,A)', .6 + .4 * k);
}

function sceneEnd(t) {
  const on = vis($('end'), t >= 80.9);
  if (!on) return;
  $('end').style.opacity = P(t, 80.9, 81.05);
  const DOT = { x: 741.5, y: 379.7, s: 40 };
  const mk = E.inOut(P(t, 81.0, 81.75));
  const d = $('endDot');
  const sz = lerp(70, DOT.s, mk), cx = lerp(960, DOT.x + DOT.s / 2, mk), cy = lerp(540, DOT.y + DOT.s / 2, mk);
  d.style.left = (cx - sz / 2) + 'px'; d.style.top = (cy - sz / 2) + 'px'; d.style.width = d.style.height = sz + 'px';
  d.style.borderRadius = `${lerp(50, 8, P(mk, .5, 1))}%`;
  d.style.background = mk < .6 ? GOLD : BLACK;
  d.style.boxShadow = `0 0 ${lerp(80, 0, mk)}px rgba(185,152,106,${lerp(.9, 0, mk)})`;
  d.style.opacity = 1 - P(t, 82.8, 83.0);   // hand over to the real dot once the word is in
  const rk = E.inOut(P(t, 81.55, 82.7));
  const L = lerp(28.6, 0, rk), R = lerp(67.5, 0, rk);
  const lg = $('endLogo');
  lg.style.clipPath = `inset(-20px ${R}% -20px ${L}%)`;
  lg.style.filter = rk < 1 ? `blur(${((1 - rk) * 6).toFixed(2)}px)` : 'none';
  lg.style.visibility = t > 81.55 ? 'visible' : 'hidden';
  st(lg, { s: lerp(1.04, 1, E.outCubic(P(t, 81.55, 83.5))) });
  sweep('end', P(t, 83.0, 84.3));
  words($('endTag'), '*Quality ~data for Physical AI.', t, 83.1, 999, { stagger: .1 });
  $('endUrl').innerHTML = `prismax.ai`;
  st($('endUrl'), { op: P(t, 84.0, 84.6), y: (1 - E.outCubic(P(t, 84.0, 84.8))) * 12 });
}

// ============================================================ HUD + finishing
function hud(t) {
  const h = $('hud');
  const on = t > .9 && !(t > 47.3 && t < 50.6) && t < 80.6;
  const op = on ? Math.min(P(t, .9, 1.5), 1 - P(t, 80.2, 80.6)) : 0;
  h.style.opacity = op; h.style.visibility = op > 0 ? 'visible' : 'hidden';
  h.style.color = darkAt(t) ? CREAM : BLACK;
  let ci = 0; CHAPTERS.forEach(([s], i) => { if (t >= s) ci = i; });
  const [cs, cn] = CHAPTERS[ci];
  const chap = $('chap');
  chap.innerHTML = `<b>(${String(ci + 1).padStart(2, '0')})</b>${cn}`;
  st(chap, { op: P(t, cs + .25, cs + .7), x: (1 - E.outCubic(P(t, cs + .25, cs + .9))) * -16 });
  const f = Math.floor(t * FPS), ss = Math.floor(f / FPS);
  $('tc').innerHTML = `<span class="rec" style="opacity:${(Math.floor(t * 2) % 2) ? .3 : 1}"></span>Rec&nbsp;&nbsp;00:00:${String(ss).padStart(2, '0')}:${String(f % FPS).padStart(2, '0')}`;
  const inR = t >= 9.0 && t < 24.9;
  if (!inR) {
    $('hudBL').textContent = t < 9 ? 'Physical AI · Data quality' : t < 35 ? 'Dataset · Curated' : t < 47.4 ? 'Sensors · RGB-D / Force / Torque' : t < 56.9 ? 'PrismaX · Data pipeline' : t < 70.9 ? 'Quality · Quantity · Diversity' : 'Physical AI · Next';
    $('hudBR').textContent = '16 : 9 · 30 fps';
  }
  // letterbox (physical world)
  const bk = E.inOut(P(t, 34.95, 35.4)) * (1 - P(t, 47.4, 47.42));
  const close = t < 47.4 ? E.inExpo(P(t, 46.35, 47.35)) : 0;
  const bh = 138 * bk + (540 - 138) * close;
  $('barT').style.height = $('barB').style.height = bh.toFixed(1) + 'px';
}

function finishing(t, frame) {
  // grain
  gr.clearRect(0, 0, W, H);
  gr.save(); const k = frame % 6; gr.fillStyle = grainTiles[k];
  gr.translate((frame * 137) % 512, (frame * 251) % 512); gr.fillRect(-512, -512, W + 1024, H + 1024); gr.restore();
  $('grain').style.opacity = darkAt(t) ? .12 : .07;
  $('vignette').style.opacity = darkAt(t) ? 1 : .35;
  // light leak (dark scenes)
  const lk = darkAt(t) ? .5 : 0;
  const lx = 30 + 25 * Math.sin(t * .23), ly = 20 + 15 * Math.cos(t * .17);
  $('leak').style.background = `radial-gradient(ellipse 900px 600px at ${lx}% ${ly}%, rgba(185,152,106,${.16 * lk}), rgba(185,152,106,0) 70%), radial-gradient(ellipse 700px 500px at ${100 - lx}% ${100 - ly}%, rgba(181,102,84,${.08 * lk}), rgba(181,102,84,0) 70%)`;
  // camera shake on the big hits
  let sx = 0, sy = 0;
  for (const [h, a] of [[7.0, 9], [47.4, 14], [81.0, 5]]) {
    if (t >= h && t < h + 1) { const d = t - h, e = Math.exp(-d * 7) * a; sx += Math.sin(d * 71) * e; sy += Math.cos(d * 53) * e; }
  }
  $('shake').style.transform = `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`;
}

// ============================================================ main
await document.fonts.ready;
await S3.init($('c3'));
function render(t) {
  const frame = Math.round(t * FPS);
  bg.clearRect(0, 0, W, H); fx.clearRect(0, 0, W, H); gl.clearRect(0, 0, W, H);
  const fl = $('flash'); fl.style.opacity = 0; fl.style.clipPath = 'none'; fl.style.background = '#fff';
  $('dim').style.opacity = 0;
  $('paper').style.opacity = (t >= 50.45 && t < 70.95) ? 1 : 0;
  const o = S3.frame(t);
  const c3 = $('c3');
  c3.style.visibility = o.visible ? 'visible' : 'hidden';
  // 3D entrances / exits
  let c3op = 1, clip = 'none';
  if (t >= 9.0 && t < 9.7) { const k = E.inOut(P(t, 9.0, 9.7)); clip = `inset(${(50 - 50 * k).toFixed(2)}% 0 ${(50 - 50 * k).toFixed(2)}% 0)`; }
  if (t >= 24.6 && t < 25.3) c3op = P(t, 24.9, 25.3) > 0 ? 1 : 1;
  if (t >= 70.9 && t < 71.6) c3op = P(t, 70.9, 71.6);
  c3.style.clipPath = clip; c3.style.opacity = c3op;
  sceneQ(t); sceneR(t, o); sceneG(t, o); sceneP(t, o); sceneX(t); sceneB(t); sceneF(t, o); sceneEnd(t);
  // cream bloom from the repetition scene into the quality scene
  if (t >= 24.55 && t < 25.6) {
    const k = E.inOut(P(t, 24.55, 24.9));
    fl.style.background = '#F4EFE8'; fl.style.clipPath = `circle(${(k * 1150).toFixed(0)}px at 960px 540px)`;
    fl.style.opacity = 1 - P(t, 24.95, 25.6);
  }
  if (t >= 80.7 && t < 81.0) { fl.style.background = '#FFF6E8'; fl.style.opacity = E.inExpo(P(t, 80.7, 81.0)); }
  if (t >= 81.0 && t < 81.5) { fl.style.background = '#FFF6E8'; fl.style.opacity = 1 - E.outCubic(P(t, 81.0, 81.5)); }
  if (t < .6) { fl.style.background = '#000'; fl.style.opacity = 1 - P(t, 0, .6); }
  hud(t);
  finishing(t, frame);
}
window.render = render;
window.ready = Promise.resolve(true);
window.DURATION = DUR;
