// Following manager: reads the lists the extension synced from X (names, bios, follower counts…),
// filters them, and sends selected accounts to the unfollow queue.
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (n) => (n >= 1e6 ? `${fa((n / 1e6).toFixed(1))}M` : n >= 1e4 ? `${fa(Math.round(n / 1e3))}K` : n >= 1e3 ? `${fa((n / 1e3).toFixed(1))}K` : fa(n));
const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };

const embed = new URLSearchParams(location.search).has('embed');
if (embed) { document.body.classList.add('embed'); document.documentElement.classList.add('embed'); }
let syncTabId = null;
let data = {};          // followData from storage: { following, followers }
let me = null;
let white = new Set();  // never unfollow these (lowercase handles)
let tab = new URLSearchParams(location.search).get('tab') || 'following';
if (!['following', 'followers', 'unfollowed'].includes(tab)) tab = 'following';
const f = { verified: false, notVerified: false, noPosts: false, noAvatar: false, noBio: false, locked: false };
let selected = new Set();
let limit = 200;

async function load() {
  const s = await chrome.storage.local.get(['followData', 'followWhitelist', 'me']);
  data = s.followData || {};
  white = new Set(s.followWhitelist || []);
  me = s.me || null;
}

const list = () => data[tab === 'unfollowed' ? 'followers' : tab]?.users || [];
const key = (u) => u.handle.toLowerCase();

function ageYears(u) { const t = Date.parse(u.createdAt); return t ? (Date.now() - t) / (365.25 * 864e5) : null; }

