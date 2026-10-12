// Settings for the Sorsa Score badge: Sorsa sign-in status (no key needed), on/off switch, optional API key.
const $ = (id) => document.getElementById(id);
if (new URLSearchParams(location.search).has('embed')) { document.body.classList.add('embed'); document.documentElement.classList.add('embed'); }
const say = (t, ok) => { $('msg').style.color = ok ? 'var(--green)' : '#ff8a95'; $('msg').textContent = t; };

async function load() {
  const { sorsa = {} } = await chrome.storage.local.get('sorsa');
  $('key').value = sorsa.key || '';
  $('on').checked = sorsa.enabled !== false;
  if (sorsa.key) $('adv').open = true;
  checkSession();
}
async function checkSession() {
  const st = $('st');
  st.className = 'st';
  st.textContent = 'در حال بررسی ورود…';
  const r = await chrome.runtime.sendMessage({ type: 'sorsaSession' }).catch(() => null);
  if (r?.ok && r.login) { st.className = 'st ok'; st.textContent = '✓ وارد Sorsa شده‌اید'; $('login').style.display = 'none'; }
  else { st.className = 'st no'; st.textContent = r?.ok ? 'وارد Sorsa نشده‌اید' : 'به app.sorsa.io دسترسی نیست'; $('login').style.display = ''; }
}
$('check').addEventListener('click', checkSession);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkSession(); });
$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ sorsa: { key: $('key').value.trim(), enabled: $('on').checked } });
  say('ذخیره شد ✓', true);
});
$('test').addEventListener('click', async () => {
  const key = $('key').value.trim();
  if (!key) return say('اول کلید را وارد کنید.', false);
  say('در حال تست…', true);
  const res = await chrome.runtime.sendMessage({ type: 'sorsaTest', key }).catch((e) => ({ ok: false, error: e.message }));
  if (res?.ok) say(res.score !== null && res.score !== undefined ? `✓ کلید معتبر است (نمونه: ${res.score})` : '✓ کلید معتبر است', true);
  else say(res?.error || 'خطا', false);
});
load();

