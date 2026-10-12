// The ✦ button on every tweet: download media, image card, Telegram share, save to folder,
// save thread, copy text.
(() => {
  const { XAL } = window;
  XAL.media = {};
  XAL.users = new Map(); // accounts X itself sent us, keyed by lowercase handle
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.__xal === 'media') Object.assign(XAL.media, e.data.found);
    if (e.data?.__xal === 'users') for (const u of e.data.users) if (u.handle) XAL.users.set(u.handle.toLowerCase(), { ...XAL.users.get(u.handle.toLowerCase()), ...u });
  });
  window.postMessage({ __xal: 'replayUsers' }, location.origin); // get what the page loaded before we started listening

  /* ── inject the button ───────────────────── */
  function addButtons() {
    if (!XAL.tools.tweetMenu) return;
    document.querySelectorAll('article[data-testid="tweet"]:not([data-xal-tb])').forEach((article) => {
      const group = [...article.querySelectorAll('[role="group"]')].find((g) => g.querySelector('[data-testid="reply"]'));
      if (!group) return;
      article.dataset.xalTb = '1';
      const wrap = document.createElement('div');
      wrap.className = 'xal-tb-wrap';
      wrap.style.cssText = 'display:flex;align-items:center;';
      wrap.innerHTML = `<button class="xal-tbtn" title="ابزارهای X Auto Liker" aria-label="ابزارها">${XAL.sparkIcon}</button>`;
      wrap.firstChild.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openMenu(e.currentTarget, article); });
      group.appendChild(wrap);
    });
  }
  XAL.onScan(addButtons);
  XAL.onTools((t) => {
    if (!t.tweetMenu) {
      document.querySelectorAll('.xal-tb-wrap').forEach((w) => w.remove());
      document.querySelectorAll('[data-xal-tb]').forEach((a) => delete a.dataset.xalTb);
    } else addButtons();
  });

  function isFocal(article, info) {
    const m = location.pathname.match(/\/status\/(\d+)/);
    return !!m && info.id === m[1];
  }

  function openMenu(btn, article) {
    const info = XAL.tweetInfo(article);
    const media = XAL.media[info.id] || [];
    const videos = media.filter((m) => m.type !== 'photo');
    const items = [];
    if (info.photos.length) items.push({ icon: '🖼', label: `دانلود ${info.photos.length > 1 ? `${XAL.fa(info.photos.length)} عکس` : 'عکس'}`, onClick: () => downloadPhotos(info) });
    if (info.hasVideo || videos.length) items.push({ icon: '🎬', label: 'دانلود ویدیو', onClick: () => downloadVideos(info) });
    if (info.text) items.push({ icon: '🌐', label: 'ترجمه به فارسی', onClick: () => XAL.translateTweet(article) });
    if (info.text) items.push({ icon: '💬', label: 'پیشنهاد کامنت (۱۰ تا)', onClick: () => XAL.openComments(info, article) });
    items.push({ icon: '✨', label: 'ساخت عکس از توییت', onClick: () => XAL.openCard(info) });
    items.push({ icon: '✈️', label: 'اشتراک در تلگرام', onClick: () => shareTelegram(info) });
    items.push({ icon: '📁', label: 'ذخیره در پوشه…', onClick: () => saveToFolder(info) });
    if (isFocal(article, info)) items.push({ icon: '🧵', label: 'ذخیره‌ی رشته‌توییت…', onClick: () => saveThread(info) });
    items.push('hr');
    items.push({ icon: '📋', label: 'کپی متن و لینک', onClick: () => { navigator.clipboard.writeText(`${info.text}\n\n${info.url}`); XAL.toast('کپی شد ✓'); } });
    XAL.menu(btn, items);
  }

  /* ── downloads ───────────────────── */
  function downloadPhotos(info) {
    info.photos.forEach((src, i) => {
      const u = new URL(src);
      const ext = u.searchParams.get('format') || 'jpg';
      u.searchParams.set('name', 'orig');
      XAL.download(u.href, `X/${info.handle}_${info.id}_${i + 1}.${ext}`);
    });
    XAL.toast(info.photos.length > 1 ? `${XAL.fa(info.photos.length)} عکس در حال دانلود…` : 'عکس در حال دانلود…');
  }

  function downloadVideos(info) {
    const vids = (XAL.media[info.id] || []).filter((m) => m.type !== 'photo');
    if (!vids.length) {
      XAL.toast('لینک ویدیو هنوز پیدا نشده؛ توییت را باز کنید و دوباره بزنید');
      return;
    }
    vids.forEach((v, i) => XAL.download(v.url, `X/${info.handle}_${info.id}${vids.length > 1 ? `_${i + 1}` : ''}.mp4`));
    XAL.toast('ویدیو در حال دانلود…');
  }

  function shareTelegram(info) {
    const text = info.text.length > 200 ? `${info.text.slice(0, 200)}…` : info.text;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(info.url)}&text=${encodeURIComponent(`${info.name}: ${text}`)}`, '_blank', 'noopener');
  }

  /* ── save to folder ───────────────────── */
  async function saveToFolder(info) {
    const { library = { folders: [{ id: 'general', name: 'عمومی' }], items: [] } } = await chrome.storage.local.get('library');
    const existing = library.items.find((x) => x.id === info.id);
    const { body, close } = XAL.modal({ title: '📁 ذخیره در پوشه' });
    const folders = () => library.folders.map((f) => `<label class="chip ${f.id === (existing?.folderId || library.folders[0].id) ? 'on' : ''}" data-id="${f.id}">${XAL.esc(f.name)}</label>`).join('');
    body.innerHTML = `
      <div class="muted" style="margin-bottom:6px">پوشه</div>
      <div class="row" id="folders">${folders()}</div>
      <div class="row" style="margin-top:8px"><input type="text" id="newF" placeholder="پوشه‌ی جدید…" style="flex:1"><button class="btn ghost sm" id="addF">افزودن</button></div>
      <div class="muted" style="margin:14px 0 6px">برچسب‌ها (با کاما جدا کنید)</div>
      <input type="text" id="tags" style="width:100%" placeholder="مثلاً: آموزش، مهم" value="${XAL.esc((existing?.tags || []).join('، '))}">
      <div class="muted" style="margin:14px 0 6px">یادداشت</div>
      <textarea id="note" rows="2" style="width:100%;resize:vertical">${XAL.esc(existing?.note || '')}</textarea>
      <div class="row" style="margin-top:16px"><button class="btn" id="save" style="flex:1">${existing ? 'به‌روزرسانی' : 'ذخیره'}</button><button class="btn ghost" id="lib">کتابخانه</button></div>`;
    const q = (s) => body.querySelector(s);
    const bindChips = () => body.querySelectorAll('#folders .chip').forEach((c) => c.addEventListener('click', () => {
      body.querySelectorAll('#folders .chip').forEach((x) => x.classList.toggle('on', x === c));
    }));
    bindChips();
    q('#addF').addEventListener('click', () => {
      const name = q('#newF').value.trim();
      if (!name) return;
      const f = { id: XAL.uid(), name };
      library.folders.push(f);
      q('#folders').innerHTML = folders();
      bindChips();
      body.querySelectorAll('#folders .chip').forEach((x) => x.classList.toggle('on', x.dataset.id === f.id));
      q('#newF').value = '';
    });
    q('#lib').addEventListener('click', () => XAL.openPage('pages/library.html'));
    q('#save').addEventListener('click', async () => {
      const folderId = body.querySelector('#folders .chip.on')?.dataset.id || library.folders[0].id;
      const tags = q('#tags').value.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
      const item = {
        id: info.id, url: info.url, handle: info.handle, name: info.name, text: info.text, avatar: info.avatar,
        photo: info.photos[0] || (XAL.media[info.id] || [])[0]?.poster || '', time: info.time,
        folderId, tags, note: q('#note').value.trim(), savedAt: existing?.savedAt || Date.now(),
      };
      library.items = [item, ...library.items.filter((x) => x.id !== info.id)];
      await chrome.storage.local.set({ library });
      close();
      XAL.toast('ذخیره شد ✓');
    });
  }

  /* ── thread ───────────────────── */
  async function collectThread(author, onProgress, signal) {
    const tweets = new Map();
    const startY = scrollY;
    scrollTo(0, 0);
    await XAL.sleep(600);
    let idle = 0;
    let ended = false;
    for (let i = 0; i < 60 && idle < 3 && !ended && !signal.stopped; i++) {
      let added = 0;
      let seenAuthor = false;
      for (const a of document.querySelectorAll('article[data-testid="tweet"]')) {
        const t = XAL.tweetInfo(a);
        if (!t.id) continue;
        if (t.handle.toLowerCase() === author) {
          seenAuthor = true;
          if (!tweets.has(t.id)) { tweets.set(t.id, t); added++; }
        } else if (seenAuthor && tweets.size) { ended = true; break; } // replies from others: thread is over
      }
      onProgress(tweets.size);
      idle = added ? 0 : idle + 1;
      scrollBy(0, innerHeight * 0.85);
      await XAL.sleep(800);
    }
    scrollTo(0, startY);
    return [...tweets.values()];
  }

  function saveThread(info) {
    const { body, close } = XAL.modal({ title: '🧵 ذخیره‌ی رشته‌توییت', onClose: () => { signal.stopped = true; } });
    const signal = { stopped: false };
    body.innerHTML = `<div class="muted">در حال جمع کردن توییت‌های رشته… <b id="n">۰</b></div><div class="bar" style="margin-top:10px"><i style="width:30%"></i></div>`;
    collectThread(info.handle.toLowerCase(), (n) => { const el = body.querySelector('#n'); if (el) el.textContent = XAL.fa(n); }, signal).then((tweets) => {
      if (signal.stopped) return;
      const thread = { author: { name: info.name, handle: info.handle, avatar: info.avatar }, url: info.url, savedAt: Date.now(), tweets };
      const plain = tweets.map((t, i) => `${i + 1}/ ${t.text}`).join('\n\n') + `\n\n— ${info.name} (@${info.handle})\n${info.url}`;
      const md = `# رشته‌ی ${info.name} (@${info.handle})\n\n${tweets.map((t) => `${t.text}\n${t.photos.map((p) => `\n![](${p})`).join('')}`).join('\n\n---\n\n')}\n\n[لینک اصلی](${info.url})\n`;
      body.innerHTML = `
        <div style="font-size:15px;font-weight:900">${XAL.fa(tweets.length)} توییت پیدا شد</div>
        <div class="muted scroll" style="margin:10px 0 16px;max-height:180px;overflow:auto;padding:10px;border-radius:12px;background:rgba(0,0,0,.3);white-space:pre-wrap;direction:${XAL.isRtlText(plain) ? 'rtl' : 'ltr'}">${XAL.esc(plain.slice(0, 900))}${plain.length > 900 ? '…' : ''}</div>
        <div class="row">
          <button class="btn" id="pdf" style="flex:1">📄 PDF / چاپ</button>
          <button class="btn ghost" id="md">Markdown</button>
          <button class="btn ghost" id="txt">متن</button>
          <button class="btn ghost" id="cp">کپی</button>
        </div>`;
      const dl = (text, ext, type) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type }));
        a.download = `thread_${info.handle}_${info.id}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      };
      body.querySelector('#pdf').addEventListener('click', async () => {
        await chrome.storage.local.set({ threadPrint: thread });
        XAL.openPage('pages/thread.html');
        close();
      });
      body.querySelector('#md').addEventListener('click', () => dl(md, 'md', 'text/markdown'));
      body.querySelector('#txt').addEventListener('click', () => dl(plain, 'txt', 'text/plain'));
      body.querySelector('#cp').addEventListener('click', () => { navigator.clipboard.writeText(plain); XAL.toast('کپی شد ✓'); });
    });
  }
})();