function rows() {
  const q = $('q').value.trim().toLowerCase();
  const fmin = $('fmin').value === '' ? null : +$('fmin').value, fmax = $('fmax').value === '' ? null : +$('fmax').value;
  const loc = $('loc').value.trim().toLowerCase(), age = $('age').value === '' ? null : +$('age').value;
  const protect = $('protect').checked && tab === 'following';
  const out = list().filter((u) => {
    if (protect && u.followsYou) return false;
    if (f.verified && !u.verified) return false;
    if (f.notVerified && u.verified) return false;
    if (f.noPosts && u.posts > 0) return false;
    if (f.noAvatar && !u.noAvatar) return false;
    if (f.noBio && u.bio) return false;
    if (f.locked && !u.locked) return false;
    if (fmin !== null && u.followers < fmin) return false;
    if (fmax !== null && u.followers > fmax) return false;
    if (loc && !(u.location || '').toLowerCase().includes(loc)) return false;
    if (age !== null) { const a = ageYears(u); if (a === null || a > age) return false; }
    return !q || `${u.name} ${u.handle} ${u.bio}`.toLowerCase().includes(q);
  });
  const sorts = {
    'fol-asc': (a, b) => a.followers - b.followers, 'fol-desc': (a, b) => b.followers - a.followers,
    new: (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0), old: (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
    name: (a, b) => a.name.localeCompare(b.name, 'fa'),
  };
  return out.sort(sorts[$('sort').value] || sorts['fol-asc']);
}

function drawMe() {
  $('meBox').hidden = !!me;
}

function drawHeader() {
  drawMe();
  const d = data[tab === 'unfollowed' ? 'followers' : tab];
  $('syncInfo').textContent = d ? `آخرین همگام‌سازی ${tab === 'following' ? 'دنبال‌شوندگان' : 'دنبال‌کنندگان'}: ${new Date(d.at).toLocaleString('fa-IR')} · ${fa(d.users.length)} حساب` : 'هنوز همگام‌سازی نشده';
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const banner = $('banner');
  const partial = d?.partial;
  banner.hidden = !partial && !(!me);
  banner.textContent = !me ? 'حساب شما هنوز شناخته نشده. اول x.com را باز کنید و وارد شوید، بعد همگام‌سازی را بزنید.' : partial ? 'این فهرست کامل نیست (همگام‌سازی زود متوقف شد). برای فهرست کامل‌تر بعداً دوباره همگام‌سازی کنید.' : '';
}

function draw() {
  drawHeader();
  const hasData = !!data[tab === 'unfollowed' ? 'followers' : tab];
  $('empty').hidden = hasData;
  $('main').hidden = !hasData;
  if (!hasData) return;

  const following = data.following?.users || [], followers = data.followers?.users || [];
  const mutual = following.filter((u) => u.followsYou).length;
  const followingSet = new Set(following.map(key));
  const isUnf = tab === 'unfollowed';
  $('filterBox').hidden = isUnf;
  $('actions').hidden = tab !== 'following';
  $('protectWrap').hidden = tab !== 'following';
  if (tab === 'following') {
    $('kA').textContent = fa(following.length); $('kAl').textContent = 'دنبال می‌کنید';
    $('kB').textContent = fa(mutual); $('kBl').textContent = 'دوطرفه';
    $('kC').textContent = fa(following.length - mutual); $('kCl').textContent = 'فالوبک نداده‌اند';
  } else if (tab === 'followers') {
    const youFollow = followers.filter((u) => followingSet.has(key(u))).length;
    $('kA').textContent = fa(followers.length); $('kAl').textContent = 'دنبال‌کننده دارید';
    $('kB').textContent = following.length ? fa(youFollow) : '—'; $('kBl').textContent = 'شما هم دنبال می‌کنید';
    $('kC').textContent = following.length ? fa(followers.length - youFollow) : '—'; $('kCl').textContent = 'شما دنبال نمی‌کنید';
  }

  const el = $('list');
  if (isUnf) {
    const cur = new Set(followers.map(key));
    const prev = data.followers?.prev || [];
    const gone = prev.filter((h) => !cur.has(h.toLowerCase()));
    $('kA').textContent = fa(gone.length); $('kAl').textContent = 'آنفالو کرده‌اند'; $('kB').textContent = fa(prev.length); $('kBl').textContent = 'دنبال‌کننده در همگام‌سازی قبل'; $('kC').textContent = fa(followers.length); $('kCl').textContent = 'دنبال‌کننده‌ی فعلی';
    $('count').textContent = '';
    el.innerHTML = !prev.length ? `<div class="muted" style="padding:30px;text-align:center">برای دیدن این بخش دو بار فهرست «دنبال‌کنندگان» را همگام‌سازی کنید؛ بار دوم مقایسه می‌شود.</div>`
      : !gone.length ? '<div class="muted" style="padding:30px;text-align:center">از همگام‌سازی قبل کسی آنفالو نکرده 🎉</div>'
        : gone.map((h) => `<div class="u"><div class="main"><div class="nm"><a href="https://x.com/${esc(h)}" target="_blank" style="color:inherit;text-decoration:none"><span class="hd">@${esc(h)}</span></a></div></div><div class="meta">از ${data.followers.prevAt ? new Date(data.followers.prevAt).toLocaleDateString('fa-IR') : 'قبل'}</div></div>`).join('');
    return;
  }

  const r = rows();
  $('count').textContent = `${fa(r.length)} حساب`;
  document.querySelectorAll('#chips .chip').forEach((c) => c.classList.toggle('on', f[c.dataset.f]));
  el.innerHTML = r.length ? '' : '<div class="muted" style="padding:30px;text-align:center">چیزی با این فیلترها نیست 🎉</div>';
  r.slice(0, limit).forEach((u) => {
    const k = key(u), locked = white.has(k);
    const row = document.createElement('label');
    row.className = 'u';
    row.innerHTML = `${tab === 'following' ? `<input type="checkbox" ${selected.has(k) ? 'checked' : ''} ${locked ? 'disabled' : ''}>` : ''}
      <img src="${esc(u.avatar)}" alt="" loading="lazy">
      <div class="main"><div class="nm">${esc(u.name)} ${u.verified ? '<span style="color:#1d9bf0">☑</span>' : ''} ${u.locked ? '🔒' : ''} <span class="hd">@${esc(u.handle)}</span></div>
        <div class="bio">${esc(u.bio) || '—'}</div></div>
      <div class="meta"><b>${short(u.followers)}</b> دنبال‌کننده<br>${u.location ? esc(u.location) + ' · ' : ''}${fa(u.posts)} پست</div>
      ${tab === 'following' ? `<span class="tag2 ${u.followsYou ? 'mut' : 'nb'}">${u.followsYou ? 'دوطرفه' : 'فالوبک نمی‌دهد'}</span>` : `<span class="tag2 ${followingSet.has(k) ? 'mut' : 'nb'}">${followingSet.has(k) ? 'دوطرفه' : 'شما دنبال نمی‌کنید'}</span>`}
      ${tab === 'following' ? `<button class="star" title="لیست سفید: هیچ‌وقت آنفالو نشود" style="opacity:${locked ? 1 : 0.3}">⭐</button>` : ''}
      <a href="https://x.com/${esc(u.handle)}" target="_blank" title="باز کردن در X" style="color:#8a8a8a;text-decoration:none">↗</a>`;
    row.querySelector('input')?.addEventListener('change', (e) => { e.target.checked ? selected.add(k) : selected.delete(k); updateSel(); });
    row.querySelector('.star')?.addEventListener('click', async (e) => {
      e.preventDefault();
      white.has(k) ? white.delete(k) : (white.add(k), selected.delete(k));
      await chrome.storage.local.set({ followWhitelist: [...white] });
      draw();
    });
    el.appendChild(row);
  });
  if (r.length > limit) {
    const more = document.createElement('button');
    more.className = 'btn ghost sm'; more.style.cssText = 'width:100%;margin:6px 0';
    more.textContent = `نمایش ${fa(Math.min(200, r.length - limit))} حساب دیگر`;
    more.addEventListener('click', () => { limit += 200; draw(); });
    el.appendChild(more);
  }
  updateSel();
}
const updateSel = () => { $('sel').textContent = `${fa(selected.size)} انتخاب‌شده`; };
const chosen = () => list().filter((u) => selected.has(key(u)) && !white.has(key(u)));

/* ── controls ── */
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; selected.clear(); limit = 200; history.replaceState(null, '', `?tab=${tab}`); draw(); }));
document.querySelectorAll('#chips .chip').forEach((c) => c.addEventListener('click', () => {
  f[c.dataset.f] = !f[c.dataset.f];
  if (c.dataset.f === 'verified' && f.verified) f.notVerified = false;
  if (c.dataset.f === 'notVerified' && f.notVerified) f.verified = false;
  draw();
}));
['q', 'fmin', 'fmax', 'loc', 'age'].forEach((id) => $(id).addEventListener('input', draw));
$('sort').addEventListener('change', draw);
$('protect').addEventListener('change', draw);
$('all').addEventListener('click', () => { rows().forEach((u) => { if (!white.has(key(u))) selected.add(key(u)); }); draw(); });
$('none').addEventListener('click', () => { selected.clear(); draw(); });
$('copy').addEventListener('click', () => { const r = selected.size ? chosen() : rows(); navigator.clipboard.writeText(r.map((u) => `@${u.handle}`).join('\n')); toast(`${fa(r.length)} شناسه کپی شد ✓`); });
$('csv').addEventListener('click', () => {
  const r = selected.size ? chosen() : rows();
  const c = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿handle,name,followers,posts,location,verified,follows_you,created,bio\n' + r.map((u) => [u.handle, u.name, u.followers, u.posts, u.location, u.verified, u.followsYou, u.createdAt, u.bio].map(c).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `${tab}.csv`; a.click();
});

