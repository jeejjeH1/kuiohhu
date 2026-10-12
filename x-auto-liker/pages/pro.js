// Demo of the Free / Pro screen. Nothing is validated or unlocked; the "plan" is only stored for display.
const $ = (id) => document.getElementById(id);
if (new URLSearchParams(location.search).has('embed')) { document.body.classList.add('embed'); document.documentElement.classList.add('embed'); }
const FORMAT = /^XAL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

async function draw() {
  const { plan } = await chrome.storage.local.get('plan');
  const cur = $('cur');
  cur.hidden = !plan;
  if (plan) {
    cur.innerHTML = `<div class="row" style="justify-content:space-between"><div><b style="color:#2fe39a">⭐ Pro فعال است (نمایشی)</b><div class="muted" style="font-size:12.5px;direction:ltr;text-align:right">${plan.key.slice(0, 8)}••••-••••</div></div><button class="btn danger sm" id="off">غیرفعال کردن</button></div>`;
    $('off').addEventListener('click', async () => { await chrome.storage.local.remove('plan'); draw(); });
  }
}
$('key').addEventListener('input', (e) => {
  // format as the user types: XAL-XXXX-XXXX-XXXX
  const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^XAL/, '').slice(0, 12);
  e.target.value = raw ? `XAL-${raw.match(/.{1,4}/g).join('-')}` : '';
});
$('go').addEventListener('click', async () => {
  const key = $('key').value.trim().toUpperCase();
  if (!FORMAT.test(key)) { $('msg').style.color = '#ff8a95'; $('msg').textContent = 'قالب کلید درست نیست (XAL-XXXX-XXXX-XXXX).'; return; }
  await chrome.storage.local.set({ plan: { tier: 'pro', demo: true, key, at: Date.now() } });
  $('msg').style.color = 'var(--green)'; $('msg').textContent = '✓ فعال شد (نمایشی؛ بررسی واقعی انجام نشد)';
  draw();
});
draw();
