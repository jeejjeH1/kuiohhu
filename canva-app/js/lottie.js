// Animated emoji (Noto Emoji, Apache-2.0) played with lottie-web (MIT).
// Frames are drawn from lottie-web's canvas renderer, so they also work for video export.
export const ANIM_EMOJI = [
  '1f600', '1f602', '1f60d', '1f970', '1f60e', '1f929', '1f973', '1f609', '1f44d', '1f44f', '1f64c', '1f525',
  '2764', '1f496', '2728', '2b50', '1f389', '1f38a', '1f381', '1f388', '1f382', '1f680', '1f4a1', '1f3af',
  '1f4af', '2705', '274c', '1f44b', '1f92f', '1f631', '1f60a', '1f614', '1f648', '1f4aa', '1f308', '2600',
  '1f319', '26a1', '1f30a', '1f338', '1f98b', '1f431', '1f47b', '1f916', '1f47d', '1f4c8', '1f6d2',
];

const players = new Map();

function fetchJSON(code) {
  // Bundled first (works offline); the Google CDN is a fallback for emoji not bundled.
  return fetch(`data/lottie/${code}.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .catch(() => fetch(`https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/lottie.json`).then((r) => r.json()));
}

export function ensureLottie(code, onReady) {
  if (players.has(code)) return players.get(code);
  const entry = { anim: null, container: null, loading: true };
  players.set(code, entry);
  fetchJSON(code).then((data) => {
    if (!window.lottie) throw new Error('lottie-web not loaded');
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-99999px;top:0;width:512px;height:512px;pointer-events:none';
    document.body.append(container);
    entry.container = container;
    entry.anim = window.lottie.loadAnimation({
      container, renderer: 'canvas', loop: false, autoplay: false, animationData: data,
      rendererSettings: { clearCanvas: true, dpr: 1, preserveAspectRatio: 'xMidYMid meet' },
    });
    entry.loading = false;
    onReady?.();
  }).catch(() => { entry.failed = true; entry.loading = false; });
  return entry;
}

// Draws the emoji frame for local time t (ms) into ctx at (x, y, w, h), centred.
// Returns false if the animation is not ready (caller should draw a fallback).
export function drawLottie(ctx, code, t, w, h, onReady) {
  const e = ensureLottie(code, onReady);
  if (!e.anim) return false;
  const total = e.anim.totalFrames || 1;
  const frame = t == null ? 0 : Math.floor((t / 1000) * (e.anim.frameRate || 60)) % total;
  e.anim.goToAndStop(frame, true);
  const src = e.container.querySelector('canvas');
  if (!src) return false;
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
  return true;
}

// Loads every animated emoji used in a design before export (times out per emoji).
export function evaluateLottieAll(design) {
  const codes = new Set();
  for (const p of design.pages) for (const e of p.elements) if (e.type === 'lottie') codes.add(e.code);
  return Promise.all([...codes].map((c) => new Promise((res) => {
    const e = ensureLottie(c, res);
    if (e.anim) res();
    const t = setTimeout(res, 8000);
    const iv = setInterval(() => { if (e.anim || e.failed) { clearTimeout(t); clearInterval(iv); res(); } }, 50);
  })));
}
