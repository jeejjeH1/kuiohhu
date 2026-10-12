// Library page: saved tweets in folders with tags, plus templates and drafts.
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const main = document.getElementById('main');
const toast = (m) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2500); };

let tab = new URLSearchParams(location.search).get('tab') || 'saved';
const view = { folder: 'all', q: '', tag: '' };

async function load() {
  const { library = { folders: [{ id: 'general', name: 'عمومی' }], items: [] }, templates = [], drafts = [] } =
    await chrome.storage.local.get(['library', 'templates', 'drafts']);
  return { library, templates, drafts };
}

async function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const data = await load();
  if (tab === 'saved') renderSaved(data.library);
  else renderTexts(tab, data[tab]);
}

function renderSaved(lib) {
  const items = lib.items.filter((it) =>
    (view.folder === 'all' || it.folderId === view.folder) &&
    (!view.tag || (it.tags || []).includes(view.tag)) &&
    (!view.q || `${it.text} ${it.name} ${it.handle} ${it.note} ${(it.tags || []).join(' ')}`.toLowerCase().includes(view.q)));
  const allTags = [...new Set(lib.items.flatMap((i) => i.tags || []))];
  const countIn = (id) => lib.items.filter((i) => i.folderId === id).length;

  main.innerHTML = `
    <div class="layout">
      <aside class="card folders">
        <div class="folder ${view.folder === 'all' ? 'on' : ''}" data-id="all">📚 همه<span class="n">${fa(lib.items.length)}</span></div>
        ${lib.folders.map((f) => `<div class="folder ${view.folder === f.id ? 'on' : ''}" data-id="${f.id}">📁 ${esc(f.name)}
          <span class="tools">${f.id !== 'general' ? `<button data-ren="${f.id}" title="تغییر نام">✎</button><button data-del="${f.id}" title="حذف پوشه">🗑</button>` : ''}</span>
          <span class="n">${fa(countIn(f.id))}</span></div>`).join('')}
        <div class="row" style="margin-top:8px"><input type="text" id="nf" placeholder="پوشه‌ی جدید" style="flex:1;min-width:0"><button class="btn sm" id="af">+</button></div>
        <button class="btn ghost sm" id="exp" style="margin-top:10px">⬇ خروجی JSON</button>
      </aside>
      <section>
        <div class="row" style="margin-bottom:14px">
          <input type="search" id="q" placeholder="جستجو در توییت‌ها، یادداشت‌ها و برچسب‌ها…" value="${esc(view.q)}" style="flex:1;min-width:220px">
        </div>
        ${allTags.length ? `<div class="row" style="margin-bottom:14px">${allTags.map((t) => `<span class="chip ${view.tag === t ? 'on' : ''}" data-tag="${esc(t)}"># ${esc(t)}</span>`).join('')}</div>` : ''}
        ${items.length ? `<div class="grid">${items.map((it, i) => `
          <article class="tw" style="animation-delay:${Math.min(i, 12) * 40}ms">
            <div class="au"><img src="${esc(it.avatar)}" alt=""><div><b>${esc(it.name)}</b><span>@${esc(it.handle)}</span></div></div>
            <div class="tx">${esc(it.text) || '<span class="muted">(بدون متن)</span>'}</div>
            ${it.photo ? `<img class="ph" src="${esc(it.photo)}" alt="" loading="lazy">` : ''}
            ${it.note ? `<div class="note">📝 ${esc(it.note)}</div>` : ''}
            <div class="ft">
              ${(it.tags || []).map((t) => `<span class="tag" data-tag="${esc(t)}">#${esc(t)}</span>`).join('')}
              <span class="act">
                <select data-move="${it.id}" title="انتقال به پوشه" style="height:30px;padding:0 6px;font-size:12px">${lib.folders.map((f) => `<option value="${f.id}" ${f.id === it.folderId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
                <a class="ib" href="${esc(it.url)}" target="_blank" title="باز کردن در X">↗</a>
                <button class="ib" data-rm="${it.id}" title="حذف">🗑</button>
              </span>
            </div>
          </article>`).join('')}</div>`
    : `<div class="card empty"><b>📁</b>${lib.items.length ? 'چیزی با این جستجو پیدا نشد.' : 'هنوز توییتی ذخیره نکرده‌اید. در X روی دکمه‌ی ✦ زیر هر توییت بزنید و «ذخیره در پوشه» را انتخاب کنید.'}</div>`}
      </section>
    </div>`;

  const save = async () => { await chrome.storage.local.set({ library: lib }); render(); };
  main.querySelectorAll('.folder').forEach((el) => el.addEventListener('click', (e) => { if (e.target.closest('button')) return; view.folder = el.dataset.id; render(); }));
  main.querySelector('#af').addEventListener('click', () => {
    const name = main.querySelector('#nf').value.trim();
    if (name) { lib.folders.push({ id: uid(), name }); save(); }
  });
  main.querySelectorAll('[data-ren]').forEach((b) => b.addEventListener('click', () => {
    const f = lib.folders.find((x) => x.id === b.dataset.ren);
    const name = prompt('نام جدید پوشه:', f.name);
    if (name?.trim()) { f.name = name.trim(); save(); }
  }));
  main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.del;
    if (!confirm('پوشه حذف شود؟ توییت‌هایش به «عمومی» منتقل می‌شوند.')) return;
    lib.folders = lib.folders.filter((f) => f.id !== id);
    lib.items.forEach((i) => { if (i.folderId === id) i.folderId = 'general'; });
    if (view.folder === id) view.folder = 'all';
    save();
  }));
  main.querySelector('#q').addEventListener('input', (e) => {
    view.q = e.target.value.trim().toLowerCase();
    const pos = e.target.selectionStart;
    render().then(() => { const q = main.querySelector('#q'); q.focus(); q.setSelectionRange(pos, pos); });
  });
  main.querySelectorAll('[data-tag]').forEach((t) => t.addEventListener('click', () => { view.tag = view.tag === t.dataset.tag ? '' : t.dataset.tag; render(); }));
  main.querySelectorAll('[data-move]').forEach((s) => s.addEventListener('change', () => {
    lib.items.find((i) => i.id === s.dataset.move).folderId = s.value; save(); toast('منتقل شد ✓');
  }));
  main.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    lib.items = lib.items.filter((i) => i.id !== b.dataset.rm); save(); toast('حذف شد');
  }));
  main.querySelector('#exp').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(lib, null, 2)], { type: 'application/json' }));
    a.download = 'x-library.json'; a.click();
  });
}

