/* PrismaX Community Website Showcase: deterministic, frame-driven timeline.
   window.render(t) paints the frame at time t (seconds). */
(() => {
const W = 1920, H = 1080, FPS = 30;
const GOLD = '#B9986A', CREAM = '#DFD8D0', BLACK = '#202020';
const $ = (id) => document.getElementById(id);

// ---------- math ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const P = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inCubic: x => x * x * x,
  inOutCubic: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  inOutExpo: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outQuint: x => 1 - Math.pow(1 - x, 5),
  inQuad: x => x * x,
  smooth: x => x * x * (3 - 2 * x),
};
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const io = (t, a, di, b, dout, ein = E.outCubic, eout = E.inCubic) => ein(P(t, a, a + di)) * (1 - eout(P(t, b, b + dout)));
const wrapDeg = d => { d = ((d + 180) % 360 + 360) % 360 - 180; return d; };

// ---------- content ----------
const CATS = [
  { t: 'Tools|*& Utilities', chip: 'Tools & Utilities', n: 3 },
  { t: 'Robotics|*& Learning', chip: 'Robotics & Learning', n: 4 },
  { t: 'Games|*& Interactive', chip: 'Games & Interactive', n: 3 },
  { t: 'Community|*& Creative', chip: 'Community & Creative', n: 5 },
];
const SITES = [
  ['PrismaX Web', 'RomRom', 'A spotlight directory with handy tools for creators and operators.'],
  ['Content Maker', 'Ayush', 'AI-assisted content creation with ready templates and branding.'],
  ['PX Compass', '0xAetherion', 'Every official PrismaX page, resource and channel, organized in one place.'],
  ['RoboLens', 'Feurimas', 'Hands-on exercises in assessing and validating robotics data quality.'],
  ['Robot Arm|Simulator', 'DON', 'Control a robot arm and complete pick-and-place missions right in your browser.'],
  ['Knowledge|Center', 'Jahid', 'A multilingual hub for learning about PrismaX and Physical AI.'],
  ['Inside|Teleoperation', 'ADELKHATER', 'Interactive storytelling on human demonstrations and how teleoperation powers Physical AI.'],
  ['PrismaX|Live Quiz', 'Hellish', 'Multiplayer quiz rooms with bilingual support and a live leaderboard.'],
  ['RUN Franklin’s|RUN', 'MiKE', 'A retro arcade maze game full of robot characters and collectibles.'],
  ['Baby Franklin|Games', 'Dazai', 'A maze challenge plus a catch-the-ball mini game.'],
  ['Identify Top|Contributors', 'Byakuya', 'Meet regional contributors and test yourself with a PFP guessing game.'],
  ['Ambassador|Hall', 'tunct', 'A tribute to ambassadors with an interactive audiovisual scene.'],
  ['3D Community|Showcase', 'Jason', 'Member portraits arranged in interactive 3D layouts.'],
  ['Nexus Hub', 'SYNTH', 'A telemetry-inspired community dashboard and art showcase.'],
  ['Atlas', 'Arnab', 'An editorial-style visual tour of the PrismaX ecosystem.'],
].map(([n, by, d], i) => ({ n, by, d, i }));
const VIDEO_SITE = 11, CLIP_FRAMES = 154;

// ---------- timeline ----------
const INTRO_END = 10.0, CAT_DUR = 1.5, SITE_DUR = 3.3;
let tc = INTRO_END, k = 0;
CATS.forEach((c, ci) => {
  c.a = tc; c.b = tc + CAT_DUR; tc += CAT_DUR; c.first = k;
  for (let j = 0; j < c.n; j++, k++) {
    const s = SITES[k]; s.cat = ci; s.a = tc; s.b = tc + SITE_DUR; tc += SITE_DUR;
    s.firstInCat = j === 0; s.lastInCat = j === c.n - 1;
    s.ta = s.firstInCat ? c.a + 0.25 : s.a - 0.35;   // track move-in window
    s.tb = s.firstInCat ? c.a + 1.15 : s.a + 0.55;
  }
  c.last = k - 1;
});
const OUTRO = tc;              // 65.5
const DURATION = OUTRO + 11.5; // 77.0
window.DURATION = DURATION;
window.TIMELINE = { CATS: CATS.map(c => [c.a, c.b]), SITES: SITES.map(s => [s.a, s.b]), OUTRO, DURATION };

// ---------- DOM helpers ----------
function st(el, o) {
  if (o.op !== undefined) { el.style.opacity = o.op; el.style.visibility = o.op <= 0.002 ? 'hidden' : 'visible'; }
  let tr = el.classList.contains('center') ? 'translate(-50%,-50%) ' : '';
  tr += `translate3d(${(o.x || 0).toFixed(2)}px,${(o.y || 0).toFixed(2)}px,${(o.z || 0).toFixed(2)}px) `;
  if (o.ry) tr += `rotateY(${o.ry}deg) `;
  if (o.rx) tr += `rotateX(${o.rx}deg) `;
  if (o.r) tr += `rotate(${o.r}deg) `;
  const s = o.s ?? 1;
  tr += `scale(${(o.sx ?? 1) * s},${(o.sy ?? 1) * s})`;
  el.style.transform = tr;
  if (o.blur !== undefined) el.style.filter = o.blur > 0.15 ? `blur(${o.blur.toFixed(2)}px)` : 'none';
}
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
      if (w.startsWith('~')) { s.classList.add('gold'); w = w.slice(1); }
      else if (w.startsWith('^')) { s.classList.add('muted'); w = w.slice(1); }
      else if (w.startsWith('*')) { s.classList.add('gold', 'it'); w = w.slice(1); }
      s.textContent = w + (i < toks.length - 1 ? ' ' : '');
      el.appendChild(s); spans.push(s);
    });
  });
  el._spans = spans; return spans;
}
function words(el, text, t, tin, tout, o = {}) {
  const spans = setWords(el, text);
  const stg = o.stagger ?? 0.07, dur = o.dur ?? 0.7, od = o.outDur ?? 0.38, dy = o.dy ?? 40;
  if (t < tin - 0.01 || t > tout + od + spans.length * stg * 0.3 + 0.05) { el.style.visibility = 'hidden'; return; }
  el.style.visibility = 'visible'; el.style.opacity = 1;
  spans.forEach((s, i) => {
    const p = E.outQuint(P(t, tin + i * stg, tin + i * stg + dur));
    const q = E.inCubic(P(t, tout + i * stg * 0.3, tout + i * stg * 0.3 + od));
    const blur = (1 - p) * 12 + q * 12;
    s.style.opacity = (p * (1 - q)).toFixed(3);
    s.style.transform = `translateY(${((1 - p) * dy - q * 26).toFixed(2)}px)`;
    s.style.filter = blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : 'none';
  });
}
const svgMark = (key, width, color) => {
  const L = window.LOGOS[key], h = width * L.h / L.w;
  return `<svg width="${width}" height="${h.toFixed(1)}" viewBox="0 0 ${L.w} ${L.h}"><path fill-rule="evenodd" fill="${color}" d="${L.d}"/></svg>`;
};

