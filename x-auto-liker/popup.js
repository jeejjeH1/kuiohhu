const MAX_LINKS = 30;

const $ = (id) => document.getElementById(id);
const els = {
  links: $('links'), count: $('count'), counter: $('counter'), countBar: $('countBar'), clear: $('clear'), warn: $('warn'),
  preOut: $('preOut'), delayOut: $('delayOut'), est: $('est'), timeline: $('timeline'), closeTab: $('closeTab'),
  start: $('start'), stop: $('stop'), back: $('back'), pill: $('pill'), pillText: $('pillText'),
  viewSetup: $('viewSetup'), viewRun: $('viewRun'),
  ringTotal: $('ringTotal'), ringPhase: $('ringPhase'), bigHeart: $('bigHeart'), phaseNum: $('phaseNum'), phaseLabel: $('phaseLabel'),
  progText: $('progText'), statusText: $('statusText'), queue: $('queue'),
  stLiked: $('stLiked'), stAlready: $('stAlready'), stError: $('stError'), stAlreadyLabel: $('stAlreadyLabel'),
  modes: $('modes'), manualCard: $('manualCard'), autoCard: $('autoCard'), autoNext: $('autoNext'),
  closeTabManual: $('closeTabManual'), startText: $('startText'), next: $('next'), nextText: $('nextText'),
  navtabs: $('navtabs'), viewTools: $('viewTools'), stLikedLabel: $('stLikedLabel'),
};

/* ───────────── top tabs + tools ───────────── */
let navTab = 'like';
try { navTab = localStorage.getItem('navTab') || 'like'; } catch { /* storage blocked */ }
function setNav(t) {
  navTab = t;
  try { localStorage.setItem('navTab', t); } catch { /* ignore */ }
  const shown = t === 'manage' ? 'tools' : t;
  els.navtabs.dataset.tab = shown;
  els.navtabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === shown));
  document.documentElement.classList.toggle('wide', t === 'manage');
  render(state);
}
// the wide embedded view shows one of the extension pages inside the window
let embedSrc = 'pages/following.html?embed=1';
function openManage(src = 'pages/following.html?embed=1') {
  const fr = $('manageFrame');
  if (fr.getAttribute('src') !== src) fr.setAttribute('src', src);
  embedSrc = src;
  try { localStorage.setItem('embedSrc', src); } catch { /* ignore */ }
  setNav('manage');
}
$('openManage').addEventListener('click', () => openManage('pages/following.html?embed=1'));
$('openAi').addEventListener('click', () => openManage('pages/ai.html?embed=1'));
$('openPro').addEventListener('click', () => openManage('pages/pro.html?embed=1'));
$('openBackup').addEventListener('click', () => openManage('pages/backup.html?embed=1'));
$('manageBack').addEventListener('click', () => setNav('tools'));
els.navtabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setNav(b.dataset.tab)));

const TOOL_DEFAULTS = { persianFont: true, rtlFix: true, tweetMenu: true, composer: true, translate: true };
chrome.storage.local.get('tools').then(({ tools }) => {
  const t = { ...TOOL_DEFAULTS, ...tools };
  document.querySelectorAll('[data-tool]').forEach((cb) => {
    cb.checked = !!t[cb.dataset.tool];
    cb.addEventListener('change', async () => {
      const { tools: cur } = await chrome.storage.local.get('tools');
      chrome.storage.local.set({ tools: { ...TOOL_DEFAULTS, ...cur, [cb.dataset.tool]: cb.checked } });
    });
  });
});
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL(b.dataset.open) })));

/* ───────────── mode switch ───────────── */
let mode = 'manual';
function setMode(m) {
  mode = m;
  els.modes.dataset.mode = m;
  els.modes.querySelectorAll('.mode').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === m));
  els.manualCard.hidden = m !== 'manual';
  els.autoCard.hidden = m !== 'auto';
  els.startText.textContent = m === 'manual' ? 'شروع' : 'شروع لایک خودکار';
}
els.modes.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.mode); saveSettings(); }));

const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const secRange = (lo, hi) => (lo === hi ? `${fa(lo)} ثانیه` : `${fa(lo)} تا ${fa(hi)} ثانیه`);

