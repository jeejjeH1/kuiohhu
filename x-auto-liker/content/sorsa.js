// Sorsa Score badge on profile pages (settings: pages/sorsa.html). It reads the handle of the profile that is open
// and asks the background for the score: from the user's own app.sorsa.io sign-in (no key), or the optional API key.
// Nothing reaches X. Clicking the badge opens a card with the tier, weekly/monthly change and top followers.
(() => {
  const { XAL } = window;
  const RESERVED = new Set(['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'compose', 'tos', 'privacy', 'login', 'signup',
    'logout', 'jobs', 'communities', 'lists', 'bookmarks', 'premium', 'following', 'followers', 'account', 'intent', 'share', 'hashtag']);
  // Sorsa's public tiers: Unknown 0–99, Noted 100–499, Credible 500–999, Significant 1000–1999, Supreme 2000+.
  const TIERS = [[0, 'Unknown'], [100, 'Noted'], [500, 'Credible'], [1000, 'Significant'], [2000, 'Supreme']];
  const SORSA_APP = 'https://app.sorsa.io/';
  const pending = new Map();
  let cfg = null;

  const tierOf = (score) => {
    let i = 0;
    while (i + 1 < TIERS.length && score >= TIERS[i + 1][0]) i++;
    const lo = TIERS[i][0], hi = TIERS[i + 1]?.[0];
    return { n: i + 1, name: TIERS[i][1], next: TIERS[i + 1]?.[1] || null, toNext: hi ? Math.ceil(hi - score) : 0,
      pct: hi ? Math.max(3, Math.min(100, ((score - lo) / (hi - lo)) * 100)) : 100 };
  };
  const fmt = (n, d = 1) => Number(n).toLocaleString('en', { maximumFractionDigits: d });
  const fmtK = (n) => (n >= 1e6 ? `${fmt(n / 1e6)}M` : n >= 1e3 ? `${fmt(n / 1e3)}K` : fmt(n, 0));
  const delta = (v) => (v === null || v === undefined ? '' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v), 2)}`);
  const smartTotal = (st) => (st ? ['influencers', 'projects', 'vcs'].reduce((n, k) => n + (st[k] || 0), 0) : null);
  const dcls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

  function profileHandle() {
    const m = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|highlights|media|articles|superfollows))?\/?$/);
    return m && !RESERVED.has(m[1].toLowerCase()) ? m[1] : null;
  }

  function paint(badge, res) {
    badge.textContent = '';
    const add = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; badge.appendChild(s); return s; };
    add('xs-logo', '∞');
    if (res?.ok && res.score !== null && res.score !== undefined) {
      const t = tierOf(res.score);
      badge.dataset.state = 'ok';
      badge.dataset.tier = t.n;
      add('xs-score', fmt(res.score));
      if (res.week) add(`xs-d ${dcls(res.week)}`, delta(res.week));
      const meter = add('xs-meter', '');
      const fill = document.createElement('i'); fill.style.width = `${t.pct}%`; meter.appendChild(fill);
      add('xs-tier', `Tier ${t.n} · ${t.name}`);
      if (res.stats) add('xs-smart', `★ ${fmtK(smartTotal(res.stats))}`);
      badge.title = 'Sorsa Score — برای جزئیات کلیک کنید';
    } else if (res?.ok) {
      badge.dataset.state = 'none';
      add('xs-score', 'Sorsa —');
      badge.title = 'امتیازی برای این حساب پیدا نشد';
    } else if (res?.code === 'login') {
      badge.dataset.state = 'login';
      add('xs-score', 'Sorsa');
      add('xs-tier', 'ورود به Sorsa').dir = 'auto';
      badge.title = res.error;
    } else {
      badge.dataset.state = 'err';
      add('xs-score', 'Sorsa ⚠');
      badge.title = res?.error || 'خطا';
    }
    badge._res = res;
  }

  async function run() {
    const h = profileHandle();
    const key = h?.toLowerCase();
    document.querySelectorAll('.xal-sorsa').forEach((el) => { if (el.dataset.h !== key) el.remove(); });
    if (!h) return;
    if (!cfg) cfg = (await chrome.storage.local.get('sorsa')).sorsa || {};
    if (cfg.enabled === false) return;
    const name = document.querySelector('[data-testid="UserName"]');
    // X keeps the previous profile's DOM for a moment after navigating; only act when this header is the open profile
    if (!name || !name.textContent.toLowerCase().includes(`@${key}`)) return;
    let badge = document.querySelector(`.xal-sorsa[data-h="${key}"]`);
    if (badge && badge.dataset.state && badge.dataset.state !== 'loading') return;
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'xal-sorsa';
      badge.dataset.h = key;
      badge.dataset.state = 'loading';
      badge.textContent = 'Sorsa …';
      badge.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (badge._res?.code === 'login') window.open(SORSA_APP, '_blank', 'noopener');
        else openCard(h, badge._res);
      });
      name.insertAdjacentElement('afterend', badge);
    }
    if (!pending.has(key)) {
      const p = XAL.bg({ type: 'sorsaScore', handle: h }).catch((e) => ({ ok: false, error: e.message })).finally(() => pending.delete(key));
      pending.set(key, p);
      const res = await p;
      document.querySelectorAll(`.xal-sorsa[data-h="${key}"]`).forEach((el) => paint(el, res));
    }
  }

  // ── Detail card ─────────────────────────────────────────────────────────────────────────────────────────
  let styled = false;
  function style() {
    if (styled) return;
    styled = true;
    XAL.addStyle(`
      .ss-head { display: flex; align-items: center; gap: 14px; direction: ltr; }
      .ss-big { font-size: 34px; font-weight: 900; line-height: 1; background: linear-gradient(120deg,#ff2e7e,#a24bff 55%,#2ad4ff); -webkit-background-clip: text; color: transparent; }
      .ss-tier { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 700; background: rgba(162,75,255,.16); border: 1px solid rgba(162,75,255,.5); color: #d6b8ff; }
      .ss-h { color: rgba(255,255,255,.6); font-size: 13px; margin-top: 4px; }
      .ss-next { font-size: 12px; color: rgba(255,255,255,.6); margin-top: 6px; }
      .ss-ticks { display: grid; grid-template-columns: repeat(5, 1fr); direction: ltr; text-align: left; font-size: 10.5px; color: rgba(255,255,255,.45); margin-top: 4px; }
      .ss-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 14px 0; }
      .ss-box { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 10px 12px; }
      .ss-box small { display: block; color: rgba(255,255,255,.55); font-size: 11.5px; }
      .ss-box b { font-size: 17px; direction: ltr; display: inline-block; }
      .ss-g3 { grid-template-columns: repeat(3, 1fr); margin-top: 0; }
      .ss-sum { color: #ffd166; direction: ltr; }
      .ss-src { color: rgba(255,255,255,.45); font-weight: 500; font-size: 11px; }
      .up { color: #00ba7c; } .down { color: #f4212e; } .flat { color: rgba(255,255,255,.6); }
      .ss-sec { display: flex; align-items: center; justify-content: space-between; margin: 6px 0 8px; font-weight: 700; }
      .ss-sec button { background: none; border: 1px solid rgba(255,255,255,.14); color: inherit; border-radius: 99px; padding: 3px 10px; cursor: pointer; font: inherit; font-size: 12px; }
      .ss-list { display: flex; flex-direction: column; gap: 4px; }
      .ss-u { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 10px; text-decoration: none; color: inherit; direction: ltr; }
      .ss-u:hover { background: rgba(255,255,255,.06); }
      .ss-u img { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.08); flex: none; }
      .ss-u .nm { flex: 1; min-width: 0; text-align: left; }
      .ss-u .nm b, .ss-u .nm small { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ss-u .nm small { color: rgba(255,255,255,.55); font-size: 12px; }
      .ss-u .sc { font-weight: 800; color: #d6b8ff; }
      .ss-rank { width: 18px; color: rgba(255,255,255,.4); font-size: 12px; text-align: center; }
      .ss-msg { color: rgba(255,255,255,.6); font-size: 13px; padding: 10px 0; }
      .ss-foot { color: rgba(255,255,255,.4); font-size: 11px; margin-top: 12px; }
      .ss-open { display: inline-block; margin-top: 6px; color: #8fb3ff; font-size: 12.5px; text-decoration: none; }
      .ss-open:hover { text-decoration: underline; }`);
  }

  function renderTop(box, res) {
    box.textContent = '';
    if (!res?.ok) { box.innerHTML = `<div class="ss-msg"></div>`; box.firstChild.textContent = res?.error || 'خطا'; return; }
    if (!res.users) return;
    if (!res.users.length) { box.innerHTML = `<div class="ss-msg">دنبال‌کننده‌ی امتیازداری پیدا نشد.</div>`; return; }
    res.users.slice(0, 20).forEach((u, i) => {
      const a = document.createElement('a');
      a.className = 'ss-u';
      a.href = `https://x.com/${encodeURIComponent(u.username)}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = `<span class="ss-rank">${i + 1}</span><img alt="" loading="lazy"><span class="nm" data-no-i18n><b></b><small></small></span><span class="sc"></span>`;
      a.querySelector('img').src = u.avatar || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
      a.querySelector('b').textContent = u.name || u.username;
      a.querySelector('small').textContent = `@${u.username}${u.followers !== null ? ` · ${fmtK(u.followers)}` : ''}`;
      a.querySelector('.sc').textContent = u.score !== null ? fmt(u.score) : '—';
      box.appendChild(a);
    });
  }

  async function openCard(handle, res) {
    style();
    const { body } = XAL.modal({ title: 'امتیاز Sorsa' });
    if (!res?.ok || res.score === null || res.score === undefined) {
      body.innerHTML = `<div class="ss-msg"></div>`;
      body.firstChild.textContent = res?.ok ? 'امتیازی برای این حساب پیدا نشد' : res?.error || 'خطا';
      const help = document.createElement('button');
      help.className = 'btn';
      help.style.marginTop = '10px';
      help.textContent = 'عیب‌یابی در تنظیمات Sorsa';
      help.addEventListener('click', () => XAL.openPage('pages/sorsa.html'));
      body.appendChild(help);
      return;
    }
    const t = tierOf(res.score);
    body.innerHTML = `
      <div class="ss-head"><div class="ss-big"></div><div><span class="ss-tier"></span><div class="ss-h" data-no-i18n></div></div></div>
      <div class="bar" style="margin-top:14px;direction:ltr"><i></i></div>
      <div class="ss-ticks">${TIERS.map(([v]) => `<span>${v}</span>`).join('')}</div>
      <div class="ss-next"></div>
      <div class="ss-grid">
        <div class="ss-box"><small>تغییر هفتگی</small><b class="wk"></b></div>
        <div class="ss-box"><small>تغییر ماهانه</small><b class="mo"></b></div>
      </div>
      <div class="ss-sec"><span>اسمارت فالوورها <small class="ss-src">(Sorsa)</small></span><b class="ss-sum"></b></div>
      <div class="ss-grid ss-g3">
        <div class="ss-box"><small>اینفلوئنسر</small><b class="sm-i"></b></div>
        <div class="ss-box"><small>پروژه</small><b class="sm-p"></b></div>
        <div class="ss-box"><small>VC</small><b class="sm-v"></b></div>
      </div>
      <div class="ss-sec"><span>برترین دنبال‌کننده‌ها</span><button class="ld">تازه‌سازی</button></div>
      <div class="ss-list"></div>
      <div class="ss-foot"></div>
      <a class="ss-open" target="_blank" rel="noopener">باز کردن در Sorsa ↗</a>`;
    body.querySelector('.ss-open').href = `${SORSA_APP}profile/${encodeURIComponent(handle)}`;
    body.querySelector('.ss-big').textContent = fmt(res.score);
    body.querySelector('.ss-tier').textContent = `Tier ${t.n} · ${t.name}`;
    body.querySelector('.ss-h').textContent = `@${handle}`;
    // Five equal segments, one per tier, so the fill lines up with the tier ticks below it.
    body.querySelector('.bar i').style.width = `${Math.min(100, ((t.n - 1 + (t.next ? t.pct / 100 : 1)) / TIERS.length) * 100)}%`;
    const next = body.querySelector('.ss-next');
    if (t.next) {
      next.innerHTML = '<span></span> <b data-no-i18n></b>';
      next.firstChild.textContent = `${XAL.fa(t.toNext)} امتیاز تا سطح بعد:`;
      next.lastChild.textContent = t.next;
    } else next.textContent = 'بالاترین سطح';
    const fill = (r) => {
      for (const [sel, v] of [['.wk', r.week], ['.mo', r.month]]) {
        const el = body.querySelector(sel);
        el.textContent = v === null || v === undefined ? '—' : delta(v);
        el.className = sel.slice(1) + (v !== null && v !== undefined ? ` ${dcls(v)}` : '');
      }
      const st = r.stats;
      for (const [sel, k] of [['.sm-i', 'influencers'], ['.sm-p', 'projects'], ['.sm-v', 'vcs']]) {
        body.querySelector(sel).textContent = st && st[k] !== null && st[k] !== undefined ? fmt(st[k], 0) : '—';
      }
      body.querySelector('.ss-sum').textContent = st ? `★ ${fmt(smartTotal(st), 0)}` : '';
    };
    fill(res);
    if (res.at) {
      const foot = body.querySelector('.ss-foot');
      foot.innerHTML = '<span>به‌روزرسانی:</span> <span data-no-i18n></span>';
      foot.lastChild.textContent = new Date(res.at).toLocaleString(window.XI?.lang === 'en' ? 'en' : 'fa-IR');
    }
    const list = body.querySelector('.ss-list');
    const btn = body.querySelector('.ld');
    const has = (r) => r.week !== null && r.week !== undefined && r.month !== null && r.month !== undefined && r.top?.length && r.stats;
    // Weekly/monthly change and top followers: fetched as soon as the card opens (a background Sorsa tab for a few
    // seconds if the page didn't include them), then remembered for 12 hours.
    const load = async (force) => {
      btn.disabled = true;
      btn.textContent = 'در حال دریافت…';
      if (!res.top?.length || force) list.innerHTML = '<div class="ss-msg">در حال دریافت تغییرات، اسمارت فالوورها و برترین دنبال‌کننده‌ها از Sorsa… (چند ثانیه)</div>';
      const r = await XAL.bg({ type: 'sorsaDetails', handle, force }).catch((e) => ({ ok: false, error: e.message }));
      if (!body.isConnected) return;
      if (r?.ok) {
        fill(r);
        renderTop(list, r.top?.length ? { ok: true, users: r.top } : { ok: false, error: 'برترین دنبال‌کننده‌ها پیدا نشد. می‌توانید آن را در خود Sorsa ببینید.' });
        res.week = r.week; res.month = r.month; res.top = r.top; res.stats = r.stats;
        document.querySelectorAll(`.xal-sorsa[data-h="${handle.toLowerCase()}"]`).forEach((b) => paint(b, { ...b._res, week: r.week, month: r.month, top: r.top, stats: r.stats }));
      } else renderTop(list, r);
      btn.disabled = false;
      btn.textContent = 'تازه‌سازی';
    };
    btn.addEventListener('click', () => load(true));
    if (res.top?.length) renderTop(list, { ok: true, users: res.top });
    if (has(res)) btn.textContent = 'تازه‌سازی';
    else load(false);
  }

  let timer;
  XAL.onScan(() => { clearTimeout(timer); timer = setTimeout(run, 700); });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== 'local' || !c.sorsa) return;
    cfg = null;
    document.querySelectorAll('.xal-sorsa').forEach((el) => el.remove());
    run();
  });
  // Back from signing in to Sorsa in another tab: try again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const stale = document.querySelectorAll('.xal-sorsa[data-state="login"], .xal-sorsa[data-state="err"]');
    if (!stale.length) return;
    stale.forEach((el) => el.remove());
    run();
  });
})();