// ---------- build 3D objects ----------
const rig = $('rig');
const PH_W = 444, PH_H = 806, EDGE_N = 7, EDGE_STEP = 2.2;
const phones = SITES.map((s, i) => {
  const el = document.createElement('div'); el.className = 'phone';
  let html = '';
  for (let e = 1; e <= EDGE_N; e++) {
    const c = Math.round(lerp(78, 26, e / EDGE_N)), c2 = Math.round(c * 0.92);
    html += `<div class="edge" style="transform:translateZ(${-e * EDGE_STEP}px);background:rgb(${c},${c2},${Math.round(c2 * 0.92)})"></div>`;
  }
  html += `<div class="back" style="transform:translateZ(${-(EDGE_N + 1) * EDGE_STEP}px) rotateY(180deg)">${svgMark('px', 150, GOLD)}</div>`;
  html += `<div class="front"><div class="screen">${i === VIDEO_SITE
    ? '<canvas width="540" height="1004"></canvas>'
    : `<img src="assets/shots/s${String(i + 1).padStart(2, '0')}.jpg">`}</div><div class="glare"></div><div class="shade"></div></div>`;
  el.innerHTML = html;
  rig.appendChild(el);
  return { el, img: el.querySelector('.screen img, .screen canvas'), glare: el.querySelector('.glare'), shade: el.querySelector('.shade'), shown: true };
});

