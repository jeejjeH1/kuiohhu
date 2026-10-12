// On-page panel for manual mode. Injected by background.js each time the run's tab loads a link.
// It never clicks anything on X: it shows progress, watches whether *you* liked the tweet,
// and sends "next" / "stop" to the background.
(() => {
  document.getElementById('xal-overlay-host')?.remove();
  if (window.__xalCleanup) window.__xalCleanup();

  const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const font = (sub, w) => `@font-face{font-family:XalVaz;font-weight:${w};src:url(${chrome.runtime.getURL(`fonts/vazirmatn-${sub}-${w}.woff2`)}) format("woff2")}`;

  const host = document.createElement('div');
  host.id = 'xal-overlay-host';
  host.style.cssText = 'position:fixed;left:24px;bottom:24px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
  <style>
    ${font('arabic', 500)}${font('arabic', 900)}${font('latin', 500)}${font('latin', 900)}
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; }
    .p { position: relative; width: 300px; padding: 14px; border-radius: 22px; direction: rtl; color: #f4f2ff;
      font: 500 13px/1.5 XalVaz, Vazirmatn, Tahoma, sans-serif; overflow: hidden;
      background: radial-gradient(120% 90% at 100% 0%, rgba(255,46,126,.35), transparent 55%),
                  radial-gradient(120% 90% at 0% 100%, rgba(162,75,255,.35), transparent 55%), rgba(10,9,18,.92);
      border: 1px solid rgba(255,255,255,.12); box-shadow: 0 24px 60px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.08);
      backdrop-filter: blur(16px); animation: in .6s cubic-bezier(.22,1,.36,1) both; }
    @keyframes in { from { opacity: 0; transform: translateY(30px) scale(.94); } }
    .top { display: flex; align-items: center; gap: 12px; cursor: grab; user-select: none; }
    .top:active { cursor: grabbing; }
    .ring { position: relative; width: 62px; height: 62px; flex: none; }
    .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .ring circle { fill: none; stroke-width: 6; }
    .ring .tr { stroke: rgba(255,255,255,.1); }
    .ring .pr { stroke: url(#xg); stroke-linecap: round; stroke-dasharray: 100; transition: stroke-dashoffset .8s cubic-bezier(.22,1,.36,1);
      filter: drop-shadow(0 0 4px rgba(255,46,126,.7)); }
    .ring b { position: absolute; inset: 0; display: grid; place-items: center; font-weight: 900; font-size: 15px; }
    .left { font-size: 22px; font-weight: 900; line-height: 1.1;
      background: linear-gradient(120deg,#ff2e7e,#a24bff 55%,#2ad4ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .sub { color: #9a94b8; font-size: 12px; }
    .x { margin-right: auto; align-self: flex-start; width: 26px; height: 26px; border-radius: 9px; border: 0; cursor: pointer;
      background: rgba(255,255,255,.07); color: #9a94b8; font: 900 14px/1 sans-serif; transition: .25s; }
    .x:hover { background: rgba(255,77,94,.25); color: #fff; }
    .hint { margin: 12px 0 10px; padding: 8px 10px; border-radius: 12px; background: rgba(255,255,255,.05); display: flex; align-items: center; gap: 8px;
      transition: background .4s, color .4s; }
    .hint i { width: 18px; height: 18px; flex: none; }
    .hint i svg { width: 18px; height: 18px; fill: none; stroke: #9a94b8; stroke-width: 2; transition: .4s; }
    .hint.ok { background: rgba(255,46,126,.14); color: #ffd1e3; }
    .hint.ok i svg { fill: #ff2e7e; stroke: #ff2e7e; animation: pop .6s cubic-bezier(.34,1.56,.64,1); }
    @keyframes pop { 40% { transform: scale(1.6); } }
    .next { position: relative; overflow: hidden; width: 100%; height: 46px; border: 0; border-radius: 14px; cursor: pointer; color: #fff;
      font: 900 15px XalVaz, Vazirmatn, Tahoma, sans-serif; display: flex; align-items: center; justify-content: center; gap: 10px;
      background: linear-gradient(120deg,#ff2e7e,#a24bff 55%,#2ad4ff); background-size: 200% 100%;
      box-shadow: 0 10px 26px rgba(255,46,126,.35); transition: transform .3s cubic-bezier(.34,1.56,.64,1), background-position .6s; }
    .next:hover { transform: translateY(-2px); background-position: 100% 0; }
    .next:active { transform: scale(.97); }
    .next:disabled { opacity: .6; cursor: progress; }
    .next.glow { animation: glow 1.2s ease-in-out infinite; }
    @keyframes glow { 50% { box-shadow: 0 0 0 6px rgba(255,46,126,.25), 0 10px 30px rgba(255,46,126,.6); } }
    .next::after { content: ""; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.4) 50%, transparent 65%);
      transform: translateX(-120%); animation: shine 3s ease-in-out infinite; }
    @keyframes shine { 60%, 100% { transform: translateX(120%); } }
    kbd { font: 500 10.5px/1 XalVaz, monospace; padding: 3px 6px; border-radius: 6px; background: rgba(0,0,0,.25); direction: ltr; }
    .bar { height: 4px; border-radius: 4px; background: rgba(255,255,255,.08); margin-top: 10px; overflow: hidden; }
    .bar i { display: block; height: 100%; background: linear-gradient(90deg,#ff2e7e,#a24bff,#2ad4ff); transition: width .8s cubic-bezier(.22,1,.36,1); }
    .spark { position: absolute; width: 8px; height: 8px; border-radius: 50%; pointer-events: none; animation: spark .8s cubic-bezier(.22,1,.36,1) forwards; }
    @keyframes spark { to { transform: translate(var(--dx), var(--dy)) scale(.2); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  </style>
  <div class="p">
    <svg width="0" height="0" style="position:absolute"><defs><linearGradient id="xg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff2e7e"/><stop offset=".55" stop-color="#a24bff"/><stop offset="1" stop-color="#2ad4ff"/></linearGradient></defs></svg>
    <div class="top">
      <div class="ring"><svg viewBox="0 0 62 62"><circle class="tr" cx="31" cy="31" r="26"/><circle class="pr" cx="31" cy="31" r="26" pathLength="100"/></svg><b class="pos"></b></div>
      <div><div class="left"></div><div class="sub"></div></div>
      <button class="x" title="توقف">✕</button>
    </div>
    <div class="hint"><i><svg viewBox="0 0 24 24"><path d="M12 21.2s-7.6-4.6-9.9-9.3C.6 8.7 2.4 4.8 6.1 4.4c2.1-.2 3.9.9 5.9 3 2-2.1 3.8-3.2 5.9-3 3.7.4 5.5 4.3 4 7.5-2.3 4.7-9.9 9.3-9.9 9.3z"/></svg></i><span class="hintText"></span></div>
    <button class="next"><span class="nextText">بعدی</span><kbd>Alt+N</kbd></button>
    <div class="bar"><i></i></div>
  </div>`;
  document.documentElement.appendChild(host);

  const q = (s) => root.querySelector(s);
  const els = { pos: q('.pos'), left: q('.left'), sub: q('.sub'), pr: q('.pr'), hint: q('.hint'), hintText: q('.hintText'),
    next: q('.next'), nextText: q('.nextText'), bar: q('.bar i'), x: q('.x'), panel: q('.p'), top: q('.top') };

  let state = null;
  let liked = false;
  let autoTimer = null;

  function render(s) {
    state = s;
    if (!s?.running || s.mode !== 'manual') { cleanup(); return; }
    const total = s.queue.length;
    const i = s.index;
    const remaining = total - i - 1;
    els.pos.textContent = `${fa(i + 1)}/${fa(total)}`;
    els.left.textContent = remaining > 0 ? `${fa(remaining)} تا مونده` : 'آخریه!';
    els.sub.textContent = unf()
      ? `${fa(s.results.filter((r) => r.result === 'unfollowed').length)} آنفالو تا الان`
      : `${fa(s.results.filter((r) => r.result === 'liked').length)} لایک تا الان`;
    els.pr.style.strokeDashoffset = 100 - ((i + 1) / total) * 100;
    els.bar.style.width = `${(i / total) * 100}%`;
    els.nextText.textContent = remaining > 0 ? 'بعدی' : 'تمام';
    els.next.disabled = false;
    paintLiked();
  }

  function paintLiked() {
    els.hint.classList.toggle('ok', liked);
    els.next.classList.toggle('glow', liked);
    const verb = unf() ? 'آنفالو' : 'لایک';
    els.hintText.textContent = liked
      ? (state?.autoNext ? `${verb} شد ✓ می‌ریم بعدی…` : `${verb} شد ✓ حالا بزن «بعدی»`)
      : unf() ? 'دکمه‌ی Following را بزنید و آنفالو کنید، بعد «بعدی»' : 'توییت رو لایک کن، بعد بزن «بعدی»';
  }

  function sparkle() {
    for (let k = 0; k < 14; k++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const a = (Math.PI * 2 * k) / 14;
      s.style.cssText = `right:30px;top:76px;background:${['#ff2e7e', '#a24bff', '#2ad4ff'][k % 3]};--dx:${Math.cos(a) * 60}px;--dy:${Math.sin(a) * 40}px`;
      els.panel.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
  }

  const unf = () => state?.kind === 'unfollow';
  // Watch the focal tweet's like button / the profile's follow button (read-only).
  const statusId = () => state?.queue?.[state.index]?.match(/status\/(\d+)/)?.[1];
  function isLiked() {
    if (unf()) {
      const h = document.querySelector('[data-testid="placementTracking"]');
      return !!h?.querySelector('[data-testid$="-follow"]') && !h.querySelector('[data-testid$="-unfollow"]');
    }
    const id = statusId();
    if (!id) return false;
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const a = articles.find((x) => x.querySelector(`a[href*="/status/${id}"] time`)) || articles.find((x) => x.getAttribute('tabindex') === '-1');
    return !!a?.querySelector('[data-testid="unlike"]');
  }
  const poll = setInterval(() => {
    if (!state) return;
    const now = isLiked();
    if (now !== liked) {
      liked = now;
      paintLiked();
      if (liked) {
        sparkle();
        if (state.autoNext && !autoTimer) autoTimer = setTimeout(goNext, 900);
      } else if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    }
  }, 300);

  function goNext() {
    els.next.disabled = true;
    chrome.runtime.sendMessage({ type: 'next' });
  }
  els.next.addEventListener('click', goNext);
  els.x.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'stop' }));

  // drag the panel by its header
  els.top.addEventListener('pointerdown', (e) => {
    if (e.target === els.x) return;
    const sx = e.clientX, sy = e.clientY;
    const r = host.getBoundingClientRect();
    const move = (ev) => {
      host.style.left = `${Math.max(0, Math.min(innerWidth - r.width, r.left + ev.clientX - sx))}px`;
      host.style.top = `${Math.max(0, Math.min(innerHeight - r.height, r.top + ev.clientY - sy))}px`;
      host.style.bottom = 'auto';
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });

  const onChange = (changes, area) => { if (area === 'local' && changes.runState) render(changes.runState.newValue); };
  chrome.storage.onChanged.addListener(onChange);
  function cleanup() {
    clearInterval(poll);
    if (autoTimer) clearTimeout(autoTimer);
    chrome.storage.onChanged.removeListener(onChange);
    host.remove();
    window.__xalCleanup = null;
  }
  window.__xalCleanup = cleanup;
  chrome.storage.local.get('runState').then(({ runState }) => render(runState));
})();
