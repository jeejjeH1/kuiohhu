// Interactions page: who engaged with you, how often, and who has gone quiet. Reads local data only.
const $ = (id) => document.getElementById(id);
const T = self.XI_TRACK;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const DAY = 86400e3;
const ICON = { like: '♥', repost: '↻', reply: '💬', quote: '❝', mention: '@', follow: '＋' };
let quietOnly = false;

async function load() {
  const { interactEvents = [], sorsaCache = {} } = await chrome.storage.local.get(['interactEvents', 'sorsaCache']);
  const scores = {};
  for (const [h, rec] of Object.entries(sorsaCache)) if (rec?.v?.score != null) scores[h] = rec.v.score;
  return { events: interactEvents, scores };
}

async function render() {
  const { events, scores } = await load();
  const now = Date.now();
  const rows = T.summarize(events, now, { scores });
  const minScore = parseFloat($('minScore').value) || 0;
  const shown = rows.filter((r) => (r.score ?? 0) >= minScore && (!quietOnly || r.quiet));
  $('sWeek').textContent = fa(events.filter((e) => now - e.t < 7 * DAY).length);
  $('sAcc').textContent = fa(rows.length);
  $('sQuiet').textContent = fa(rows.filter((r) => r.quiet).length);
  if (!shown.length) {
    $('list').innerHTML = `<div class="empty">${events.length ? 'موردی با این فیلتر نیست.' : 'هنوز تعاملی ثبت نشده. صفحه‌ی اعلان‌های X را باز کنید؛ اینجا خودکار جمع می‌شود.'}</div>`;
    return;
  }
  const body = shown.map((r) => {
    const c = Object.entries(r.counts).filter(([, v]) => v).map(([k, v]) => `${ICON[k] || k} ${fa(v)}`).join('  ');
    const last = new Date(r.last).toLocaleDateString('fa-IR');
    return `<tr>
      <td><a href="https://x.com/${encodeURIComponent(r.handle)}" target="_blank" rel="noopener"><b>${esc(r.name || r.handle)}</b><div class="muted n" style="font-size:12px">@${esc(r.handle)}</div></a></td>
      <td class="sc hide">${r.score != null ? fa(Math.round(r.score)) : '—'}</td>
      <td class="hide">${c}</td>
      <td class="n">${fa(r.week)}</td>
      <td>${esc(last)}${r.quiet ? ' <span class="quiet">· ساکت</span>' : ''}</td>
    </tr>`;
  }).join('');
  $('list').innerHTML = `<table><thead><tr><th>حساب</th><th class="hide">Sorsa</th><th class="hide">نوع تعامل</th><th>۷ روز</th><th>آخرین</th></tr></thead><tbody>${body}</tbody></table>`;
}

$('minScore').addEventListener('input', render);
$('quietOnly').addEventListener('click', () => { quietOnly = !quietOnly; $('quietOnly').classList.toggle('on', quietOnly); render(); });
$('clear').addEventListener('click', async () => {
  if (!confirm('همه‌ی تعامل‌های ثبت‌شده حذف شوند؟')) return;
  await chrome.storage.local.remove('interactEvents');
  render();
});
if (new URLSearchParams(location.search).has('embed')) document.body.classList.add('embed');
render();