const TILE_EDGES = 16, TILE_T = 44;
const tile = document.createElement('div'); tile.className = 'tile';
{
  let html = '';
  for (let e = 1; e < TILE_EDGES; e++) {
    const p = e / TILE_EDGES;
    html += `<div class="edge" style="transform:translateZ(${-p * TILE_T}px);background:rgb(${Math.round(lerp(205, 120, p))},${Math.round(lerp(196, 108, p))},${Math.round(lerp(184, 94, p))})"></div>`;
  }
  html += `<div class="face b">${svgMark('px', 200, CREAM)}</div>`;
  html += `<div class="face f">${svgMark('px', 214, BLACK)}<div class="sweep"></div></div>`;
  tile.innerHTML = html;
  rig.appendChild(tile);
}
const tileSweep = tile.querySelector('.sweep');

$('brandMark').innerHTML = svgMark('px', 56, CREAM);
$('endWm').innerHTML = svgMark('wm', 860, CREAM);
const endWmSvg = $('endWm').querySelector('svg');
const prog = $('prog');
const ticks = SITES.map(() => { const d = document.createElement('div'); d.className = 't'; prog.appendChild(d); return d; });

// video frames for the Ambassador Hall phone
const clipFrames = [];
for (let f = 1; f <= CLIP_FRAMES; f++) { const im = new Image(); im.src = `assets/clip/f${String(f).padStart(3, '0')}.jpg`; clipFrames.push(im); }
const clipCtx = phones[VIDEO_SITE].img.getContext('2d');

// ---------- layouts ----------
const TRACK_X = 1330, TRACK_Y = 540;
function trackXf(d) {
  if (d >= 0) {
    const a = Math.min(d, 1);
    return { x: TRACK_X + 300 * d - 22 * d * d, y: TRACK_Y - 8 * d, z: -360 * d, ry: -15 - 24 * a, rx: 2,
      s: 1, op: clamp(1 - (d - 2.4) / 0.6), shade: 0.5 * clamp(d / 1.6) };
  }
  const a = Math.min(-d, 1.5);
  return { x: TRACK_X - 380 * a, y: TRACK_Y + 10 * a, z: -520 * a, ry: -15 + 36 * Math.min(a, 1), rx: 2,
    s: 1, op: clamp(1 - a * 1.35), shade: 0.6 * clamp(a) };
}
function ringXf(i, spin, o) {
  const th = (i * 24 + spin) * Math.PI / 180;
  const c = Math.cos(th), sn = Math.sin(th);
  return { x: o.cx + o.R * sn, y: o.cy + o.tilt * c, z: o.cz + o.R * c, ry: wrapDeg(i * 24 + spin), rx: -7,
    s: o.s, op: 1, shade: 0.12 + 0.42 * (1 - c) / 2 };
}

// pos along the track (0 = site 1 in front)
function trackPos(t) {
  let p = 0;
  for (let k = 1; k < SITES.length; k++) p += E.inOutCubic(P(t, SITES[k].ta, SITES[k].tb));
  return p;
}
function pushBack(t) {
  let pb = 0;
  for (const c of CATS) pb = Math.max(pb, io(t, c.a - 0.35, 0.6, c.b - 0.5, 0.65, E.inOutCubic, E.inOutCubic));
  return pb;
}
function ringParams(t) {
  // intro: ring rises from below, spins; outro: ring returns, then flies away
  if (t < 40) {
    const rise = E.outCubic(P(t, 6.0, 7.8));
    return { cx: 960, cy: 560 + 1100 * (1 - rise), cz: -1150, R: 920, tilt: 120, s: 0.6, spin: -(t - 6) * 26 - 40 * (1 - rise) };
  }
  const away = E.inCubic(P(t, 71.5, 73.2));
  return { cx: 960, cy: 600 - 260 * away, cz: -1250 - 3800 * away, R: 920 + 400 * away, tilt: 120, s: 0.6,
    spin: (t - 65.2) * 22 + 60 * away * away };
}
function morph(t, i) {
  if (t < 40) return 1 - E.inOutCubic(P(t, 9.5 + i * 0.045, 11.0 + i * 0.045));
  return E.inOutCubic(P(t, 65.15 + i * 0.03, 66.8 + i * 0.03));
}
function ringDim(t) {
  if (t < 40) return 0.62 * (1 - E.inOutCubic(P(t, 8.3, 9.2)));
  return 0.78 * io(t, 66.2, 0.6, 71.3, 0.6, E.inOutCubic, E.inOutCubic);
}

