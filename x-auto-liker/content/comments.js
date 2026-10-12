// "Suggest comments": asks the AI (through the background, with the user's own OpenRouter key) for 10 replies
// to a tweet, each with a Persian translation. The user picks one; it is put in the reply box. Nothing is sent.
(() => {
  const { XAL } = window;

  const sleep = XAL.sleep;
  const q = (root, sel) => root.querySelector(sel);

  // Find (or open) the reply composer for this tweet and put the text in it.
  async function insertReply(article, text) {
    const editor = () => {
      const dlg = document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]');
      if (dlg) return dlg;
      const focal = location.pathname.match(/\/status\/(\d+)/)?.[1];
      const mine = XAL.tweetInfo(article).id;
      // on the tweet's own page the inline reply box belongs to it
      return focal && focal === mine ? document.querySelector('[data-testid="primaryColumn"] [data-testid="tweetTextarea_0"]') : null;
    };
    let ed = editor();
    if (!ed) {
      article.querySelector('[data-testid="reply"]')?.click(); // opens X's reply box; nothing is posted
      for (let i = 0; i < 20 && !ed; i++) { await sleep(150); ed = editor(); }
    }
    if (!ed) return false;
    XAL.insertText(ed, text);
    return true;
  }

  const isFa = (t) => XAL.isRtlText(t);

  XAL.openComments = async (info, article) => {
    const { body, close, modal } = XAL.modal({ title: '💬 پیشنهاد کامنت', wide: true });
    modal.style.width = 'min(760px, calc(100vw - 32px))';
    let extra = '';

    const tweetBox = `<div class="muted" style="padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.05);margin-bottom:12px;font-size:12.5px;max-height:90px;overflow:auto;white-space:pre-wrap;unicode-bidi:plaintext;text-align:start"><b style="color:#f4f2ff">${XAL.esc(info.name || info.handle)}</b> ${XAL.esc(info.text.slice(0, 400))}</div>`;

    function shell(inner) {
      body.innerHTML = `${tweetBox}
        <div class="row" style="margin-bottom:12px">
          <input type="text" id="extra" placeholder="دستور اضافه برای این بار (اختیاری)، مثلاً: طنزآمیز‌تر یا کوتاه‌تر" style="flex:1;min-width:200px" value="${XAL.esc(extra)}">
          <button class="btn sm" id="again">🔄 بساز</button>
          <button class="btn ghost sm" id="settings">⚙️ تنظیمات</button>
        </div>
        <div id="out">${inner}</div>`;
      q(body, '#again').addEventListener('click', () => { extra = q(body, '#extra').value.trim(); run(); });
      q(body, '#extra').addEventListener('keydown', (e) => { if (e.key === 'Enter') { extra = e.target.value.trim(); run(); } });
      q(body, '#settings').addEventListener('click', () => XAL.openPage('pages/ai.html'));
    }

    async function run() {
      shell('<div style="text-align:center;padding:36px 0"><div style="font-size:30px">💬</div><div class="muted" style="margin-top:6px">در حال ساختن کامنت‌ها…</div><div class="bar" style="margin:14px auto 0;max-width:260px"><i id="pb" style="width:30%"></i></div></div>');
      let w = 30; const t = setInterval(() => { w = (w + 7) % 100; const b = q(body, '#pb'); if (b) b.style.width = `${w}%`; }, 350);
      const res = await XAL.bg({ type: 'aiComments', tweet: { text: info.text, name: info.name, handle: info.handle, lang: info.lang }, extra }).catch((e) => ({ ok: false, error: e.message }));
      clearInterval(t);
      if (!res?.ok) {
        const needKey = res?.code === 'no_key' || res?.code === 'auth';
        q(body, '#out').innerHTML = `<div style="text-align:center;padding:26px 10px"><div style="font-size:30px">⚠️</div><div style="margin:6px 0 14px">${XAL.esc(res?.error || 'خطا')}</div>
          ${needKey ? '<button class="btn" id="goSet">⚙️ وارد کردن کلید</button>' : '<button class="btn ghost" id="retry">دوباره تلاش</button>'}</div>`;
        q(body, '#goSet')?.addEventListener('click', () => XAL.openPage('pages/ai.html'));
        q(body, '#retry')?.addEventListener('click', run);
        return;
      }
      const cards = res.items.map((it, i) => {
        const rtl = isFa(it.text);
        const showFa = it.fa && !rtl;
        return `<div class="cm" data-i="${i}" style="padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);margin-bottom:8px;animation:cmIn .4s both;animation-delay:${i * 40}ms">
          <div style="font-size:14px;line-height:1.8;white-space:pre-wrap;direction:${rtl ? 'rtl' : 'ltr'};text-align:${rtl ? 'right' : 'left'}">${XAL.esc(it.text)}</div>
          ${showFa ? `<div class="fa" dir="rtl" style="display:block;width:100%;margin-top:6px;padding-top:6px;border-top:1px dashed rgba(255,255,255,.12);font-size:13px;line-height:1.9;color:#b8b2d6;direction:rtl;text-align:right;unicode-bidi:isolate;user-select:none;-webkit-user-select:none;cursor:default" title="ترجمه فقط برای خواندن است و کپی نمی‌شود">${XAL.esc(it.fa)}</div>` : ''}
          <div class="row" style="margin-top:8px;justify-content:flex-start"><button class="btn sm use">📝 استفاده</button><button class="btn ghost sm copy" title="فقط متن اصلی کامنت کپی می‌شود، بدون ترجمه">کپی</button><span class="muted" style="font-size:11.5px;margin-right:auto">${XAL.fa(it.text.length)} کاراکتر</span></div></div>`;
      }).join('');
      q(body, '#out').innerHTML = `${cards}<div class="muted" style="text-align:center;font-size:11.5px;margin-top:6px">مدل: <span dir="ltr">${XAL.esc(res.model)}</span> · متن فقط در کادر پاسخ قرار می‌گیرد؛ ارسال با خودتان است.</div>`;
      body.querySelectorAll('.cm').forEach((card) => {
        const it = res.items[+card.dataset.i];
        card.querySelector('.use').addEventListener('click', async () => {
          const ok = await insertReply(article, it.text);
          if (ok) { close(); XAL.toast('کامنت در کادر پاسخ قرار گرفت ✓ حالا خودتان ارسال کنید'); }
          else { navigator.clipboard.writeText(it.text); XAL.toast('کادر پاسخ پیدا نشد؛ کامنت کپی شد'); }
        });
        card.querySelector('.copy').addEventListener('click', () => { navigator.clipboard.writeText(it.text); XAL.toast('کپی شد ✓'); });
      });
    }

    if (!XAL._cmStyle) { XAL._cmStyle = true; XAL.addStyle('@keyframes cmIn { from { opacity: 0; transform: translateY(10px); } }'); }
    run();
  };
})();
