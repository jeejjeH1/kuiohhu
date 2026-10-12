// Post queue: plain drafts and scheduled posts, stored in the same `drafts` list the composer and library use.
const $ = (id) => document.getElementById(id);
const Q = self.XQ;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtTime = (ms) => new Date(ms).toLocaleString(navigator.language?.startsWith('en') ? 'en' : 'fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
const toLocalInput = (ms) => {
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const say = (t) => { const e = document.createElement('div'); e.className = 'card'; e.textContent = t; e.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 16px;z-index:9'; document.body.appendChild(e); setTimeout(() => e.remove(), 2200); };

async function getAll() {
  const { drafts = [] } = await chrome.storage.local.get('drafts');
  return drafts;
}
async function setAll(list) { await chrome.storage.local.set({ drafts: list.slice(0, 300) }); }

function updateCount() {
  const n = Q.charCount($('text').value);
  $('cnt').textContent = `${n} / ${Q.X_LIMIT}`;
  $('cnt').classList.toggle('over', n > Q.X_LIMIT);
}

async function add(withTime) {
  const text = $('text').value.trim();
  if (!text) return say('متنی نوشته نشده');
  let due;
  if (withTime) {
    due = Date.parse($('when').value);
    if (!isFinite(due)) return say('زمان را درست وارد کنید');
  }
  const list = await getAll();
  const item = { id: uid(), text, at: Date.now(), ...(due !== undefined ? { due } : {}) };
  await setAll([item, ...list]);
  $('text').value = '';
  $('when').value = '';
  updateCount();
  say(due !== undefined ? 'در صف زمان‌بندی شد ✓' : 'پیش‌نویس ذخیره شد ✓');
  render();
}

function row(item, kind) {
  const d = document.createElement('div');
  d.className = 'item';
  const due = typeof item.due === 'number';
  const overdue = due && item.due <= Date.now();
  d.innerHTML = `
    <div class="txt">${esc(item.text)}</div>
    <div class="meta">${due ? `<span class="badge ${overdue ? 'due' : ''}">${overdue ? 'زمانش رسیده' : 'زمان‌بندی'}</span> ${esc(fmtTime(item.due))} · ` : ''}${Q.charCount(item.text)} / ${Q.X_LIMIT}</div>
    <div class="acts">
      <a class="btn sm" href="${esc(Q.intentUrl(item.text))}" target="_blank" rel="noopener">باز کردن در X ↗</a>
      <button class="btn ghost sm" data-act="copy">کپی</button>
      ${kind === 'sched' ? '<button class="btn ghost sm" data-act="time">تغییر زمان</button>' : '<button class="btn ghost sm" data-act="plan">زمان‌بندی</button>'}
      <button class="btn ghost sm" data-act="sent">ارسال شد ✓</button>
      <button class="btn danger sm" data-act="del">حذف</button>
    </div>`;
  d.querySelector('[data-act="copy"]').addEventListener('click', async () => { await navigator.clipboard.writeText(item.text).catch(() => {}); say('کپی شد ✓'); });
  d.querySelector('[data-act="sent"]').addEventListener('click', async () => {
    await setAll((await getAll()).map((x) => (x.id === item.id ? { ...x, sent: Date.now() } : x)));
    render();
  });
  d.querySelector('[data-act="del"]').addEventListener('click', async () => {
    if (!confirm('این مورد حذف شود؟')) return;
    await setAll((await getAll()).filter((x) => x.id !== item.id));
    render();
  });
  const planBtn = d.querySelector('[data-act="time"], [data-act="plan"]');
  planBtn.addEventListener('click', async () => {
    const v = prompt('زمان جدید (مثلاً ۲۰۲۶-۱۰-۱۳ ۲۰:۳۰)، یا خالی برای برداشتن زمان:', item.due ? toLocalInput(item.due) : '');
    if (v === null) return;
    const ms = v.trim() ? Date.parse(v.trim().replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(' ', 'T')) : NaN;
    const list = (await getAll()).map((x) => {
      if (x.id !== item.id) return x;
      if (!v.trim()) { const { due, notified, ...rest } = x; return rest; }
      if (!isFinite(ms)) return x;
      const { notified, ...rest } = x;
      return { ...rest, due: ms };
    });
    if (v.trim() && !isFinite(ms)) return say('زمان درست نیست');
    await setAll(list);
    render();
  });
  return d;
}

async function render() {
  const { scheduled, drafts } = Q.sortQueue(await getAll());
  $('sched').innerHTML = '';
  $('drafts').innerHTML = '';
  if (!scheduled.length) $('sched').innerHTML = '<div class="empty">زمان‌بندی‌ای نیست.</div>';
  scheduled.forEach((x) => $('sched').appendChild(row(x, 'sched')));
  if (!drafts.length) $('drafts').innerHTML = '<div class="empty">پیش‌نویسی نیست.</div>';
  drafts.forEach((x) => $('drafts').appendChild(row(x, 'draft')));
}

$('text').addEventListener('input', updateCount);
$('add').addEventListener('click', () => add(true));
$('addNow').addEventListener('click', () => add(false));
if (new URLSearchParams(location.search).has('embed')) document.body.classList.add('embed');
updateCount();
render();
