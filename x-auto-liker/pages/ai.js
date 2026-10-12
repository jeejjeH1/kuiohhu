// Settings for the AI comment suggestions: OpenRouter key, model, count, language, and the editable prompt.
const $ = (id) => document.getElementById(id);
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
if (new URLSearchParams(location.search).has('embed')) { document.body.classList.add('embed'); document.documentElement.classList.add('embed'); }
let defaults = null;

const ctxLabel = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}K`);

async function loadModels(force) {
  const res = await chrome.runtime.sendMessage({ type: 'aiModels', force }).catch(() => null);
  const sel = $('model'), cur = sel.value || cfg.model;
  sel.innerHTML = '<option value="auto">auto — بهترین مدل رایگان (پیشنهادی)</option>';
  if (res?.ok) res.list.forEach((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = `${m.id}  ·  ${ctxLabel(m.ctx)}`; sel.appendChild(o); });
  else setStatus(`لیست مدل‌ها گرفته نشد (${res?.error || 'اینترنت'}). گزینه‌ی «خودکار» همچنان کار می‌کند.`, 'err');
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  else if (cur && cur !== 'auto') { const o = document.createElement('option'); o.value = cur; o.textContent = cur; sel.appendChild(o); sel.value = cur; }
}

function setStatus(t, cls = '') { $('status').textContent = t; $('status').className = cls; }
let cfg = {};

async function init() {
  defaults = (await chrome.runtime.sendMessage({ type: 'aiDefaults' })).defaults;
  const { ai } = await chrome.storage.local.get('ai');
  cfg = { ...defaults, ...(ai || {}) };
  $('key').value = cfg.apiKey; $('count').value = cfg.count; $('lang').value = cfg.lang; $('temp').value = cfg.temperature; $('prompt').value = cfg.prompt;
  $('tv').textContent = fa(Number(cfg.temperature).toFixed(1));
  await loadModels(false);
}

$('temp').addEventListener('input', () => { $('tv').textContent = fa(Number($('temp').value).toFixed(1)); });
$('eye').addEventListener('click', () => { $('key').type = $('key').type === 'password' ? 'text' : 'password'; });
$('reload').addEventListener('click', () => loadModels(true));
$('reset').addEventListener('click', () => { $('prompt').value = defaults.prompt; });
document.querySelectorAll('.ph').forEach((b) => b.addEventListener('click', () => {
  const t = $('prompt'), s = t.selectionStart, e = t.selectionEnd;
  t.value = t.value.slice(0, s) + b.dataset.ph + t.value.slice(e);
  t.focus(); t.selectionStart = t.selectionEnd = s + b.dataset.ph.length;
}));

$('test').addEventListener('click', async () => {
  const key = $('key').value.trim();
  if (!key) return setStatus('اول کلید را وارد کنید.', 'err');
  setStatus('در حال تست…');
  const r = await chrome.runtime.sendMessage({ type: 'aiTestKey', key }).catch((e) => ({ ok: false, error: e.message }));
  setStatus(r.ok ? `✓ کلید معتبر است${r.label ? ` (${r.label})` : ''}${r.free ? ' — حساب رایگان: سقف روزانه‌ی کمتری دارد' : ''}` : `✗ ${r.error}`, r.ok ? 'ok' : 'err');
});

$('save').addEventListener('click', async () => {
  const count = Math.max(3, Math.min(15, +$('count').value || 10));
  const ai = { apiKey: $('key').value.trim(), model: $('model').value, count, lang: $('lang').value, temperature: +$('temp').value, prompt: $('prompt').value.trim() || defaults.prompt };
  await chrome.storage.local.set({ ai });
  $('saved').textContent = 'ذخیره شد ✓'; setTimeout(() => { $('saved').textContent = ''; }, 2500);
});

init();