// Pulls tweet URLs out of free text, normalizes them to x.com and dedupes by status id.
// Accepts status links (x.com/user/status/ID) and intent links (x.com/intent/like?tweet_id=ID),
// with or without https://. Intent links become x.com/i/status/ID, which X redirects to the tweet.
function parseLinks(text) {
  const re = /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:([A-Za-z0-9_]+)\/status(?:es)?\/(\d+)|intent\/(?:like|favorite)\?(?:[^\s]*&)?tweet_id=(\d+))/g;
  const seen = new Set();
  const out = [];
  for (const m of text.matchAll(re)) {
    const id = m[2] || m[3];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(m[2] ? `https://x.com/${m[1]}/status/${id}` : `https://x.com/i/status/${id}`);
  }
  return out;
}

/* ───────────── dual range slider ───────────── */
function dualRange(root, onChange) {
  const lo = root.querySelector('.lo');
  const hi = root.querySelector('.hi');
  const fill = root.querySelector('.fill');
  const min = Number(lo.min);
  const max = Number(lo.max);
  const pct = (v) => ((v - min) / (max - min)) * 100;

  function paint() {
    fill.style.left = `${pct(Number(lo.value))}%`;
    fill.style.right = `${100 - pct(Number(hi.value))}%`;
    // keep the thumb you can still drag on top when both sit at the far end
    lo.style.zIndex = Number(lo.value) >= max - 1 ? 3 : 2;
  }
  lo.addEventListener('input', () => {
    if (Number(lo.value) > Number(hi.value)) hi.value = lo.value;
    paint(); onChange();
  });
  hi.addEventListener('input', () => {
    if (Number(hi.value) < Number(lo.value)) lo.value = hi.value;
    paint(); onChange();
  });
  return {
    get: () => [Number(lo.value), Number(hi.value)],
    set: (a, b) => { lo.value = a; hi.value = b; paint(); },
  };
}

const preRange = dualRange($('preRange'), onTimingChange);
const delayRange = dualRange($('delayRange'), onTimingChange);

/* ───────────── setup view ───────────── */
let lastCount = -1;
function updateCount() {
  const n = parseLinks(els.links.value).length;
  if (n !== lastCount) {
    els.count.textContent = fa(n);
    els.count.classList.remove('bump'); void els.count.offsetWidth; els.count.classList.add('bump');
    lastCount = n;
  }
  els.counter.classList.toggle('over', n > MAX_LINKS);
  els.countBar.style.width = `${Math.min(100, (n / MAX_LINKS) * 100)}%`;
  showWarn(n > MAX_LINKS ? `حداکثر ${fa(MAX_LINKS)} لینک — الان ${fa(n)} تاست.` : '');
  updateEstimate(n);
}

function showWarn(msg) {
  els.warn.textContent = msg;
  els.warn.classList.toggle('show', !!msg);
}

function updateEstimate(n = parseLinks(els.links.value).length) {
  const [pa, pb] = preRange.get();
  const [da, db] = delayRange.get();
  const LOAD = 3; // rough seconds for X to load a tweet
  const total = n ? n * (LOAD + (pa + pb) / 2 + 1) + (n - 1) * ((da + db) / 2) : 0;
  els.est.textContent = n ? `≈ ${total >= 90 ? `${fa(Math.round(total / 60))} دقیقه` : `${fa(Math.round(total))} ثانیه`}` : '—';
}

function onTimingChange() {
  const [pa, pb] = preRange.get();
  const [da, db] = delayRange.get();
  els.preOut.textContent = secRange(pa, pb);
  els.delayOut.textContent = secRange(da, db);
  // timeline preview: segment widths follow the average times
  els.timeline.querySelector('.seg-read').style.flexGrow = Math.max(0.6, (pa + pb) / 2);
  els.timeline.querySelector('.seg-wait').style.flexGrow = Math.max(0.6, (da + db) / 2);
  els.timeline.querySelector('.seg-open').style.flexGrow = 3;
  updateEstimate();
  saveSettings();
}

function saveSettings() {
  const [preMin, preMax] = preRange.get();
  const [delayMin, delayMax] = delayRange.get();
  chrome.storage.local.set({
    settings: {
      linksText: els.links.value, preMin, preMax, delayMin, delayMax, closeTab: els.closeTab.checked,
      mode, autoNext: els.autoNext.checked,
    },
  });
}