function renderTexts(key, list) {
  const isT = key === 'templates';
  main.innerHTML = `
    <div class="tlist">
      <div class="card">
        <h2>${isT ? 'قالب جدید' : 'پیش‌نویس جدید'}</h2>
        <p class="muted" style="margin-bottom:10px">${isT ? 'متن‌هایی که زیاد می‌نویسید. در کادر نوشتن X دکمه‌ی «✦ قالب‌ها» را بزنید تا با یک کلیک وارد شوند — ارسال با خودتان است.' : 'متن‌هایی که بعداً می‌خواهید توییت کنید.'}</p>
        <div class="row"><textarea id="nt" style="flex:1;min-height:70px;unicode-bidi:plaintext" placeholder="متن…"></textarea></div>
        <div class="row" style="margin-top:10px"><button class="btn" id="add">افزودن</button></div>
      </div>
      ${list.length ? list.map((it) => `
        <div class="titem"><textarea data-id="${it.id}">${esc(it.text)}</textarea>
          <div style="display:flex;flex-direction:column;gap:6px"><button class="ib" data-cp="${it.id}" title="کپی">📋</button><button class="ib" data-rm="${it.id}" title="حذف">🗑</button></div></div>`).join('')
    : `<div class="card empty"><b>${isT ? '✦' : '📝'}</b>${isT ? 'هنوز قالبی ندارید.' : 'پیش‌نویسی نیست.'}</div>`}
    </div>`;
  const save = (l) => chrome.storage.local.set({ [key]: l });
  main.querySelector('#add').addEventListener('click', async () => {
    const text = main.querySelector('#nt').value.trim();
    if (!text) return;
    await save([{ id: uid(), text, at: Date.now() }, ...list]);
    render();
  });
  main.querySelectorAll('textarea[data-id]').forEach((t) => t.addEventListener('change', () => {
    list.find((i) => i.id === t.dataset.id).text = t.value; save(list); toast('ذخیره شد ✓');
  }));
  main.querySelectorAll('[data-cp]').forEach((b) => b.addEventListener('click', () => {
    navigator.clipboard.writeText(list.find((i) => i.id === b.dataset.cp).text); toast('کپی شد ✓');
  }));
  main.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
    await save(list.filter((i) => i.id !== b.dataset.rm)); render();
  }));
}

document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
render();