$('meSave').addEventListener('click', async () => {
  const raw = $('meInput').value.trim();
  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#].*)?$/i) || raw.match(/^@?([A-Za-z0-9_]{1,15})$/);
  if (!m) return toast('نام کاربری معتبر نیست؛ مثل @username');
  await chrome.storage.local.set({ me: m[1] });
  me = m[1];
  drawMe(); drawHeader();
  toast('ذخیره شد ✓ حالا همگام‌سازی را بزنید');
});

// The sync reads from an X page, so it runs in a background tab that closes itself; progress shows here.
$('syncBtn').addEventListener('click', async () => {
  if (!me) { toast('اول نام کاربری‌تان را بنویسید'); $('meBox').hidden = false; $('meInput').focus(); return; }
  const type = tab === 'followers' || tab === 'unfollowed' ? 'followers' : 'following';
  await chrome.storage.local.remove('syncDiag');
  await chrome.storage.local.set({ syncState: { type, state: 'running', count: 0, at: Date.now() } });
  const t = await chrome.tabs.create({ url: `https://x.com/${me}/${type}`, active: false });
  syncTabId = t.id;
  await chrome.storage.local.set({ syncJob: { tabId: t.id, type, at: Date.now() } });
});
$('syncStop').addEventListener('click', () => { if (syncTabId) chrome.tabs.sendMessage(syncTabId, { type: 'syncStop' }).catch(() => {}); });

