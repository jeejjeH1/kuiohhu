// Analytics page: reads the tweets collected on the user's profile and shows totals, best posting
// hours/days and top tweets. Single-series charts (one hue, no legend; the title names the measure).
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => fa(Math.round(n).toLocaleString('en'));
const short = (n) => (n >= 1e6 ? `${fa((n / 1e6).toFixed(1))}M` : n >= 1e4 ? `${fa(Math.round(n / 1e3))}K` : n >= 1e3 ? `${fa((n / 1e3).toFixed(1))}K` : fa(Math.round(n)));
const pct = (x) => `${fa((x * 100).toFixed(1))}٪`;
const DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']; // JS getDay() order
const WEEK = [6, 0, 1, 2, 3, 4, 5]; // display from Saturday
const METRICS = {
  views: { label: 'میانگین بازدید', get: (t) => t.views, fmt: short },
  likes: { label: 'میانگین لایک', get: (t) => t.likes, fmt: short },
  er: { label: 'نرخ تعامل', get: (t) => (t.views ? (t.likes + t.reposts + t.replies) / t.views : 0), fmt: pct },
};
let metric = 'views';
let data = null;
const main = document.getElementById('main');

function groupAvg(tweets, keyOf, keys) {
  const g = new Map(keys.map((k) => [k, []]));
  tweets.forEach((t) => g.get(keyOf(t))?.push(t));
  const m = METRICS[metric];
  return keys.map((k) => {
    const list = g.get(k);
    return { key: k, n: list.length, value: list.length ? list.reduce((a, t) => a + m.get(t), 0) / list.length : 0 };
  });
}

// Column chart in SVG: thin bars (<=24px) with 4px rounded tops, hairline grid, hover tooltip.
function barChart(el, rows, labelOf, tipTitle) {
  const W = Math.max(300, el.clientWidth), H = 230, L = 46, R = 8, T = 16, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  const band = pw / rows.length;
  const bw = Math.min(24, band - 2);
  const y = (v) => T + ph - (v / nice) * ph;
  const m = METRICS[metric];
  const best = rows.reduce((b, r) => (r.n >= 2 && r.value > (b?.value ?? -1) ? r : b), null);
  let svg = `<svg viewBox="0 0 ${W} ${H}" dir="ltr" role="img" aria-label="${esc(tipTitle)}">`;
  for (let i = 0; i <= 4; i++) {
    const v = (nice / 4) * i;
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>`;
    svg += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" fill="var(--axis)" font-size="11">${m.fmt(v)}</text>`;
  }
  rows.forEach((r, i) => {
    const x = L + band * i + (band - bw) / 2;
    const h = Math.max(0, (r.value / nice) * ph);
    const top = T + ph - h;
    if (h > 0.5) {
      const rr = Math.min(4, h, bw / 2);
      svg += `<path d="M${x},${T + ph} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + bw - rr} Q${x + bw},${top} ${x + bw},${top + rr} V${T + ph} Z"
        fill="var(--series)" opacity="${r.n ? 1 : 0.3}" class="bar" style="transform-origin:${x}px ${T + ph}px;animation:grow .7s var(--ease) ${i * 18}ms both"/>`;
    }
    if (best && r.key === best.key) svg += `<text x="${x + bw / 2}" y="${top - 6}" text-anchor="middle" fill="var(--text)" font-size="11.5" font-weight="700">${m.fmt(r.value)}</text>`;
    const lab = labelOf(r, i);
    if (lab) svg += `<text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" fill="var(--axis)" font-size="11">${lab}</text>`;
    svg += `<rect x="${L + band * i}" y="${T}" width="${band}" height="${ph}" fill="transparent" data-i="${i}" style="cursor:default"/>`;
  });
  svg += `<line x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}" stroke="rgba(255,255,255,.18)" stroke-width="1"/></svg><div class="tip"></div>`;
  el.innerHTML = svg;
  const tip = el.querySelector('.tip');
  el.querySelectorAll('rect[data-i]').forEach((rc) => {
    rc.addEventListener('mouseenter', () => {
      const r = rows[+rc.dataset.i];
      tip.innerHTML = `<span class="muted">${tipTitle(r)}</span><b>${r.n ? m.fmt(r.value) : '—'}</b><span class="muted">${fa(r.n)} توییت</span>`;
      const bx = (+rc.getAttribute('x') + band / 2) * (el.clientWidth / W);
      tip.style.left = `${Math.min(el.clientWidth - 130, Math.max(0, bx - 60))}px`;
      tip.style.top = '-6px';
      tip.classList.add('show');
    });
    rc.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });
}