els.links.addEventListener('input', () => { updateCount(); saveSettings(); });
// one "close tab" setting, shown in both mode cards
els.closeTab.addEventListener('change', () => { els.closeTabManual.checked = els.closeTab.checked; saveSettings(); });
els.closeTabManual.addEventListener('change', () => { els.closeTab.checked = els.closeTabManual.checked; saveSettings(); });
els.autoNext.addEventListener('change', saveSettings);
els.clear.addEventListener('click', () => { els.links.value = ''; updateCount(); saveSettings(); els.links.focus(); });

els.start.addEventListener('click', async (e) => {
  ripple(e);
  const links = parseLinks(els.links.value);
  if (links.length === 0) return showWarn('هیچ لینک معتبری پیدا نشد.');
  if (links.length > MAX_LINKS) return showWarn(`حداکثر ${fa(MAX_LINKS)} لینک مجاز است.`);
  const [preMin, preMax] = preRange.get();
  const [delayMin, delayMax] = delayRange.get();
  saveSettings();
  const r = els.start.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, 40);
  await chrome.runtime.sendMessage({
    type: 'start', mode, autoNext: els.autoNext.checked, links, closeTab: els.closeTab.checked,
    preMinMs: preMin * 1000, preMaxMs: preMax * 1000, delayMinMs: delayMin * 1000, delayMaxMs: delayMax * 1000,
  });
});

els.stop.addEventListener('click', (e) => { ripple(e); chrome.runtime.sendMessage({ type: 'stop' }); });
els.next.addEventListener('click', (e) => { ripple(e); chrome.runtime.sendMessage({ type: 'next' }); });
els.back.addEventListener('click', async () => {
  const { runState } = await chrome.storage.local.get('runState');
  chrome.storage.local.set({ runState: { ...runState, dismissed: true } });
});

/* ───────────── run view ───────────── */
const PHASES = {
  opening: { label: 'در حال باز کردن توییت…', color: '#ffffff', spin: true },
  reading: { label: 'صبر قبل از لایک', color: '#2ad4ff' },
  liking: { label: 'در حال لایک…', color: '#ff2e7e', spin: true },
  waiting: { label: 'تا توییت بعدی', color: '#a24bff' },
  manual: { label: 'لایک کن و بزن «بعدی»', color: '#ff2e7e' },
  done: { label: 'همه انجام شد!', color: '#2fe39a' },
  stopped: { label: 'متوقف شد', color: '#ff4d5e' },
};

let state = null;
let queueKey = '';
let prev = { results: null, phase: null };

function labelFor(url) {
  const m = url.match(/x\.com\/([^/]+)\/status\/(\d+)/);
  if (!m) return `@${XAL_esc(url.split('/').pop())}`;
  const tail = `…${m[2].slice(-5)}`;
  return m[1] === 'i' ? `tweet <i>${tail}</i>` : `@${m[1]} <i>${tail}</i>`;
}

const XAL_esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function buildQueue(queue) {
  els.queue.innerHTML = '';
  queue.forEach((url, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--i', i);
    li.innerHTML = `<span class="idx">${fa(i + 1)}</span><span class="name">${labelFor(url)}</span><span class="ico"></span>`;
    els.queue.appendChild(li);
  });
}

