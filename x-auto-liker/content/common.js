// Shared helpers for the on-page tools (isolated world). Every content script hangs off window.XAL.
(() => {
  const XAL = (window.XAL = window.XAL || {});

  XAL.fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  XAL.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  XAL.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  XAL.uid = () => Math.random().toString(36).slice(2, 10);
  XAL.FA_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g;
  XAL.LATIN_RE = /[A-Za-z]/g;
  XAL.isRtlText = (t) => {
    const fa = (t.match(XAL.FA_RE) || []).length;
    const la = (t.match(XAL.LATIN_RE) || []).length;
    return fa > 0 && fa >= la * 0.6;
  };
  // "1,234" / "۱٬۲۳۴" / "1.2K" → number
  XAL.parseNum = (s) => {
    if (!s) return 0;
    const t = String(s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    const m = t.match(/(\d[\d,٬.]*)\s*([KkMm]|هزار|میلیون)?/);
    if (!m) return 0;
    let n = parseFloat(m[1].replace(/[,٬]/g, ''));
    if (/[Kk]|هزار/.test(m[2] || '')) n *= 1e3;
    if (/[Mm]|میلیون/.test(m[2] || '')) n *= 1e6;
    return Math.round(n);
  };

  /* ── settings ───────────────────── */
  XAL.tools = { persianFont: true, rtlFix: true, tweetMenu: true, composer: true, translate: true };
  const listeners = [];
  XAL.onTools = (fn) => { listeners.push(fn); fn(XAL.tools); };
  chrome.storage.local.get('tools').then(({ tools }) => {
    Object.assign(XAL.tools, tools);
    listeners.forEach((fn) => fn(XAL.tools));
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.tools) { Object.assign(XAL.tools, c.tools.newValue); listeners.forEach((fn) => fn(XAL.tools)); }
  });

  /* ── fonts (loaded from the extension as buffers, so X's CSP can't block them) ───── */
  const AR = 'U+0600-06FF, U+0750-077F, U+200C-200E, U+2010-2011, U+FB50-FDFF, U+FE70-FEFF';
  const LA = 'U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2122, U+2212, U+FEFF';
  XAL.fontsReady = (async () => {
    const load = async (family, sub, w, range) => {
      const buf = await (await fetch(chrome.runtime.getURL(`fonts/vazirmatn-${sub}-${w}.woff2`))).arrayBuffer();
      const f = new FontFace(family, buf, { weight: String(w), unicodeRange: range });
      await f.load();
      document.fonts.add(f);
    };
    const jobs = [];
    for (const w of [400, 500, 700, 900]) {
      jobs.push(load('XalFa', 'arabic', w, AR)); // Persian glyphs only: safe to put first in any font stack
      jobs.push(load('XalVaz', 'arabic', w, AR), load('XalVaz', 'latin', w, LA)); // full family for our own UI
    }
    await Promise.allSettled(jobs);
  })();

  /* ── messaging ───────────────────── */
  XAL.bg = (msg) => chrome.runtime.sendMessage(msg);
  XAL.fetchDataURL = async (url) => (await XAL.bg({ type: 'fetchDataURL', url }))?.dataURL;
  XAL.download = (url, filename) => XAL.bg({ type: 'download', url, filename });
  XAL.openPage = (page) => XAL.bg({ type: 'openPage', page });

  /* ── X page readers ───────────────────── */
  // Your username. X changes its markup, so try several places; the first that gives a plain handle wins.
  const NOT_HANDLE = new Set(['home', 'explore', 'notifications', 'messages', 'i', 'search', 'settings', 'compose', 'login', 'logout', 'bookmarks', 'lists', 'communities', 'premium', 'jobs', 'tos', 'privacy']);
  const plainHandle = (href) => {
    const m = (href || '').match(/^\/?([A-Za-z0-9_]{1,15})\/?$/);
    return m && !NOT_HANDLE.has(m[1].toLowerCase()) ? m[1] : null;
  };
  XAL._hookMe = null;
  XAL.me = () => {
    const links = [
      'a[data-testid="AppTabBar_Profile_Link"]',
      'nav a[aria-label*="Profile" i]', 'nav a[aria-label*="پروفایل"]',
      'a[data-testid="AppTabBar_Profile_Link"]', 'header a[href^="/"][role="link"][aria-label*="rofile" i]',
    ];
    for (const sel of links) {
      for (const a of document.querySelectorAll(sel)) { const h = plainHandle(a.getAttribute('href')); if (h) return h; }
    }
    const sw = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')?.textContent || '';
    const m = sw.match(/@([A-Za-z0-9_]{1,15})/);
    if (m) return m[1];
    return XAL._hookMe;
  };
  // Mobile layout has none of those links, so also ask X's own page state who is signed in (retry while it loads).
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.__xal === 'me' && e.data.handle) {
      XAL._hookMe = e.data.handle;
      chrome.storage.local.set({ me: e.data.handle }); // keep it for the extension window
    }
  });
  let asked = 0;
  const askMe = () => {
    if (XAL.me() || asked++ > 25) return;
    window.postMessage({ __xal: 'whoami' }, location.origin);
    setTimeout(askMe, 1500);
  };
  askMe();

  // Text of a node with emoji <img alt> turned back into characters and links kept readable.
  XAL.richText = (el) => {
    if (!el) return '';
    let out = '';
    const walk = (n) => {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.tagName === 'IMG') out += n.alt || '';
      else if (n.tagName === 'BR') out += '\n';
      else n.childNodes.forEach(walk);
    };
    walk(el);
    return out.replace(/…$/, '').trim();
  };

  XAL.tweetInfo = (article) => {
    const timeA = article.querySelector('a[href*="/status/"] time')?.closest('a');
    const href = timeA?.getAttribute('href') || '';
    const m = href.match(/^\/([^/]+)\/status\/(\d+)/);
    const nameBox = article.querySelector('[data-testid="User-Name"]');
    const name = nameBox ? XAL.richText(nameBox.querySelector('a span') || nameBox.querySelector('span')) : '';
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const photos = [...article.querySelectorAll('[data-testid="tweetPhoto"] img')]
      .map((i) => i.src).filter((s) => s.includes('pbs.twimg.com/media'));
    const metric = (id) => XAL.parseNum(article.querySelector(`[data-testid="${id}"]`)?.getAttribute('aria-label'));
    return {
      id: m?.[2] || null,
      handle: m?.[1] || '',
      url: m ? `https://x.com/${m[1]}/status/${m[2]}` : location.href,
      name,
      text: XAL.richText(textEl),
      lang: textEl?.getAttribute('lang') || '',
      time: article.querySelector('time')?.getAttribute('datetime') || '',
      avatar: article.querySelector('[data-testid="Tweet-User-Avatar"] img')?.src || '',
      verified: !!nameBox?.querySelector('[data-testid="icon-verified"]'),
      photos,
      hasVideo: !!article.querySelector('[data-testid="videoPlayer"], [data-testid="videoComponent"], video'),
      replies: metric('reply'),
      reposts: metric('retweet') || metric('unretweet'),
      likes: metric('like') || metric('unlike'),
      views: XAL.parseNum(article.querySelector('a[href$="/analytics"]')?.getAttribute('aria-label')),
      isRepost: !!article.querySelector('[data-testid="socialContext"]'),
    };
  };

  /* ── observer: run handlers on new tweets / nodes, batched per frame ───── */
  const scanners = [];
  XAL.onScan = (fn) => { scanners.push(fn); };
  let queued = false;
  const runScan = () => { queued = false; scanners.forEach((fn) => { try { fn(); } catch (e) { console.warn('[XAL]', e); } }); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(runScan); } })
    .observe(document.documentElement, { childList: true, subtree: true });

  /* ── our own UI layer (shadow DOM, isolated from X's CSS) ───────────────────── */
  const host = document.createElement('div');
  host.id = 'xal-ui';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; }
    .layer { position: fixed; inset: 0; pointer-events: none; font: 500 13px/1.6 XalVaz, Vazirmatn, Tahoma, sans-serif; color: #f4f2ff; direction: rtl; }
    .layer > * { pointer-events: auto; }
    button { font: inherit; color: inherit; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 16px; border: 0; border-radius: 12px;
      cursor: pointer; font-weight: 700; color: #fff; background: linear-gradient(120deg,#ff2e7e,#a24bff 55%,#2ad4ff); background-size: 200% 100%;
      box-shadow: 0 8px 22px rgba(255,46,126,.3); transition: transform .3s cubic-bezier(.34,1.56,.64,1), background-position .6s; white-space: nowrap; }
    .btn:hover { transform: translateY(-1px); background-position: 100% 0; }
    .btn:disabled { opacity: .5; cursor: default; transform: none; }
    .btn.ghost { background: rgba(255,255,255,.07); box-shadow: none; border: 1px solid rgba(255,255,255,.12); font-weight: 500; }
    .btn.ghost:hover { background: rgba(255,255,255,.13); }
    .btn.danger { background: rgba(255,77,94,.15); color: #ff8a95; box-shadow: none; border: 1px solid rgba(255,77,94,.4); }
    .btn.sm { height: 32px; padding: 0 12px; border-radius: 10px; font-size: 12px; }
    input[type=text], input[type=number], textarea, select { font: inherit; color: #f4f2ff; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.12);
      border-radius: 10px; padding: 8px 10px; outline: none; transition: border-color .25s, box-shadow .25s; }
    input:focus, textarea:focus, select:focus { border-color: rgba(162,75,255,.7); box-shadow: 0 0 0 3px rgba(162,75,255,.18); }
    .muted { color: #9a94b8; }
    .scrim { position: fixed; inset: 0; background: rgba(4,3,10,.6); backdrop-filter: blur(6px); display: grid; place-items: center; animation: fade .3s both; }
    @keyframes fade { from { opacity: 0; } }
    .modal { position: relative; width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column; border-radius: 24px; overflow: hidden;
      background: radial-gradient(120% 70% at 100% 0%, rgba(255,46,126,.22), transparent 55%), radial-gradient(120% 70% at 0% 100%, rgba(162,75,255,.22), transparent 55%), #0c0a16;
      border: 1px solid rgba(255,255,255,.12); box-shadow: 0 40px 100px rgba(0,0,0,.6); animation: pop .5s cubic-bezier(.22,1,.36,1) both; }
    .modal.wide { width: min(980px, calc(100vw - 32px)); }
    @keyframes pop { from { opacity: 0; transform: translateY(24px) scale(.96); } }
    .m-head { display: flex; align-items: center; gap: 10px; padding: 16px 18px 12px; }
    .m-head h3 { font-size: 16px; font-weight: 900; }
    .m-head .x { margin-right: auto; width: 32px; height: 32px; border-radius: 10px; border: 0; cursor: pointer; background: rgba(255,255,255,.07); color: #9a94b8; font-size: 15px; }
    .m-head .x:hover { background: rgba(255,77,94,.25); color: #fff; }
    .m-body { padding: 0 18px 18px; overflow: auto; }
    .menu { position: fixed; min-width: 220px; padding: 6px; border-radius: 16px; background: #100d1c; border: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 24px 60px rgba(0,0,0,.6); animation: pop .35s cubic-bezier(.22,1,.36,1) both; }
    .menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; border-radius: 10px; background: none; cursor: pointer; text-align: right; }
    .menu button:hover { background: rgba(255,255,255,.07); }
    .menu button .ic { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px; background: rgba(255,255,255,.06); font-size: 14px; }
    .menu hr { border: 0; height: 1px; background: rgba(255,255,255,.08); margin: 4px 6px; }
    .toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); padding: 10px 18px; border-radius: 14px; background: #15112a;
      border: 1px solid rgba(255,255,255,.14); box-shadow: 0 16px 40px rgba(0,0,0,.5); animation: toast 2.6s cubic-bezier(.22,1,.36,1) both; white-space: nowrap; }
    @keyframes toast { 0% { opacity: 0; transform: translate(-50%, 20px); } 12%, 85% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, 10px); } }
    .fab { position: fixed; bottom: 24px; right: 24px; display: flex; align-items: center; gap: 8px; height: 46px; padding: 0 18px; border-radius: 16px; border: 0; cursor: pointer;
      font: 700 13.5px XalVaz, Tahoma, sans-serif; color: #fff; background: linear-gradient(120deg,#ff2e7e,#a24bff 55%,#2ad4ff);
      box-shadow: 0 12px 32px rgba(255,46,126,.4); animation: pop .6s cubic-bezier(.22,1,.36,1) both; }
    .fab:hover { filter: brightness(1.08); }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 99px; cursor: pointer; user-select: none;
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); font-size: 12px; transition: .25s; }
    .chip.on { background: rgba(255,46,126,.18); border-color: rgba(255,46,126,.55); color: #fff; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .bar { height: 6px; border-radius: 6px; background: rgba(255,255,255,.08); overflow: hidden; }
    .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg,#ff2e7e,#a24bff,#2ad4ff); transition: width .4s; }
    .scroll::-webkit-scrollbar { width: 8px; } .scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 8px; }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    ${''}</style><div class="layer"></div>`;
  (document.body || document.documentElement).appendChild(host);
  const layer = root.querySelector('.layer');
  XAL.ui = { root, layer };
  // English / Persian: on X's own page only our .xal-* elements are translated, never X's text or tweets.
  if (window.XI) {
    XI.scope = '[class*="xal-"],#xal-ui';
    const dir = () => { layer.style.direction = XI.lang === 'en' ? 'ltr' : 'rtl'; layer.classList.toggle('en', XI.lang === 'en'); };
    XI.onChange = dir; dir();
    XI.observe(root);
    XI.observe(document.body || document.documentElement);
  }
  XAL.addStyle = (css) => { const s = document.createElement('style'); s.textContent = css; root.prepend(s); };

  XAL.toast = (msg) => {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    layer.appendChild(t);
    setTimeout(() => t.remove(), 2700);
  };

  XAL.modal = ({ title, wide = false, onClose } = {}) => {
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><div class="m-head"><h3></h3><button class="x" title="بستن">✕</button></div><div class="m-body scroll"></div></div>`;
    scrim.querySelector('h3').textContent = title || '';
    const close = () => { scrim.remove(); removeEventListener('keydown', onKey, true); onClose?.(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    addEventListener('keydown', onKey, true);
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
    scrim.querySelector('.x').addEventListener('click', close);
    layer.appendChild(scrim);
    return { body: scrim.querySelector('.m-body'), modal: scrim.querySelector('.modal'), close };
  };

  // Small popover menu anchored to an element. items: [{icon, label, onClick}] or 'hr'
  XAL.menu = (anchor, items) => {
    layer.querySelector('.menu')?.remove();
    const m = document.createElement('div');
    m.className = 'menu';
    for (const it of items) {
      if (it === 'hr') { m.appendChild(document.createElement('hr')); continue; }
      const b = document.createElement('button');
      b.innerHTML = `<span class="ic">${it.icon}</span><span></span>`;
      b.lastChild.textContent = it.label;
      b.addEventListener('click', () => { m.remove(); it.onClick(); });
      m.appendChild(b);
    }
    layer.appendChild(m);
    m.place = () => {
      const r = anchor.getBoundingClientRect();
      const mw = m.offsetWidth, mh = m.offsetHeight;
      m.style.left = `${Math.max(8, Math.min(innerWidth - mw - 8, r.left + r.width / 2 - mw / 2))}px`;
      m.style.top = `${r.bottom + mh + 8 > innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6}px`;
    };
    m.place();
    const off = (e) => { if (!e.composedPath().includes(m)) { m.remove(); removeEventListener('mousedown', off, true); } };
    setTimeout(() => addEventListener('mousedown', off, true));
    return m;
  };

  // Floating action button (one per key), shown while `when()` is true.
  const fabs = {};
  XAL.fab = (key, label, when, onClick) => {
    XAL.onScan(() => {
      const show = when();
      if (show && !fabs[key]) {
        const b = document.createElement('button');
        b.className = 'fab'; b.textContent = label;
        b.addEventListener('click', onClick);
        layer.appendChild(b);
        fabs[key] = b;
      } else if (!show && fabs[key]) { fabs[key].remove(); delete fabs[key]; }
    });
  };

  // X-side button styles (these live in X's DOM, so they use prefixed classes).
  const xs = document.createElement('style');
  xs.textContent = `
    .xal-tbtn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; border: 0; cursor: pointer;
      background: transparent; transition: background .2s, transform .3s cubic-bezier(.34,1.56,.64,1); padding: 0; }
    .xal-tbtn:hover { background: rgba(255,46,126,.12); transform: scale(1.08); }
    .xal-tbtn svg { width: 19px; height: 19px; }
    .xal-cbtn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; margin: 0 4px; border-radius: 99px; cursor: pointer;
      border: 1px solid rgba(255,46,126,.45); background: rgba(255,46,126,.08); color: #ff4f93; font: 700 12px XalVaz, sans-serif; white-space: nowrap; }
    .xal-cbtn:hover { background: rgba(255,46,126,.16); }
    .xal-count { font: 700 12px XalVaz, sans-serif; color: rgb(113,118,123); margin: 0 6px; white-space: nowrap; direction: rtl; }
    .xal-sorsa { display: inline-flex; align-items: center; gap: 8px; margin: 6px 0 8px; padding: 4px 12px 4px 6px; border-radius: 12px; cursor: pointer;
      border: 1px solid rgba(162,75,255,.45); background: linear-gradient(120deg, rgba(255,46,126,.08), rgba(162,75,255,.12) 55%, rgba(42,212,255,.08));
      color: #a46bff; font: 700 12.5px XalVaz, sans-serif; direction: ltr; transition: transform .2s, box-shadow .2s; user-select: none; }
    .xal-sorsa:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(162,75,255,.25); }
    .xal-sorsa .xs-logo { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; color: #fff;
      background: linear-gradient(135deg,#3b6bff,#a24bff); font-size: 14px; line-height: 1; }
    .xal-sorsa .xs-score { font-size: 14px; font-weight: 900; }
    .xal-sorsa .xs-d { font-size: 11px; } .xal-sorsa .xs-d.up { color: #00ba7c; } .xal-sorsa .xs-d.down { color: #f4212e; } .xal-sorsa .xs-d.flat { color: rgb(113,118,123); }
    .xal-sorsa .xs-meter { width: 64px; height: 5px; border-radius: 5px; background: rgba(128,128,128,.25); overflow: hidden; }
    .xal-sorsa .xs-meter i { display: block; height: 100%; border-radius: 5px; background: linear-gradient(90deg,#ff2e7e,#a24bff,#2ad4ff); }
    .xal-sorsa .xs-tier { font-size: 11px; padding: 1px 7px; border-radius: 99px; background: rgba(162,75,255,.14); }
    .xal-sorsa[data-tier="1"] .xs-tier { background: rgba(128,128,128,.18); color: rgb(113,118,123); }
    .xal-sorsa[data-tier="4"] .xs-tier, .xal-sorsa[data-tier="5"] .xs-tier { background: linear-gradient(90deg,#ff2e7e,#a24bff); color: #fff; }
    .xal-sorsa[data-state="loading"] { opacity: .7; }
    .xal-sorsa[data-state="login"] .xs-tier { background: #1d9bf0; color: #fff; }
    .xal-sorsa[data-state="err"] { border-color: rgba(255,173,31,.5); background: rgba(255,173,31,.08); color: #d99000; }
    .xal-count.warn { color: #ffad1f; } .xal-count.over { color: #f4212e; }`;
  (document.head || document.documentElement).appendChild(xs);

  XAL.sparkIcon = `<svg viewBox="0 0 24 24"><defs><linearGradient id="xalg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2e7e"/><stop offset=".55" stop-color="#a24bff"/><stop offset="1" stop-color="#2ad4ff"/></linearGradient></defs><path fill="url(#xalg)" d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7L12 2zm7 12l1 2.8 2.8 1-2.8 1L19 21.6l-1-2.8-2.8-1 2.8-1L19 14z"/></svg>`;

  // Remember who is logged in, so the popup can link to their pages.
  XAL.onScan(() => {
    const me = XAL.me();
    if (me && me !== XAL._me) { XAL._me = me; chrome.storage.local.set({ me }); }
  });

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg?.type === 'xalPing') reply({ ok: true, url: location.href });
  });
})();
