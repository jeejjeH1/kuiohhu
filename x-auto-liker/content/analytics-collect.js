// "My tweet stats": on your own profile, scrolls your tweets and reads the numbers X already shows
// (views, likes, reposts, replies, time), then opens the analytics page.
(() => {
  const { XAL } = window;

  const onOwnProfile = () => {
    const me = XAL.me();
    if (!me) return false;
    const p = location.pathname.toLowerCase();
    return p === `/${me.toLowerCase()}` || p === `/${me.toLowerCase()}/with_replies`;
  };

  XAL.fab('analytics', '📊 آمار توییت‌های من', onOwnProfile, () => {
    const me = XAL.me();
    const { body, close } = XAL.modal({ title: '📊 آمار توییت‌های من', onClose: () => { job.stop = true; } });
    const job = { stop: false };
    body.innerHTML = `
      <p class="muted" style="margin-bottom:12px">صفحه به‌صورت خودکار پایین می‌رود و اعداد توییت‌هایتان را می‌خواند. ریتوییت‌ها حساب نمی‌شوند. هیچ چیزی جایی فرستاده نمی‌شود.</p>
      <div class="muted" style="margin-bottom:6px">چند توییت آخر؟</div>
      <div class="row" id="n">${[30, 60, 100, 200].map((n, i) => `<span class="chip ${i === 1 ? 'on' : ''}" data-n="${n}">${XAL.fa(n)}</span>`).join('')}</div>
      <button class="btn" id="go" style="width:100%;margin-top:16px">شروع</button>
      <div id="prog" hidden style="margin-top:16px"><div class="row" style="justify-content:space-between"><span>در حال خواندن…</span><b id="c">۰</b></div><div class="bar" style="margin-top:8px"><i id="b"></i></div></div>`;
    let target = 60;
    body.querySelectorAll('#n .chip').forEach((c) => c.addEventListener('click', () => {
      target = +c.dataset.n;
      body.querySelectorAll('#n .chip').forEach((x) => x.classList.toggle('on', x === c));
    }));
    body.querySelector('#go').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      body.querySelector('#prog').hidden = false;
      const tweets = new Map();
      let idle = 0;
      const startY = scrollY;
      while (!job.stop && tweets.size < target && idle < 5) {
        let added = 0;
        document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => {
          const t = XAL.tweetInfo(a);
          if (!t.id || t.isRepost || t.handle.toLowerCase() !== me.toLowerCase() || tweets.has(t.id) || !t.time) return;
          tweets.set(t.id, { id: t.id, url: t.url, text: t.text.slice(0, 160), time: t.time, views: t.views, likes: t.likes, reposts: t.reposts, replies: t.replies, photo: !!t.photos.length, video: t.hasVideo });
          added++;
        });
        idle = added ? 0 : idle + 1;
        body.querySelector('#c').textContent = XAL.fa(Math.min(tweets.size, target));
        body.querySelector('#b').style.width = `${Math.min(100, (tweets.size / target) * 100)}%`;
        scrollBy(0, innerHeight * 0.9);
        await XAL.sleep(900);
      }
      scrollTo(0, startY);
      if (job.stop) return;
      const list = [...tweets.values()].slice(0, target);
      await chrome.storage.local.set({ analytics: { handle: me, collectedAt: Date.now(), tweets: list } });
      close();
      XAL.openPage('pages/analytics.html');
    });
  });
})();