// ---------- background canvases ----------
const bg = $('bg').getContext('2d');
const dust = $('dust').getContext('2d');
const rngD = mulberry32(42);
const DUST = Array.from({ length: 110 }, () => ({ x: (rngD() - .5) * 4200, y: (rngD() - .5) * 2600, z: rngD() * 3000, r: .6 + rngD() * 1.8, ph: rngD() * 6.28 }));
function floorSpeed(t) {
  // the floor glides forward, faster when the track moves
  let v = 0.35;
  for (const s of SITES) v += 2.2 * Math.sin(Math.PI * P(t, s.ta, s.tb));
  return v;
}
function floorOffset(t) {
  // integrate deterministically from 0 so any frame can be rendered independently
  const dt = 1 / 60; let o = 0;
  for (let x = 0; x < t; x += dt) o += floorSpeed(x) * dt;
  return o;
}
const floorCache = [];
function floorAt(t) {
  const key = Math.round(t * FPS);
  if (floorCache[key] === undefined) floorCache[key] = floorOffset(t);
  return floorCache[key];
}

function drawBg(t, gridOp) {
  bg.fillStyle = '#1b1a19'; bg.fillRect(0, 0, W, H);
  const g1x = 1250 + Math.sin(t * 0.15) * 160, g1y = 470 + Math.cos(t * 0.11) * 60;
  let g = bg.createRadialGradient(g1x, g1y, 0, g1x, g1y, 980);
  g.addColorStop(0, 'rgba(185,152,106,0.16)'); g.addColorStop(0.5, 'rgba(122,107,90,0.06)'); g.addColorStop(1, 'rgba(27,26,25,0)');
  bg.fillStyle = g; bg.fillRect(0, 0, W, H);
  g = bg.createRadialGradient(220, 980, 0, 220, 980, 900);
  g.addColorStop(0, 'rgba(181,102,84,0.10)'); g.addColorStop(1, 'rgba(181,102,84,0)');
  bg.fillStyle = g; bg.fillRect(0, 0, W, H);

  // perspective floor grid
  const hz = 700, vx = 960, vy = 330;
  bg.save();
  bg.beginPath(); bg.rect(0, hz, W, H - hz); bg.clip();
  const off = floorAt(t) % 1;
  for (let k = 0; k < 26; k++) {
    const zz = (k + 1 - off);            // depth units
    const y = hz + 900 / (zz * 0.55 + 0.25) - 900 / (26 * 0.55 + 0.25);
    if (y < hz || y > H) continue;
    const a = clamp((y - hz) / 300) * 0.16 * gridOp;
    bg.strokeStyle = `rgba(185,152,106,${a.toFixed(3)})`; bg.lineWidth = 1;
    bg.beginPath(); bg.moveTo(0, y); bg.lineTo(W, y); bg.stroke();
  }
  for (let k = -16; k <= 16; k++) {
    const xb = vx + k * 260;
    const vg = bg.createLinearGradient(0, hz, 0, H);
    vg.addColorStop(0, 'rgba(185,152,106,0)'); vg.addColorStop(1, `rgba(185,152,106,${(0.12 * gridOp).toFixed(3)})`);
    bg.strokeStyle = vg;
    bg.beginPath(); bg.moveTo(vx + (xb - vx) * ((hz - vy) / (H * 1.8 - vy)), hz); bg.lineTo(xb + (xb - vx) * 1.2, H * 1.8); bg.stroke();
  }
  bg.restore();
}
function drawDust(t, op) {
  dust.clearRect(0, 0, W, H);
  if (op <= 0) return;
  const camZ = floorAt(t) * 160;
  for (const p of DUST) {
    let z = ((p.z - camZ) % 3000 + 3000) % 3000 + 200;
    const sc = 1400 / z;
    const x = W / 2 + (p.x + Math.sin(t * 0.3 + p.ph) * 40) * sc, y = H / 2 + (p.y + Math.cos(t * 0.25 + p.ph) * 30) * sc;
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    const a = clamp((3200 - z) / 1200) * clamp((z - 200) / 300) * 0.55 * op * (0.6 + 0.4 * Math.sin(t * 1.3 + p.ph));
    dust.fillStyle = `rgba(214,190,150,${a.toFixed(3)})`;
    dust.beginPath(); dust.arc(x, y, p.r * sc * 0.9, 0, 6.283); dust.fill();
  }
}
const grainC = $('grain').getContext('2d');
const grainImg = grainC.createImageData(480, 270);
function drawGrain(t) {
  const r = mulberry32(Math.round(t * FPS) * 7 + 3);
  const d = grainImg.data;
  for (let i = 0; i < d.length; i += 4) { const v = r() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  grainC.putImageData(grainImg, 0, 0);
}

// ---------- render ----------
function renderPhones(t) {
  const pos = trackPos(t), pb = pushBack(t), rp = ringParams(t), dimR = ringDim(t);
  const flyFade = 1 - E.inQuad(P(t, 72.0, 73.0));
  phones.forEach((ph, i) => {
    const m = morph(t, i);
    let tr = trackXf(i - pos);
    tr = { ...tr, z: tr.z - 900 * pb, x: tr.x + 40 * pb, shade: Math.min(0.88, tr.shade + 0.72 * pb) };
    const rg = ringXf(i, rp.spin, rp); rg.shade = Math.min(0.9, rg.shade + dimR);
    // before the ring rises nothing is visible
    if (t < 6.0 || t > 73.1) { if (ph.shown) { ph.el.style.display = 'none'; ph.shown = false; } return; }
    const o = {};
    for (const key of ['x', 'y', 'z', 'rx', 's', 'op', 'shade']) o[key] = lerp(tr[key], rg[key], m);
    o.ry = lerp(tr.ry, rg.ry, m);
    o.op *= flyFade;
    // gentle float while on the track
    o.y += Math.sin(t * 1.1 + i * 1.7) * 7 * (1 - m);
    o.ry += Math.sin(t * 0.7 + i) * 2.2 * (1 - m);
    if (o.op < 0.01) { if (ph.shown) { ph.el.style.display = 'none'; ph.shown = false; } return; }
    if (!ph.shown) { ph.el.style.display = ''; ph.shown = true; }
    ph.el.style.opacity = o.op > 0.995 ? '' : o.op.toFixed(3);
    ph.el.style.transform = `translate3d(${(o.x - PH_W / 2).toFixed(2)}px,${(o.y - PH_H / 2).toFixed(2)}px,${o.z.toFixed(2)}px) rotateY(${o.ry.toFixed(3)}deg) rotateX(${o.rx.toFixed(3)}deg) scale(${o.s.toFixed(4)})`;
    ph.shade.style.opacity = o.shade.toFixed(3);
    const gx = 30 + o.ry * 1.4;
    ph.glare.style.background = `linear-gradient(105deg, rgba(255,255,255,0) ${gx}%, rgba(255,255,255,.10) ${gx + 10}%, rgba(255,255,255,0) ${gx + 26}%)`;
    // slow ken-burns while in focus
    const s = SITES[i];
    const kb = 1 + 0.035 * E.smooth(P(t, s.a - 0.4, s.b + 0.4));
    ph.img.style.transform = `scale(${kb.toFixed(4)})`;
    if (i === VIDEO_SITE) {
      const f = Math.max(0, Math.floor((t - (s.a - 0.5)) * FPS)) % CLIP_FRAMES;
      if (ph._f !== f) { clipCtx.drawImage(clipFrames[f], 0, 0, 540, 1004); ph._f = f; }
    }
  });
}

function renderTile(t) {
  if (t > 6.4) { tile.style.display = 'none'; return; }
  tile.style.display = '';
  const pin = E.outExpo(P(t, 0.15, 1.9));
  const spin = E.outCubic(P(t, 0.1, 2.4));
  const up = E.inOutCubic(P(t, 2.55, 3.35));
  const exit = E.inCubic(P(t, 5.45, 6.2));
  const x = 960, y = lerp(540, 268, up) - exit * 520;
  const z = lerp(-2600, 0, pin) - exit * 300;
  const ry = lerp(-520, 0, spin) + Math.sin(t * 0.9) * 8 * spin * (1 - up * 0.5) + exit * 160;
  const rx = lerp(28, 0, spin) + Math.sin(t * 0.7 + 1) * 4 * spin;
  const s = lerp(1, 0.42, up);
  tile.style.transform = `translate3d(${x - 180}px,${(y - 180).toFixed(2)}px,${z.toFixed(2)}px) rotateY(${ry.toFixed(3)}deg) rotateX(${rx.toFixed(3)}deg) scale(${s.toFixed(4)})`;
  const sw = P(t, 1.5, 2.5);
  tileSweep.style.background = `linear-gradient(115deg, rgba(255,255,255,0) ${-30 + sw * 160}%, rgba(255,255,255,.75) ${-18 + sw * 160}%, rgba(255,255,255,0) ${-6 + sw * 160}%)`;
}

function renderIntro(t) {
  const on = t < 9.0; $('intro').style.display = on ? '' : 'none'; if (!on) return;
  words($('iLabel'), 'Gprisma everyone', t, 3.0, 5.45, { stagger: 0.08, dy: 20 });
  words($('iH1'), 'PrismaX Community', t, 3.15, 5.5, { stagger: 0.11, dy: 60 });
  words($('iH2'), 'Website *Showcase', t, 3.35, 5.55, { stagger: 0.11, dy: 60 });
  const lv = io(t, 3.9, 0.5, 5.4, 0.35);
  st($('iLive'), { op: lv, y: (1 - lv) * 14 });
  $('iLive').querySelector('.dot').style.opacity = 0.55 + 0.45 * Math.sin(t * 7);
  // 15 websites
  words($('sA'), '~15 websites.', t, 6.05, 8.25, { stagger: 0.12, dy: 70, dur: 0.8 });
  words($('sB'), 'All built by the *community.', t, 6.55, 8.3, { stagger: 0.08, dy: 40 });
  words($('sC'), 'No official team. No big budget.', t, 7.05, 8.35, { stagger: 0.045, dy: 20 });
  words($('sD'), 'Just people who believed in PrismaX and Physical AI.', t, 7.35, 8.4, { stagger: 0.035, dy: 20 });
}

function renderCats(t) {
  const c = CATS.find(c => t > c.a - 0.4 && t < c.b + 0.2);
  $('cat').style.display = c ? '' : 'none';
  if (!c) return;
  const ci = CATS.indexOf(c);
  words($('cNum'), `Category 0${ci + 1}`, t, c.a + 0.05, c.b - 0.4, { stagger: 0.05, dy: 16 });
  words($('cTitle'), c.t, t, c.a + 0.12, c.b - 0.38, { stagger: 0.09, dy: 70 });
  words($('cSub'), `${c.n} websites`, t, c.a + 0.35, c.b - 0.42, { stagger: 0.05, dy: 14 });
  const ln = io(t, c.a + 0.25, 0.7, c.b - 0.45, 0.4, E.outCubic, E.inCubic);
  st($('cLine'), { op: ln, sx: ln });
}

function renderSite(t) {
  const on = t > CATS[0].b - 0.2 && t < OUTRO + 0.6;
  $('site').style.display = on ? '' : 'none';
  if (!on) { $('bigNum').style.visibility = 'hidden'; return; }
  const s = SITES.find(s => t >= s.a - 0.05 && t < s.b + 0.05) || null;
  const name = $('sName'), by = $('sBy'), desc = $('sDesc'), chipT = $('catChipT'), bar = $('catChip').querySelector('.bar');
  if (!s) { [name, by, desc, chipT].forEach(e => e.style.visibility = 'hidden'); bar.style.opacity = 0; $('bigNum').style.visibility = 'hidden'; }
  else {
    const c = CATS[s.cat];
    const chipIn = SITES[c.first].a + 0.15, chipOut = SITES[c.last].b - 0.45;
    words(chipT, c.chip, t, chipIn, chipOut, { stagger: 0.05, dy: 14 });
    const bp = io(t, chipIn, 0.6, chipOut, 0.35);
    bar.style.opacity = bp; bar.style.transform = `scaleX(${bp})`;
    words(name, s.n, t, s.a + 0.22, s.b - 0.45, { stagger: 0.09, dy: 60, dur: 0.8 });
    words(by, `^by ~${s.by}`, t, s.a + 0.5, s.b - 0.42, { stagger: 0.08, dy: 20 });
    words(desc, s.d, t, s.a + 0.68, s.b - 0.4, { stagger: 0.022, dy: 18, dur: 0.6 });
    const bn = $('bigNum');
    bn.textContent = String(s.i + 1).padStart(2, '0');
    const bo = io(t, s.a, 0.8, s.b - 0.5, 0.5, E.outCubic, E.inCubic);
    st(bn, { op: bo, x: (1 - bo) * -40 });
    bn.style.transform = `translateY(-50%) translateX(${((1 - bo) * -40).toFixed(1)}px)`;
  }
  // progress
  const pv = io(t, CATS[0].b - 0.2, 0.6, OUTRO - 0.4, 0.5) * (1 - 0.7 * pushBack(t));
  $('prog').style.opacity = pv; $('progLab').style.opacity = pv;
  const cur = SITES.findIndex(s => t < s.b) ;
  const ci = cur < 0 ? SITES.length - 1 : cur;
  $('progLab').textContent = `${String(ci + 1).padStart(2, '0')} / 15`;
  ticks.forEach((d, i) => {
    const s = SITES[i];
    const p = P(t, s.a, s.b);
    if (i < ci) { d.style.background = 'rgba(223,216,208,.55)'; d.style.width = '30px'; }
    else if (i === ci) { d.style.background = `linear-gradient(90deg, ${GOLD} ${p * 100}%, rgba(185,152,106,.35) ${p * 100}%)`; d.style.width = '64px'; }
    else { d.style.background = 'rgba(223,216,208,.16)'; d.style.width = '30px'; }
  });
}

function renderOutro(t) {
  const on = t > OUTRO; $('outro').style.display = on ? '' : 'none'; if (!on) return;
  words($('oA'), 'What stands out is the *range.', t, 66.35, 71.2, { stagger: 0.09, dy: 50 });
  words($('oB'), 'Some teach you how robots learn.', t, 67.6, 71.25, { stagger: 0.06, dy: 30 });
  words($('oC'), 'Some let you play.', t, 68.5, 71.3, { stagger: 0.07, dy: 30 });
  words($('oD'), 'Some celebrate the people behind it all.', t, 69.4, 71.35, { stagger: 0.06, dy: 30 });
  // end card
  const wm = E.outQuint(P(t, 72.5, 74.0));
  st($('endWm'), { op: P(t, 72.5, 72.9), s: lerp(1.08, 1, wm), blur: (1 - wm) * 18 });
  endWmSvg.style.clipPath = `inset(0 ${((1 - wm) * 100).toFixed(2)}% 0 0)`;
  words($('endT'), 'Community Website Showcase', t, 73.3, 99, { stagger: 0.06, dy: 16 });
  words($('endS'), '15 websites, built by the community for ~Physical ~AI.', t, 73.8, 99, { stagger: 0.04, dy: 16 });
}

function render(t) {
  const gridOp = clamp(P(t, 0.4, 2.5)) * (1 - 0.6 * E.inOutCubic(P(t, 72.0, 73.5)));
  drawBg(t, gridOp);
  drawDust(t, P(t, 0.6, 2.4));
  renderTile(t);
  renderPhones(t);
  renderIntro(t);
  renderCats(t);
  renderSite(t);
  renderOutro(t);
  const bt = io(t, CATS[0].a + 0.3, 0.8, OUTRO + 0.4, 0.6);
  $('brandTag').style.opacity = bt;
  // fade in from black / out at the end
  $('fade').style.opacity = Math.max(1 - P(t, 0, 0.5), E.inCubic(P(t, DURATION - 0.7, DURATION)));
  drawGrain(t);
}

window.render = render;
window.ready = (async () => {
  await document.fonts.ready;
  await Promise.all([...document.images, ...clipFrames].map(im => im.decode().catch(() => {})));
  await Promise.all(['40px "Instrument Serif"', 'italic 40px "Instrument Serif"', '500 40px "JB Mono"', '40px Inter'].map(f => document.fonts.load(f)));
  render(0);
  return true;
})();
})();