function setCount(el, n) {
  const txt = fa(n);
  if (el.textContent !== txt) {
    el.textContent = txt;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
}

function render(s) {
  state = s;
  const showRun = !!s && (s.running || ((s.phase === 'done' || s.phase === 'stopped') && !s.dismissed));
  els.viewTools.classList.toggle('is-active', navTab === 'tools');
  $('viewManage').classList.toggle('is-active', navTab === 'manage');
  els.viewSetup.classList.toggle('is-active', navTab === 'like' && !showRun);
  els.viewRun.classList.toggle('is-active', navTab === 'like' && showRun);
  els.pill.classList.toggle('is-running', !!s?.running);
  els.pill.classList.toggle('is-done', !!s && !s.running && s.phase === 'done');
  els.pillText.textContent = s?.running ? 'در حال اجرا' : (s?.phase === 'done' && showRun ? 'تمام شد' : 'آماده');
  if (!showRun || !s.queue) { prev = { results: null, phase: null }; return; }

  const key = s.queue.join('|');
  if (key !== queueKey) { queueKey = key; buildQueue(s.queue); }

  const results = s.results || [];
  const total = s.queue.length;
  const done = results.length;
  const finished = !s.running;

  [...els.queue.children].forEach((li, i) => {
    const r = results[i];
    li.className = '';
    if (r) {
      li.classList.add('is-done', `r-${r.result}`);
      li.querySelector('.ico').textContent = { liked: '♥', unfollowed: '✓', already: '✓', skipped: '–' }[r.result] || '!';
      if (r.result === 'unfollowed') li.classList.replace('r-unfollowed', 'r-liked');
      li.title = r.detail || '';
    } else if (!finished && i === s.index) {
      li.classList.add('is-current');
    }
  });
  if (s.phase !== prev.phase) {
    if (finished) els.viewRun.scrollTo({ top: 0, behavior: 'smooth' });
    else els.queue.children[s.index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const count = (k) => results.filter((r) => r.result === k).length;
  const manual = s.mode === 'manual';
  const unf = s.kind === 'unfollow';
  setCount(els.stLiked, count(unf ? 'unfollowed' : 'liked'));
  els.stLikedLabel.textContent = unf ? 'آنفالو شد' : 'لایک شد';
  setCount(els.stAlready, count(manual ? 'skipped' : 'already'));
  els.stAlreadyLabel.textContent = manual ? 'رد شد' : unf ? 'فالو نبود' : 'از قبل';
  setCount(els.stError, count('error'));

  els.ringTotal.style.strokeDashoffset = 1000 * (1 - (total ? done / total : 0));
  els.progText.textContent = `${fa(Math.min(done + (finished ? 0 : 1), total))} از ${fa(total)}`;
  els.statusText.textContent = finished ? s.statusText || '' : '';

  const ph = PHASES[s.phase] || PHASES.opening;
  els.phaseLabel.textContent = unf
    ? ({ manual: 'آنفالو کن و بزن «بعدی»', reading: 'صبر قبل از آنفالو', liking: 'در حال آنفالو…', waiting: 'تا نفر بعدی' }[s.phase] || ph.label)
    : ph.label;
  els.ringPhase.style.setProperty('--phase-c', ph.color);
  els.ringPhase.classList.toggle('indeterminate', !!ph.spin);
  els.bigHeart.classList.toggle('on', ['waiting', 'done', 'liking', 'manual'].includes(s.phase));
  els.bigHeart.classList.toggle('beating', s.phase === 'liking');

  els.stop.hidden = finished;
  els.back.hidden = !finished;
  els.next.hidden = finished || !manual;
  els.nextText.textContent = s.index >= total - 1 ? 'تمام' : 'بعدی';

  // celebrate only what happens while the popup is open
  if (prev.results !== null && results.length > prev.results) {
    const last = results[results.length - 1];
    if (last.result === 'liked' || last.result === 'unfollowed') heartBurst();
  }
  if (prev.phase && prev.phase !== 'done' && s.phase === 'done') confetti();
  prev = { results: results.length, phase: s.phase };
}

function heartBurst() {
  els.bigHeart.classList.remove('pop'); void els.bigHeart.offsetWidth; els.bigHeart.classList.add('pop');
  const r = els.bigHeart.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, 46, true);
}

// per-frame countdown for the inner ring
function tick() {
  const s = state;
  if (s && els.viewRun.classList.contains('is-active')) {
    if (s.running && s.phaseEnd && (s.phase === 'reading' || s.phase === 'waiting')) {
      const span = Math.max(1, s.phaseEnd - s.phaseStart);
      const left = Math.max(0, s.phaseEnd - Date.now());
      els.ringPhase.style.strokeDashoffset = 1000 * (1 - left / span);
      els.ringPhase.classList.toggle('empty', left <= 0);
      els.phaseNum.innerHTML = `${fa(Math.ceil(left / 1000))}<small> ث</small>`;
    } else if (s.running && s.phase === 'manual') {
      const left = s.queue.length - s.index - 1;
      els.ringPhase.classList.remove('empty');
      els.ringPhase.style.strokeDashoffset = 1000 * (1 - (s.index + 1) / s.queue.length);
      els.phaseNum.innerHTML = left > 0 ? `${fa(left)}<small> مونده</small>` : '<small>آخری!</small>';
    } else if (s.phase === 'done' || s.phase === 'stopped') {
      els.ringPhase.classList.remove('empty');
      els.ringPhase.style.strokeDashoffset = 0;
      els.phaseNum.textContent = s.phase === 'done' ? '✓' : '■';
    } else {
      els.ringPhase.classList.remove('empty');
      els.ringPhase.style.strokeDashoffset = 0;
      els.phaseNum.textContent = '';
    }
  }
  requestAnimationFrame(tick);
}

/* ───────────── motion fx (canvas particles) ───────────── */
const fx = $('fx');
const ctx = fx.getContext('2d');
const particles = [];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = ['#ff2e7e', '#ff79b0', '#a24bff', '#2ad4ff', '#ffffff'];

function sizeCanvas() {
  const dpr = devicePixelRatio || 1;
  fx.width = innerWidth * dpr; fx.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeCanvas();
addEventListener('resize', sizeCanvas);

function heartPath(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y + s * 0.3);
  c.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  c.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  c.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  c.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  c.fill();
}

function burst(x, y, n, hearts = false) {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 2 + Math.random() * 5;
    particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, g: 0.12, life: 1, decay: 0.015 + Math.random() * 0.02,
      size: hearts && i % 3 === 0 ? 8 + Math.random() * 6 : 2 + Math.random() * 3,
      heart: hearts && i % 3 === 0, color: COLORS[(Math.random() * COLORS.length) | 0], rot: 0, vr: 0,
    });
  }
  // shockwave ring
  particles.push({ ring: true, x, y, r: 6, life: 1, decay: 0.035 });
}

