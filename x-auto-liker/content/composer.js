// Writing helper in X's composer: templates & drafts (inserted, never sent), plus an exact counter.
(() => {
  const { XAL } = window;

  // X's weighted length: URLs = 23; these ranges weigh 1, everything else (incl. emoji) weighs 2.
  const LIGHT = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
  XAL.tweetLength = (text) => {
    let t = text.replace(/https?:\/\/\S+|(?:www\.)?[a-z0-9-]+\.(?:com|ir|org|net|io|me|co)(?:\/\S*)?/gi, () => '\u0000'.repeat(23));
    let n = 0;
    for (const ch of t) {
      const cp = ch.codePointAt(0);
      if (cp === 0xfe0f || cp === 0x200d) continue; // emoji joiners/variation selectors
      n += LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
    }
    return n;
  };

  const editorText = (ed) => [...ed.querySelectorAll('[data-block]')].map((b) => b.textContent).join('\n') || ed.textContent || '';

  function insert(ed, text) {
    const target = ed.querySelector('[contenteditable="true"]') || ed;
    target.focus();
    const sel = getSelection();
    if (!target.contains(sel.anchorNode)) { const r = document.createRange(); r.selectNodeContents(target); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
    document.execCommand('insertText', false, text);
  }

  XAL.insertText = insert; // used by the comment suggestions: puts text in a composer, never sends

  async function getStore() {
    const { templates = [], drafts = [] } = await chrome.storage.local.get(['templates', 'drafts']);
    return { templates, drafts };
  }

  function openPanel(btn, ed) {
    const menu = XAL.menu(btn, []);
    menu.style.width = '320px';
    menu.innerHTML = `
      <div class="row" style="padding:4px 4px 8px;gap:6px">
        <span class="chip on" data-tab="templates">قالب‌ها</span><span class="chip" data-tab="drafts">پیش‌نویس‌ها</span>
      </div>
      <div class="list scroll" style="max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:4px"></div>
      <hr>
      <div class="row" style="padding:4px;gap:6px">
        <button class="btn sm" id="saveT" style="flex:1">ذخیره به‌عنوان قالب</button>
        <button class="btn ghost sm" id="saveD" style="flex:1">ذخیره پیش‌نویس</button>
      </div>`;
    let tab = 'templates';
    const list = menu.querySelector('.list');
    const draw = async () => {
      const store = await getStore();
      let items = store[tab];
      if (tab === 'drafts') {
        const { lastComposer } = await chrome.storage.local.get('lastComposer');
        if (lastComposer && Date.now() - lastComposer.at < 7 * 864e5 && !items.some((d) => d.text === lastComposer.text.trim())) {
          items = [{ id: '__last', text: lastComposer.text.trim(), auto: true }, ...items];
        }
      }
      menu.querySelectorAll('[data-tab]').forEach((c) => c.classList.toggle('on', c.dataset.tab === tab));
      list.innerHTML = items.length ? '' : `<div class="muted" style="padding:14px;text-align:center;font-size:12px">${tab === 'templates' ? 'هنوز قالبی ندارید. متن را بنویسید و «ذخیره به‌عنوان قالب» را بزنید.' : 'پیش‌نویسی نیست.'}</div>`;
      items.forEach((it) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px';
        row.innerHTML = `<button style="flex:1;text-align:start;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.04);border:0;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext"></button><button title="حذف" style="width:28px;height:28px;border:0;border-radius:8px;background:none;color:#9a94b8;cursor:pointer">✕</button>`;
        row.firstChild.textContent = it.auto ? `↺ آخرین متن نوشته‌شده: ${it.text}` : it.text;
        row.firstChild.title = it.text;
        row.firstChild.addEventListener('click', () => { insert(ed, it.text); menu.remove(); });
        row.lastChild.addEventListener('click', async () => {
          if (it.auto) { await chrome.storage.local.remove('lastComposer'); draw(); return; }
          const s = await getStore();
          await chrome.storage.local.set({ [tab]: s[tab].filter((x) => x.id !== it.id) });
          draw();
        });
        list.appendChild(row);
      });
      menu.place();
    };
    menu.querySelectorAll('[data-tab]').forEach((c) => c.addEventListener('click', () => { tab = c.dataset.tab; draw(); }));
    const save = (key) => async () => {
      const text = editorText(ed).trim();
      if (!text) return XAL.toast('متنی برای ذخیره نیست');
      const s = await getStore();
      await chrome.storage.local.set({ [key]: [{ id: XAL.uid(), text, at: Date.now() }, ...s[key].filter((x) => x.text !== text)].slice(0, 100) });
      XAL.toast(key === 'templates' ? 'قالب ذخیره شد ✓' : 'پیش‌نویس ذخیره شد ✓');
      tab = key; draw();
    };
    menu.querySelector('#saveT').addEventListener('click', save('templates'));
    menu.querySelector('#saveD').addEventListener('click', save('drafts'));
    draw();
  }

  function enhance() {
    if (!XAL.tools.composer) return;
    document.querySelectorAll('[data-testid^="tweetTextarea_"]:not([data-xal-cp])').forEach((ed) => {
      if (/label/.test(ed.dataset.testid)) return;
      // the toolbar sits in the same composer box as the editor
      let box = ed; let toolbar = null;
      for (let i = 0; i < 12 && box && !toolbar; i++) { box = box.parentElement; toolbar = box?.querySelector('[data-testid="toolBar"]'); }
      if (!toolbar) return;
      ed.dataset.xalCp = '1';
      const holder = document.createElement('div');
      holder.className = 'xal-cp';
      holder.style.cssText = 'display:flex;align-items:center;';
      holder.innerHTML = `<span class="xal-count"></span><button class="xal-cbtn" type="button">✦ قالب‌ها</button>`;
      const anchor = toolbar.querySelector('[data-testid="ScrollSnap-List"]') || toolbar.firstElementChild;
      (anchor?.parentElement || toolbar).appendChild(holder);
      holder.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPanel(e.currentTarget, ed); });
      const count = holder.querySelector('.xal-count');
      let saveTimer;
      const update = () => {
        const text = editorText(ed);
        const n = XAL.tweetLength(text);
        const words = (text.trim().match(/\S+/g) || []).length;
        count.textContent = text.trim() ? `${XAL.fa(n)}/۲۸۰ · ${XAL.fa(words)} کلمه` : '';
        count.className = `xal-count${n > 280 ? ' over' : n > 260 ? ' warn' : ''}`;
        // keep the last unsent text so it is never lost
        clearTimeout(saveTimer);
        if (text.trim().length > 15) saveTimer = setTimeout(() => chrome.storage.local.set({ lastComposer: { text, at: Date.now() } }), 1500);
      };
      new MutationObserver(update).observe(ed, { childList: true, subtree: true, characterData: true });
      update();
    });
  }
  XAL.onScan(enhance);
  XAL.onTools((t) => {
    if (!t.composer) {
      document.querySelectorAll('.xal-cp').forEach((h) => h.remove());
      document.querySelectorAll('[data-xal-cp]').forEach((e) => delete e.dataset.xalCp);
    } else enhance();
  });
})();