// ── Check one account: score card + top followers ──────────────────────────────────────────────────────
const TIERS = [[0, 'Unknown'], [100, 'Noted'], [500, 'Credible'], [1000, 'Significant'], [2000, 'Supreme']];
const fmt = (n, d = 1) => Number(n).toLocaleString('en', { maximumFractionDigits: d });
const fmtK = (n) => (n >= 1e6 ? `${fmt(n / 1e6)}M` : n >= 1e3 ? `${fmt(n / 1e3)}K` : fmt(n, 0));
const delta = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v), 2)}`);
const dcls = (v) => (v === null || v === undefined ? '' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
function tierOf(score) {
  let i = 0;
  while (i + 1 < TIERS.length && score >= TIERS[i + 1][0]) i++;
  const lo = TIERS[i][0], hi = TIERS[i + 1]?.[0];
  return { n: i + 1, name: TIERS[i][1], pct: hi ? Math.min(100, ((score - lo) / (hi - lo)) * 100) : 100 };
}
const handleOf = (s) => {
  const m = String(s).trim().match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})|^@?([A-Za-z0-9_]{1,15})$/);
  return m ? m[1] || m[2] : null;
};
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

async function lookup() {
  const h = handleOf($('who').value);
  const box = $('res');
  box.textContent = '';
  if (!h) { box.append(el('div', 'muted', 'نام کاربری درست نیست.')); return; }
  box.append(el('div', 'muted', 'در حال دریافت…'));
  let r = await chrome.runtime.sendMessage({ type: 'sorsaScore', handle: h, manual: true }).catch((e) => ({ ok: false, error: e.message }));
  if (r?.ok && r.score !== null && r.score !== undefined) {
    box.lastChild.textContent = 'در حال دریافت تغییرات و برترین دنبال‌کننده‌ها از Sorsa… (چند ثانیه)';
    const d = await chrome.runtime.sendMessage({ type: 'sorsaDetails', handle: h }).catch(() => null);
    if (d?.ok) r = { ...r, week: d.week, month: d.month, top: d.top };
  }
  const top = r?.top?.length ? { ok: true, users: r.top } : { ok: false, error: 'برترین دنبال‌کننده‌ها پیدا نشد. می‌توانید آن را در خود Sorsa ببینید.' };
  box.textContent = '';
  if (!r?.ok) { box.append(el('div', '', r?.error || 'خطا')); box.firstChild.style.color = '#ff8a95'; return; }
  if (r.score === null || r.score === undefined) { box.append(el('div', 'muted', 'امتیازی برای این حساب پیدا نشد')); debugBox(box); return; }
  const t = tierOf(r.score);
  const head = el('div', 'sc-head');
  const info = el('div');
  info.append(el('span', 'sc-tier', `Tier ${t.n} · ${t.name}`), el('div', 'sc-h', `@${h}`));
  head.append(el('div', 'sc-big', fmt(r.score)), info);
  const bar = el('div', 'sc-bar'); const fill = el('i'); bar.append(fill);
  fill.style.width = `${Math.min(100, ((t.n - 1 + (t.n < TIERS.length ? t.pct / 100 : 1)) / TIERS.length) * 100)}%`;
  const ticks = el('div', 'sc-ticks'); TIERS.forEach(([v]) => ticks.append(el('span', '', v)));
  const grid = el('div', 'sc-grid');
  for (const [label, v] of [['تغییر هفتگی', r.week], ['تغییر ماهانه', r.month]]) {
    const b = el('div', 'sc-box'); b.append(el('small', '', label), el('b', dcls(v), delta(v))); grid.append(b);
  }
  box.append(head, bar, ticks, grid, el('h2', '', 'برترین دنبال‌کننده‌ها'));
  if (!top?.ok) { box.append(el('div', 'muted', top?.error || 'خطا')); debugBox(box); return; }
  if (!top.users) return;
  if (!top.users.length) { box.append(el('div', 'muted', 'دنبال‌کننده‌ی امتیازداری پیدا نشد.')); return; }
  for (const u of top.users.slice(0, 20)) {
    const a = el('a', 'tf'); a.href = `https://x.com/${encodeURIComponent(u.username)}`; a.target = '_blank'; a.rel = 'noopener';
    const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.src = u.avatar || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const nm = el('div', 'nm'); nm.dataset.noI18n = '';
    nm.append(el('b', '', u.name || u.username), el('small', '', `@${u.username}${u.followers !== null ? ` · ${fmtK(u.followers)}` : ''}`));
    a.append(img, nm, el('span', 's', u.score !== null ? fmt(u.score) : '—'));
    box.append(a);
  }
}
// When no score is found: show what Sorsa returned and let the user save it, so the reader can be fixed.
async function debugBox(box) {
  const d = await chrome.runtime.sendMessage({ type: 'sorsaDebug' }).catch(() => null);
  if (!d) return;
  const w = el('div', 'dbg');
  const facts = [
    d.url ? `URL: ${d.url}` : '', d.url ? `HTTP ${d.status} · ${Math.round(d.size / 1024)} KB · Next data: ${d.flight ? 'yes' : 'no'} · @${d.handle} ×${d.mentions}` : '',
    d.rendered ? `Tab: ${d.rendered.url} · ${d.rendered.calls.length} JSON` : '',
  ].filter(Boolean);
  w.append(el('b', '', 'عیب‌یابی'), el('pre', '', facts.join('\n')));
  const btn = el('button', 'btn ghost sm', 'ذخیره‌ی فایل عیب‌یابی');
  btn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }));
    a.download = `sorsa-debug-${d.handle}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  w.append(el('div', 'muted', 'این فایل را برای سازنده‌ی اکستنشن بفرستید تا خواندن امتیاز درست شود. فقط صفحه‌ی عمومی Sorsa همین حساب در آن است.'), btn);
  box.append(w);
}
$('go').addEventListener('click', lookup);
$('who').addEventListener('keydown', (e) => { if (e.key === 'Enter') lookup(); });