function confetti() {
  if (reduceMotion) return;
  for (let i = 0; i < 140; i++) {
    particles.push({
      x: Math.random() * innerWidth, y: -10 - Math.random() * 120, vx: (Math.random() - 0.5) * 2.5, vy: 2 + Math.random() * 3,
      g: 0.04, life: 1, decay: 0.005 + Math.random() * 0.006, size: 4 + Math.random() * 5, rect: true,
      color: COLORS[(Math.random() * COLORS.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    });
  }
}

function animateFx() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.max(0, p.life);
    if (p.ring) {
      p.r += 4;
      ctx.strokeStyle = '#ff2e7e'; ctx.lineWidth = 3 * p.life;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      continue;
    }
    p.vy += p.g; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    ctx.fillStyle = p.color;
    if (p.heart) heartPath(ctx, p.x, p.y, p.size);
    else if (p.rect) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
    } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(animateFx);
}

function ripple(e) {
  const btn = e.currentTarget;
  const r = btn.getBoundingClientRect();
  const size = Math.max(r.width, r.height);
  const span = document.createElement('span');
  span.className = 'ripple';
  span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  btn.appendChild(span);
  setTimeout(() => span.remove(), 700);
}

/* ───────────── init ───────────── */
async function init() {
  const { settings = {}, runState } = await chrome.storage.local.get(['settings', 'runState']);
  els.links.value = settings.linksText ?? '';
  els.closeTab.checked = settings.closeTab ?? true;
  els.closeTabManual.checked = els.closeTab.checked;
  els.autoNext.checked = settings.autoNext ?? false;
  setMode(settings.mode ?? 'manual');
  // older versions stored a single delay + random extra
  const dMin = settings.delayMin ?? settings.delay ?? 8;
  const dMax = settings.delayMax ?? (settings.delay != null ? settings.delay + (settings.jitter ?? 0) : 15);
  preRange.set(settings.preMin ?? 2, settings.preMax ?? 5);
  delayRange.set(Math.min(dMin, 120), Math.min(dMax, 120));
  onTimingChange();
  updateCount();
  state = runState;
  if (navTab === 'manage') { let s = 'pages/following.html?embed=1'; try { s = localStorage.getItem('embedSrc') || s; } catch { /* ignore */ } openManage(s); } else setNav(navTab);
  requestAnimationFrame(tick);
  requestAnimationFrame(animateFx);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.runState) render(changes.runState.newValue);
});

init();

// Language toggle (Persian <-> English). Every page and the X-page UI follow the stored value.
(() => {
  const btn = document.getElementById('langBtn');
  const show = (l) => { btn.textContent = l === 'en' ? 'فا' : 'EN'; };
  chrome.storage.local.get('lang').then(({ lang }) => show(lang || 'fa'));
  btn.addEventListener('click', async () => {
    const { lang } = await chrome.storage.local.get('lang');
    const next = (lang || 'fa') === 'en' ? 'fa' : 'en';
    await chrome.storage.local.set({ lang: next });
    show(next);
  });
})();
