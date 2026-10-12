// Backup and restore of everything the extension keeps in the browser (settings, library, templates, AI settings…).
const $ = (id) => document.getElementById(id);
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
if (new URLSearchParams(location.search).has('embed')) { document.body.classList.add('embed'); document.documentElement.classList.add('embed'); }

// What to include: [storage keys, label]. Run state, caches and one-off flags are not backed up.
const GROUPS = [
  [['library'], 'کتابخانه (توییت‌های ذخیره‌شده و پوشه‌ها)'],
  [['templates', 'drafts'], 'قالب‌ها و پیش‌نویس‌ها'],
  [['ai'], 'تنظیمات کامنت هوشمند (شامل کلید OpenRouter و پرامپت)'],
  [['followData', 'followWhitelist'], 'فهرست دنبال‌شوندگان و لیست سفید'],
  [['analytics'], 'آخرین آمار توییت‌ها'],
  [['settings', 'tools', 'cardOpts', 'audience', 'lang', 'plan'], 'تنظیمات و ترجیحات'],
];
const sizeOf = (o) => new Blob([JSON.stringify(o)]).size;

async function draw() {
  const all = await chrome.storage.local.get(null);
  $('items').innerHTML = '';
  GROUPS.forEach(([keys, label], i) => {
    const part = Object.fromEntries(keys.filter((k) => all[k] !== undefined).map((k) => [k, all[k]]));
    const has = Object.keys(part).length > 0;
    const row = document.createElement('label');
    row.className = 'item';
    row.innerHTML = `<input type="checkbox" data-i="${i}" ${has ? 'checked' : 'disabled'}><span style="${has ? '' : 'opacity:.5'}">${label}</span><small>${has ? `${fa((sizeOf(part) / 1024).toFixed(1))} کیلوبایت` : 'خالی'}</small>`;
    $('items').appendChild(row);
  });
  update();
}
function selected() { return [...document.querySelectorAll('#items input:checked')].map((c) => GROUPS[+c.dataset.i]); }
async function update() {
  const all = await chrome.storage.local.get(null);
  const keys = selected().flatMap(([k]) => k);
  $('keyNote').hidden = !keys.includes('ai') || !all.ai?.apiKey;
  $('size').textContent = `${fa((sizeOf(Object.fromEntries(keys.filter((k) => all[k] !== undefined).map((k) => [k, all[k]]))) / 1024).toFixed(1))} کیلوبایت`;
}
$('items').addEventListener('change', update);

$('export').addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const keys = selected().flatMap(([k]) => k);
  if (!keys.length) return;
  const data = Object.fromEntries(keys.filter((k) => all[k] !== undefined).map((k) => [k, all[k]]));
  const file = { app: 'x-auto-liker', version: chrome.runtime.getManifest().version, at: new Date().toISOString(), data };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  a.download = `x-auto-liker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});

$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.app !== 'x-auto-liker' || typeof j.data !== 'object') throw new Error('این فایل پشتیبان X Auto Liker نیست');
    await chrome.storage.local.set(j.data);
    $('msg').className = 'ok'; $('msg').style.color = 'var(--green)';
    $('msg').textContent = `✓ ${fa(Object.keys(j.data).length)} بخش برگردانده شد`;
    draw();
  } catch (err) { $('msg').style.color = '#ff8a95'; $('msg').textContent = `✗ ${err.message}`; }
});
draw();
