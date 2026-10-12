// Mentions inbox: what content/mentions.js saved from X's notifications page. Suggests replies through the
// background (the user's OpenRouter key). "در کادر X" only opens the tweet and places the text in its reply
// box; the user sends it.
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KINDS = { all: 'همه', priority: 'مهم', question: 'سؤال', thanks: 'تشکر', other: 'بقیه' };
const KIND_LABEL = { priority: '⭐ مهم', question: '❓ سؤال', thanks: '🙏 تشکر', other: '💬 بقیه' };
const list = document.getElementById('list');
const tabs = document.getElementById('tabs');
const onlyOpen = document.getElementById('onlyOpen');
const tone = document.getElementById('tone');
let filter = 'all';
let items = [];
const suggestions = new Map(); // id -> { loading, items, error, code }

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

async function load() {
  const { inbox = {} } = await chrome.storage.local.get('inbox');
  items = Object.values(inbox).sort((a, b) => b.at - a.at);
  render();
}

function visible() {
  return items.filter((m) => (filter === 'all' || m.kind === filter) && (!onlyOpen.checked || !m.done));
}

function renderTabs() {
  tabs.innerHTML = Object.entries(KINDS).map(([k, label]) => {
    const n = k === 'all' ? items.length : items.filter((m) => m.kind === k).length;
    return `<button class="chip ${filter === k ? 'on' : ''}" data-k="${k}">${label}<b>${fa(n)}</b></button>`;
  }).join('');
}

function card(m) {
  const s = suggestions.get(m.id);
  let sugg = '';
  if (s?.loading) sugg = '<div class="sugg"><div class="muted">در حال ساختن پیشنهادها…</div></div>';
  else if (s?.error) sugg = `<div class="err">${esc(s.error)}</div>${s.code === 'no_key' || s.code === 'auth' ? '<div class="acts" style="margin-top:6px"><a href="ai.html">⚙️ وارد کردن کلید</a></div>' : ''}`;
  else if (s?.items) {
    sugg = `<div class="sugg">${s.items.map((it, i) => `
      <div class="opt"><p>${esc(it.text)}</p>${it.fa ? `<small>${esc(it.fa)}</small>` : ''}
        <div class="acts">
          <button data-act="copy" data-id="${esc(m.id)}" data-i="${i}">📋 کپی</button>
          <button class="ghost" data-act="place" data-id="${esc(m.id)}" data-i="${i}">↗ در کادر X بگذار</button>
        </div></div>`).join('')}</div>`;
  }
  return `
    <article class="msg ${m.done ? 'done' : ''}" data-id="${esc(m.id)}">
      <div class="head">
        <img src="${esc(m.avatar)}" alt="" onerror="this.style.visibility='hidden'">
        <div><b>${esc(m.name || m.handle)}</b><span>@${esc(m.handle)}</span></div>
        <span class="kind ${esc(m.kind)}">${KIND_LABEL[m.kind] || ''}</span>
      </div>
      <div class="tx">${esc(m.text) || '<span class="muted">بدون متن</span>'}</div>
      <div class="acts">
        <button data-act="suggest" data-id="${esc(m.id)}">💡 پیشنهاد پاسخ</button>
        <a href="${esc(m.url)}" target="_blank" rel="noopener">↗ باز کردن توییت</a>
        <button data-act="done" data-id="${esc(m.id)}">${m.done ? '↩ برگرداندن' : '✓ انجام شد'}</button>
      </div>
      ${sugg}
    </article>`;
}

function render() {
  renderTabs();
  const v = visible();
  if (!items.length) {
    list.innerHTML = '<div class="note"><div style="font-size:30px">📥</div><p>هنوز منشنی ذخیره نشده. صفحه‌ی اعلان‌های X را باز کنید؛ منشن‌ها و جواب‌هایی که می‌بینید اینجا ثبت می‌شوند.</p></div>';
    return;
  }
  list.innerHTML = v.length ? v.map(card).join('') : '<div class="note">چیزی با این فیلتر نیست 🎉</div>';
}

async function save(id, patch) {
  const { inbox = {} } = await chrome.storage.local.get('inbox');
  if (!inbox[id]) return;
  Object.assign(inbox[id], patch);
  await chrome.storage.local.set({ inbox });
  const m = items.find((x) => x.id === id);
  if (m) Object.assign(m, patch);
}

async function suggest(id) {
  const m = items.find((x) => x.id === id);
  if (!m) return;
  suggestions.set(id, { loading: true });
  render();
  const res = await chrome.runtime.sendMessage({
    type: 'aiComments',
    tweet: { text: m.text, name: m.name, handle: m.handle, lang: '' },
    extra: `این توییت جوابی است که @${m.handle} به من داده. پاسخ من به این جواب را بنویس. لحن: ${tone.value}.`,
    count: 3,
  }).catch((e) => ({ ok: false, error: e.message }));
  suggestions.set(id, res?.ok ? { items: res.items } : { error: res?.error || 'خطا', code: res?.code });
  render();
}

list.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const { id, act } = b.dataset;
  const m = items.find((x) => x.id === id);
  if (!m) return;
  if (act === 'suggest') return suggest(id);
  if (act === 'done') { await save(id, { done: !m.done }); return render(); }
  const s = suggestions.get(id);
  const pick = s?.items?.[Number(b.dataset.i)];
  if (!pick) return;
  if (act === 'copy') {
    await navigator.clipboard.writeText(pick.text).catch(() => {});
    return toast('کپی شد ✓');
  }
  if (act === 'place') {
    await chrome.storage.local.set({ pendingReply: { id, text: pick.text, at: Date.now() } });
    await chrome.tabs.create({ url: m.url });
    toast('توییت باز شد؛ جواب داخل کادر گذاشته می‌شود');
  }
});

tabs.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  filter = b.dataset.k;
  render();
});
onlyOpen.addEventListener('change', render);
document.getElementById('clearDone').addEventListener('click', async () => {
  const { inbox = {} } = await chrome.storage.local.get('inbox');
  for (const k of Object.keys(inbox)) if (inbox[k].done) delete inbox[k];
  await chrome.storage.local.set({ inbox });
  toast('انجام‌شده‌ها پاک شد');
  load();
});
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.inbox) load(); });
load();
