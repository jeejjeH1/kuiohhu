// "Translate to Persian" under tweets that are not Persian. Uses the user's own OpenRouter key through the
// background worker. The translation is shown under the tweet (right-aligned) and cached per tweet.
(() => {
  const { XAL } = window;
  const FA_LANGS = new Set(['fa', 'ar', 'ur', 'ps', 'ckb', 'ku']);
  const mem = new Map(); // tweetId -> { fa } shown this session, so a re-rendered tweet shows it again

  function paint(box, state) {
    if (state.loading) { box.innerHTML = '<span class="xal-tr-load">در حال ترجمه…</span>'; return; }
    if (state.error) { box.innerHTML = `<span class="xal-tr-err">${XAL.esc(state.error)}</span> <button class="xal-tr-btn" data-act="retry">دوباره</button>`; return; }
    if (state.fa) {
      box.innerHTML = `<div class="xal-tr-text" dir="rtl">${XAL.esc(state.fa)}</div><button class="xal-tr-btn" data-act="hide">پنهان</button>`;
      return;
    }
    box.innerHTML = '<button class="xal-tr-btn" data-act="go">🌐 ترجمه به فارسی</button>';
  }

  async function translate(article, box) {
    const info = XAL.tweetInfo(article);
    if (!info.id || !info.text) return;
    paint(box, { loading: true });
    const res = await XAL.bg({ type: 'aiTranslate', id: info.id, text: info.text }).catch((e) => ({ ok: false, error: e.message }));
    if (!res?.ok) { paint(box, { error: res?.error || 'خطا' }); return; }
    mem.set(info.id, res.fa);
    paint(box, { fa: res.fa });
  }

  function addButtons() {
    if (!XAL.tools.translate) return;
    document.querySelectorAll('article[data-testid="tweet"]:not([data-xal-tr])').forEach((article) => {
      const textEl = article.querySelector('[data-testid="tweetText"]');
      if (!textEl) return;
      article.dataset.xalTr = '1';
      const lang = (textEl.getAttribute('lang') || '').toLowerCase();
      const text = textEl.textContent || '';
      if (FA_LANGS.has(lang) || XAL.isRtlText(text) || (text.match(/[A-Za-zÀ-ɏЀ-ӿ぀-ヿ一-鿿가-힯]/g) || []).length < 8) return;
      const box = document.createElement('div');
      box.className = 'xal-tr';
      const id = XAL.tweetInfo(article).id;
      paint(box, mem.has(id) ? { fa: mem.get(id) } : {});
      box.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'go' || act === 'retry') { e.preventDefault(); e.stopPropagation(); translate(article, box); }
        if (act === 'hide') { e.preventDefault(); e.stopPropagation(); mem.delete(id); paint(box, {}); }
      });
      textEl.insertAdjacentElement('afterend', box);
    });
  }
  XAL.onScan(addButtons);
  XAL.onTools((t) => {
    if (!t.translate) {
      document.querySelectorAll('.xal-tr').forEach((b) => b.remove());
      document.querySelectorAll('[data-xal-tr]').forEach((a) => delete a.dataset.xalTr);
    } else addButtons();
  });

  // translate from the ✦ menu too (works on Persian-looking text as well)
  XAL.translateTweet = (article) => {
    let box = article.querySelector('.xal-tr');
    if (!box) {
      const textEl = article.querySelector('[data-testid="tweetText"]');
      if (!textEl) return;
      box = document.createElement('div'); box.className = 'xal-tr';
      box.addEventListener('click', (e) => { const act = e.target.closest('[data-act]')?.dataset.act; if (act === 'hide') paint(box, {}); if (act === 'retry') translate(article, box); });
      textEl.insertAdjacentElement('afterend', box);
    }
    translate(article, box);
  };

  const st = document.createElement('style');
  st.textContent = `
    .xal-tr { margin: 6px 0 2px; direction: rtl; text-align: right; font: 500 14px/1.9 XalVaz, Vazirmatn, sans-serif; }
    .xal-tr-btn { border: 0; background: rgba(255,46,126,.12); color: #ff4f93; border-radius: 99px; padding: 2px 12px; cursor: pointer; font: 700 12px XalVaz, Vazirmatn, sans-serif; }
    .xal-tr-btn:hover { background: rgba(255,46,126,.22); }
    .xal-tr-text { padding: 8px 12px; margin-bottom: 4px; border-radius: 12px; background: rgba(162,75,255,.10); border-right: 3px solid #a24bff; white-space: pre-wrap; direction: rtl; text-align: right; }
    .xal-tr-load { color: #9a94b8; font-size: 12.5px; } .xal-tr-err { color: #ff8a95; font-size: 12.5px; }`;
  (document.head || document.documentElement).appendChild(st);
})();