let audience = null;
function audienceCard() {
  const list = Object.values(audience?.people || {}).sort((a, b) => b.replies - a.replies || b.likes - a.likes).slice(0, 10);
  if (!list.length) return `<div class="card" style="margin-top:14px"><h2>👥 مخاطبان فعال</h2><p class="muted" style="font-size:13px">هنوز داده‌ای نیست. هر وقت زیر توییت‌های خودتان را در X باز می‌کنید و جواب‌ها را می‌خوانید، اکستنشن ثبت می‌کند چه کسانی جواب داده‌اند. هیچ درخواستی به X فرستاده نمی‌شود.</p></div>`;
  const max = list[0].replies;
  return `<div class="card" style="margin-top:14px"><h2>👥 مخاطبان فعال</h2><p class="muted" style="font-size:12px;margin-bottom:8px">بر اساس جواب‌هایی که زیر توییت‌های خودتان دیده‌اید · ${fa(Object.keys(audience.people).length)} نفر ثبت شده</p>${list.map((p, i) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06)"><span style="width:22px;color:var(--muted)">${fa(i + 1)}</span><img src="${esc(p.avatar)}" style="width:34px;height:34px;border-radius:50%;background:#222" alt=""><div style="flex:1;min-width:0"><a href="https://x.com/${esc(p.handle)}" target="_blank" style="font-weight:700;text-decoration:none">${esc(p.name || p.handle)}</a> <span class="muted" dir="ltr" style="font-size:12px">@${esc(p.handle)}</span></div><div style="width:90px;height:6px;border-radius:6px;background:rgba(255,255,255,.08);overflow:hidden"><i style="display:block;height:100%;width:${(p.replies / max) * 100}%;background:var(--series)"></i></div><b style="width:70px;text-align:left">${fa(p.replies)} جواب</b></div>`).join('')}</div>`;
}

function render() {
  if (!data?.tweets?.length) {
    main.innerHTML = `<div class="card empty"><b>📊</b>هنوز داده‌ای نیست.<br>در X به صفحه‌ی پروفایل خودتان بروید و دکمه‌ی «📊 آمار توییت‌های من» پایین صفحه را بزنید.</div>${audienceCard()}`;
    return;
  }
  const tw = data.tweets.map((t) => ({ ...t, d: new Date(t.time) }));
  document.getElementById('sub').textContent = `@${data.handle} · ${fa(tw.length)} توییت آخر · ${new Date(data.collectedAt).toLocaleString('fa-IR')}`;
  const sum = (f) => tw.reduce((a, t) => a + f(t), 0);
  const views = sum((t) => t.views), likes = sum((t) => t.likes), eng = sum((t) => t.likes + t.reposts + t.replies);
  const m = METRICS[metric];

  const hours = groupAvg(tw, (t) => t.d.getHours(), [...Array(24).keys()]);
  const days = groupAvg(tw, (t) => t.d.getDay(), WEEK);
  const bestH = hours.filter((h) => h.n >= 2).sort((a, b) => b.value - a.value)[0];
  const bestD = days.filter((h) => h.n >= 2).sort((a, b) => b.value - a.value)[0];
  const media = tw.filter((t) => t.photo || t.video), plain = tw.filter((t) => !t.photo && !t.video);
  const avg = (l) => (l.length ? l.reduce((a, t) => a + m.get(t), 0) / l.length : 0);
  const lift = plain.length && media.length && avg(plain) ? avg(media) / avg(plain) : null;

  main.innerHTML = `
    <div class="kpis">
      <div class="card kpi"><b>${fmt(tw.length)}</b><span>توییت بررسی‌شده</span></div>
      <div class="card kpi" style="animation-delay:60ms"><b>${short(views / tw.length)}</b><span>میانگین بازدید هر توییت</span></div>
      <div class="card kpi" style="animation-delay:120ms"><b>${short(likes / tw.length)}</b><span>میانگین لایک</span></div>
      <div class="card kpi" style="animation-delay:180ms"><b>${views ? pct(eng / views) : '—'}</b><span>نرخ تعامل (لایک+ریپست+ریپلای ÷ بازدید)</span></div>
    </div>
    <div class="insights">
      <div class="card ins"><i>🕘</i><div><span class="muted">بهترین ساعت انتشار</span><b>${bestH ? `ساعت ${fa(bestH.key)} تا ${fa((bestH.key + 1) % 24)}` : 'داده‌ی کافی نیست'}</b></div></div>
      <div class="card ins"><i>📅</i><div><span class="muted">بهترین روز هفته</span><b>${bestD ? DAYS[bestD.key] : 'داده‌ی کافی نیست'}</b></div></div>
      <div class="card ins"><i>🖼</i><div><span class="muted">توییت با عکس/ویدیو</span><b>${lift ? (lift >= 1 ? `${fa(lift.toFixed(1))} برابر بهتر از متن خالی` : `${fa((1 / lift).toFixed(1))} برابر ضعیف‌تر از متن خالی`) : 'داده‌ی کافی نیست'}</b></div></div>
    </div>
    <div class="charts">
      <div class="card"><h2>${m.label} بر اساس ساعت انتشار</h2><p class="muted" style="font-size:12px;margin-bottom:10px">به وقت همین کامپیوتر · ستون کم‌رنگ = بدون توییت</p>
        <div class="chart" id="cH"></div>
        <details><summary>نمایش به‌صورت جدول</summary><table>${hours.map((h) => `<tr><td>ساعت ${fa(h.key)}</td><td class="num">${h.n ? m.fmt(h.value) : '—'}</td><td class="num">${fa(h.n)} توییت</td></tr>`).join('')}</table></details></div>
      <div class="card"><h2>${m.label} بر اساس روز هفته</h2><p class="muted" style="font-size:12px;margin-bottom:10px">از شنبه تا جمعه</p>
        <div class="chart" id="cD"></div>
        <details><summary>نمایش به‌صورت جدول</summary><table>${days.map((h) => `<tr><td>${DAYS[h.key]}</td><td class="num">${h.n ? m.fmt(h.value) : '—'}</td><td class="num">${fa(h.n)} توییت</td></tr>`).join('')}</table></details></div>
    </div>
    <div class="card"><h2>برترین توییت‌ها</h2><p class="muted" style="font-size:12px;margin-bottom:8px">روی عنوان ستون بزنید تا مرتب شود</p>
      <div style="overflow:auto"><table id="top"></table></div></div>${audienceCard()}`;

  const draw = () => {
    barChart(document.getElementById('cH'), hours, (r) => (r.key % 3 === 0 ? fa(r.key) : ''), (r) => `ساعت ${fa(r.key)}`);
    barChart(document.getElementById('cD'), days, (r) => DAYS[r.key].slice(0, 1), (r) => DAYS[r.key]);
  };
  draw();
  window.onresize = draw;
  drawTable(tw);
}

let sortKey = 'views';
function drawTable(tw) {
  const cols = [['text', 'توییت'], ['time', 'تاریخ'], ['views', 'بازدید'], ['likes', 'لایک'], ['reposts', 'ریپست'], ['replies', 'ریپلای'], ['er', 'تعامل']];
  const val = (t, k) => (k === 'er' ? METRICS.er.get(t) : k === 'time' ? +t.d : t[k]);
  const rows = [...tw].sort((a, b) => val(b, sortKey) - val(a, sortKey)).slice(0, 25);
  const maxV = Math.max(...tw.map((t) => t.views), 1);
  const el = document.getElementById('top');
  el.innerHTML = `<tr>${cols.map(([k, l]) => `<th data-k="${k}" class="${k !== 'text' && k !== 'time' ? 'num' : ''} ${k === sortKey ? 'sorted' : ''}">${l}${k === sortKey ? ' ↓' : ''}</th>`).join('')}</tr>` +
    rows.map((t) => `<tr>
      <td class="txt"><a href="${esc(t.url)}" target="_blank">${esc(t.text) || '(بدون متن)'}</a></td>
      <td style="white-space:nowrap" class="muted">${t.d.toLocaleDateString('fa-IR')}</td>
      <td class="num">${short(t.views)}<span class="vbar" style="width:${Math.round((t.views / maxV) * 60)}px"></span></td>
      <td class="num">${short(t.likes)}</td><td class="num">${short(t.reposts)}</td><td class="num">${short(t.replies)}</td>
      <td class="num">${t.views ? pct(METRICS.er.get(t)) : '—'}</td></tr>`).join('');
  el.querySelectorAll('th[data-k]').forEach((th) => th.addEventListener('click', () => { if (th.dataset.k !== 'text') { sortKey = th.dataset.k; drawTable(tw); } }));
}

document.querySelectorAll('#metric .chip').forEach((c) => c.addEventListener('click', () => {
  metric = c.dataset.m;
  document.querySelectorAll('#metric .chip').forEach((x) => x.classList.toggle('on', x === c));
  render();
}));
const st = document.createElement('style');
st.textContent = '@keyframes grow { from { transform: scaleY(0); } }';
document.head.appendChild(st);
chrome.storage.local.get(['analytics', 'audience']).then(({ analytics, audience: a }) => { data = analytics; audience = a; render(); });
