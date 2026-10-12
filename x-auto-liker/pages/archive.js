// Follow-back check from X's archive files: who you follow minus who follows you.
// Works entirely on the two files you pick; nothing is requested from X.
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const files = {};
const toast = (m) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); };
const showMsg = (m) => { $('msg').hidden = !m; $('msg').textContent = m || ''; };

// X's files look like: window.YTD.following.part0 = [ { "following": { "accountId": "123", "userLink": "https://twitter.com/intent/user?user_id=123" } }, ... ]
function parseArchive(text, key) {
  const start = text.indexOf('['), end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('ساختار فایل شناخته نشد');
  const rows = JSON.parse(text.slice(start, end + 1));
  return rows.map((r) => r[key] || Object.values(r)[0]).filter((x) => x?.accountId)
    .map((x) => ({ id: String(x.accountId), link: x.userLink || `https://x.com/intent/user?user_id=${x.accountId}` }));
}

function loadFile(input) {
  const kind = input.dataset.kind;
  const f = input.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const list = parseArchive(String(reader.result), kind);
      files[kind] = list;
      $(kind === 'following' ? 'dropF' : 'dropR').classList.add('done');
      $(kind === 'following' ? 'stF' : 'stR').textContent = `${fa(list.length)} حساب خوانده شد ✓`;
      showMsg(list.length || kind === 'follower' ? '' : 'این فایل خالی است.');
      compare();
    } catch (e) {
      showMsg(`فایل ${kind === 'following' ? 'following.js' : 'follower.js'} خوانده نشد: ${e.message}. مطمئن شوید همان فایل داخل پوشه‌ی data باشد.`);
    }
  };
  reader.readAsText(f);
}
document.querySelectorAll('input[type=file]').forEach((i) => i.addEventListener('change', () => loadFile(i)));
['dropF', 'dropR'].forEach((id) => {
  const el = $(id);
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault(); el.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const input = el.querySelector('input');
    const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files;
    loadFile(input);
  });
});

let following = [];   // everyone you follow (from following.js)
let mutualIds = new Set();
let tab = 'no';       // 'no' = not following back, 'all' = everyone you follow
let selected = new Set();

function compare() {
  if (!files.following || !files.follower) return;
  const followers = new Set(files.follower.map((x) => x.id));
  following = files.following;
  mutualIds = new Set(following.filter((x) => followers.has(x.id)).map((x) => x.id));
  selected = new Set();
  $('result').hidden = false;
  $('kF').textContent = fa(following.length);
  $('kR').textContent = fa(files.follower.length);
  $('kM').textContent = fa(mutualIds.size);
  draw();
}

// rows for the current tab: "no" = following without a follow-back; "all" = everyone, optionally without mutuals
function visibleRows() {
  const protect = $('protect').checked;
  const q = $('q').value.trim();
  return following.filter((x) => {
    if (tab === 'no' && mutualIds.has(x.id)) return false;
    if (tab === 'all' && protect && mutualIds.has(x.id)) return false;
    return !q || x.id.includes(q);
  });
}

function draw() {
  const rows = visibleRows();
  const notBackCount = following.length - mutualIds.size;
  $('heroN').textContent = fa(notBackCount);
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('protectWrap').style.opacity = tab === 'all' ? 1 : 0.4;
  $('count').textContent = `${fa(rows.length)} حساب`;
  const list = $('list');
  list.innerHTML = rows.length ? '' : '<div class="muted" style="padding:24px;text-align:center">چیزی پیدا نشد 🎉</div>';
  rows.slice(0, 300).forEach((x) => {
    const mutual = mutualIds.has(x.id);
    const row = document.createElement('label');
    row.className = 'row';
    row.innerHTML = `<input type="checkbox" ${selected.has(x.id) ? 'checked' : ''}>
      <span class="id">${esc(x.id)}</span>
      <span style="margin-inline-start:auto;font-size:12px;color:${mutual ? '#ff79b0' : '#6b6b6b'}">${mutual ? 'دوطرفه' : 'فالوبک نمی‌دهد'}</span>`;
    row.querySelector('input').addEventListener('change', (e) => { e.target.checked ? selected.add(x.id) : selected.delete(x.id); updateSel(); });
    list.appendChild(row);
  });
  if (rows.length > 300) list.insertAdjacentHTML('beforeend', `<div class="muted" style="padding:10px;text-align:center;font-size:12px">${fa(rows.length - 300)} مورد دیگر — با جستجو پیدا کنید</div>`);
  updateSel();
}
function updateSel() { $('sel').textContent = `${fa(selected.size)} انتخاب‌شده`; }

// only accounts that do not follow back can be unfollowed from here
const chosen = () => following.filter((x) => selected.has(x.id) && !mutualIds.has(x.id));

document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; selected.clear(); draw(); }));
$('protect').addEventListener('change', draw);
$('q').addEventListener('input', draw);
$('all').addEventListener('click', () => { visibleRows().forEach((x) => { if (!mutualIds.has(x.id)) selected.add(x.id); }); draw(); });
$('none').addEventListener('click', () => { selected.clear(); draw(); });
$('copy').addEventListener('click', () => {
  const rows = selected.size ? chosen() : visibleRows().filter((x) => !mutualIds.has(x.id));
  navigator.clipboard.writeText(rows.map((x) => x.id).join('\n'));
  toast(`${fa(rows.length)} شناسه کپی شد ✓`);
});

function startUnfollow(mode, extra = {}) {
  const rows = chosen();
  if (!rows.length) return toast('اول چند نفر را انتخاب کنید (فقط کسانی که فالوبک نمی‌دهند)');
  chrome.runtime.sendMessage({ type: 'start', kind: 'unfollow', mode, links: rows.map((x) => x.link), closeTab: true, autoNext: false, ...extra });
  const done = new Set(rows.map((x) => x.id));
  following = following.filter((x) => !done.has(x.id));
  selected.clear();
  draw();
  $('kF').textContent = fa(following.length);
  toast(mode === 'manual' ? 'صف آنفالو شروع شد. در هر صفحه خودتان آنفالو کنید.' : 'آنفالو خودکار شروع شد. وضعیتش را در پنجره‌ی اکستنشن ببینید.');
}
$('manual').addEventListener('click', () => startUnfollow('manual'));
$('auto').addEventListener('click', () => { $('autoWarn').hidden = false; $('autoCfg').hidden = false; });
$('go').addEventListener('click', () => {
  const min = Math.max(20, +$('mn').value || 30), max = Math.max(min, +$('mx').value || 60), cap = Math.max(1, Math.min(400, +$('cap').value || 50));
  startUnfollow('auto', { delayMinMs: min * 1000, delayMaxMs: max * 1000, preMinMs: 1500, preMaxMs: 3500, dailyCap: cap });
});
