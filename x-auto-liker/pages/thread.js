// Printable view of a saved thread ("Save as PDF" in the print dialog).
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

chrome.storage.local.get('threadPrint').then(({ threadPrint: th }) => {
  const paper = document.getElementById('paper');
  if (!th) { paper.innerHTML = '<p>رشته‌ای برای نمایش نیست.</p>'; return; }
  document.title = `رشته‌ی ${th.author.name} — X Auto Liker`;
  const date = th.tweets[0]?.time ? new Date(th.tweets[0].time).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  paper.innerHTML = `
    <div class="au"><img src="${esc(th.author.avatar.replace(/_normal\./, '_200x200.'))}" alt="">
      <div><b>${esc(th.author.name)}</b><span>@${esc(th.author.handle)}</span></div>
      <small>${fa(th.tweets.length)} توییت<br>${date}</small></div>
    ${th.tweets.map((t, i) => `<div class="t"><span class="n">${fa(i + 1)}</span><p>${esc(t.text)}</p>
      ${t.photos.map((p) => `<img src="${esc(p.replace(/name=\w+/, 'name=large'))}" alt="">`).join('')}</div>`).join('')}
    <div class="src">${esc(th.url)}</div>`;
  const plain = th.tweets.map((t, i) => `${i + 1}/ ${t.text}`).join('\n\n') + `\n\n— ${th.author.name} (@${th.author.handle})\n${th.url}`;
  document.getElementById('pdf').addEventListener('click', () => print());
  document.getElementById('cp').addEventListener('click', () => {
    navigator.clipboard.writeText(plain);
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = 'کپی شد ✓'; document.body.appendChild(t); setTimeout(() => t.remove(), 2400);
  });
});