// What happened in the last sync, step by step (kept until the next sync).
function drawDiag(d, st) {
  const box = $('diagBox');
  const ok = st?.state === 'done' && st.reason === 'end';
  if (!d || ok || !st || st.state !== 'done') { box.hidden = true; return; }
  const S = d.steps || {}, R = S.result || {};
  const line = (good, text) => `<li>${good ? '✅' : '❌'} ${text}</li>`;
  const items = [
    ...(S.tabUrl !== undefined ? [line(!/login/.test(S.tabUrl), `تب به این آدرس رفت: <span dir="ltr">${esc(S.tabUrl)}</span>`), line(S.injected, S.injected ? 'اکستنشن داخل تب اجرا شد' : 'اکستنشن داخل تب اجرا نشد')] : []),
    ...(S.tabUrl !== undefined ? [`<li class="muted">${esc(st.title || '')} — ${esc(st.detail || '')}</li>`] : []),
    ...(S.tabUrl !== undefined ? [] : [
    line(!!S.page, S.page ? `صفحه‌ی ${d.type === 'following' ? 'Following' : 'Followers'} در X باز شد (${d.path})` : 'اکستنشن روی صفحه‌ی Following/Followers اجرا نشد. آدرس باز شده را بررسی کنید.'),
    line(S.job, S.job ? 'تب به‌عنوان تب همگام‌سازی شناخته شد' : 'تب به‌عنوان تب همگام‌سازی شناخته نشد'),
    line(S.reader, S.reader ? 'خواننده‌ی داخل صفحه‌ی X فعال است' : 'خواننده‌ی داخل صفحه‌ی X پاسخ نداد (احتمالاً اکستنشن را Reload نکرده‌اید یا صفحه رفرش نشده)'),
    line(R.reason === 'end' || R.count > 0, R.reason ? `نتیجه: ${R.reason} · ${R.count || 0} حساب · ${R.pages || 0} صفحه${R.status ? ` · کد ${R.status}` : ''}` : 'همگام‌سازی به نتیجه نرسید'),
  ])];
  if (R.seen?.length) items.push(`<li dir="ltr" style="text-align:left;color:#9a9a9a;font-size:11.5px;word-break:break-all">درخواست‌های X: ${R.seen.join(', ')}</li>`);
  $('diagList').innerHTML = items.join('');
  box.hidden = false;
  $('diagCopy').onclick = () => { navigator.clipboard.writeText(JSON.stringify({ diag: d, state: st }, null, 1)); toast('کپی شد ✓'); };
}

function drawSync(st) {
  const box = $('syncBox');
  chrome.storage.local.get('syncDiag').then(({ syncDiag }) => drawDiag(syncDiag, st));
  const fresh = st && Date.now() - st.at < 10 * 60e3;
  if (!fresh) { box.hidden = true; return; }
  const running = st.state === 'running';
  box.hidden = !running && !(st.state === 'done' && Date.now() - st.at < 20e3);
  $('syncBtn').disabled = running;
  $('syncStop').hidden = !running;
  $('syncBar').style.width = running ? `${Math.min(95, 12 + (st.count || 0) / 20)}%` : '100%';
  $('syncTitle').textContent = running ? `در حال همگام‌سازی… ${fa(st.count || 0)} حساب` : st.title || 'تمام شد';
  $('syncDetail').textContent = running ? 'در یک تب پس‌زمینه خوانده می‌شود و خودش بسته می‌شود.' : `${fa(st.count || 0)} حساب ذخیره شد. ${st.detail || ''}`;
}

/* ── unfollow queue ── */
function startUnfollow(mode, extra = {}) {
  const r = chosen();
  if (!r.length) return toast('اول چند نفر را انتخاب کنید');
  chrome.runtime.sendMessage({ type: 'start', kind: 'unfollow', mode, links: r.map((u) => `https://x.com/${u.handle}`), closeTab: true, autoNext: false, ...extra });
  const gone = new Set(r.map(key));
  data.following.users = data.following.users.filter((u) => !gone.has(key(u)));
  chrome.storage.local.set({ followData: data });
  selected.clear();
  draw();
  toast(mode === 'manual' ? 'صف آنفالو شروع شد. در هر صفحه خودتان آنفالو کنید.' : 'آنفالو خودکار شروع شد.');
}
$('manual').addEventListener('click', () => startUnfollow('manual'));
$('auto').addEventListener('click', () => { $('autoWarn').hidden = false; $('autoCfg').hidden = false; });
$('go').addEventListener('click', () => {
  const min = Math.max(20, +$('mn').value || 30), max = Math.max(min, +$('mx').value || 60), cap = Math.max(1, Math.min(50, +$('cap').value || 20));
  startUnfollow('auto', { delayMinMs: min * 1000, delayMaxMs: max * 1000, preMinMs: 1500, preMaxMs: 3500, dailyCap: cap });
});

chrome.storage.onChanged.addListener(async (c, area) => {
  if (area !== 'local') return;
  if (c.followData || c.me) { await load(); draw(); }
  if (c.syncState) drawSync(c.syncState.newValue);
  if (c.syncDiag) chrome.storage.local.get('syncState').then(({ syncState }) => drawDiag(c.syncDiag.newValue, syncState));
});
load().then(draw);
chrome.storage.local.get('syncState').then(({ syncState }) => drawSync(syncState));
