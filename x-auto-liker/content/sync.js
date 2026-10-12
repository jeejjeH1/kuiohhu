// Starts a list sync in the tab the extension opened for it (the background tells us which one).
// Reads the list, saves it, and closes the tab; the extension window shows the progress and the result.
(() => {
  const { XAL } = window;
  const m = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/(following|followers)\/?$/);
  if (!m) return;
  const handle = m[1];
  const type = m[2];

  // Step-by-step diagnosis, kept in storage so the extension window can show it (even after it was closed).
  const diag = { at: Date.now(), type, path: location.pathname, steps: {} };
  const step = (k, v) => { diag.steps[k] = v; chrome.storage.local.set({ syncDiag: diag }); };
  step('page', true);

  // Is this tab a sync tab? The extension records the tab; X may rewrite the address, so it is not used as a marker.
  async function isSyncTab() {
    if (location.hash === '#xal-sync') return { foreground: true };
    for (let i = 0; i < 6; i++) {
      const r = await chrome.runtime.sendMessage({ type: 'syncWho' }).catch(() => null);
      if (r?.job) return r.job;
      await XAL.sleep(400); // the job may be written a moment after the tab opens
    }
    return null;
  }

  const REASONS = {
    end: ['تمام شد ✓', ''],
    stopped: ['متوقف شد', 'آنچه تا اینجا خوانده شد ذخیره شده است.'],
    rate_limit: ['X محدودیت گذاشت', 'آنچه خوانده شد ذخیره شد. چند ساعت دیگر دوباره ادامه دهید.'],
    rate_limit_soon: ['نزدیک به محدودیت X', 'برای امنیت حساب همین‌جا ایستادیم و آنچه خوانده شد ذخیره شد.'],
    auth: ['دسترسی رد شد', 'مطمئن شوید وارد X هستید و صفحه را رفرش کنید.'],
    network: ['خطای شبکه', 'اینترنت را بررسی کنید.'],
    error: ['خطا از سمت X', 'آنچه خوانده شد ذخیره شد.'],
    no_request: ['درخواست لیست پیدا نشد', 'صفحه را رفرش کنید و دوباره از اکستنشن بزنید.'],
  };

  isSyncTab().then(async (job) => {
  step('job', !!job);
  if (!job) return;
  // is the page-side reader alive in X's own page?
  const pong = await new Promise((res) => {
    const t = setTimeout(() => res(null), 1500);
    window.addEventListener('message', function on(e) { if (e.source === window && e.data?.__xal === 'pong') { clearTimeout(t); window.removeEventListener('message', on); res(e.data); } });
    window.postMessage({ __xal: 'ping' }, location.origin);
  });
  step('reader', !!pong);
  const bgMode = !job.foreground; // started from the extension window: no panel, closes itself
  const label = type === 'following' ? 'دنبال‌شوندگان' : 'دنبال‌کنندگان';
  const { body, close, modal } = XAL.modal({ title: `🔄 همگام‌سازی ${label}`, onClose: () => window.postMessage({ __xal: 'syncStop' }, location.origin) });
  body.innerHTML = `
    <p class="muted" style="margin-bottom:10px">فهرست از خود X خوانده می‌شود، چند حساب در هر مرحله و با مکث بین مراحل. چیزی تغییر نمی‌کند (فقط خواندن).</p>
    <div style="text-align:center;margin:14px 0 6px"><div style="font-size:42px;font-weight:900" id="c">۰</div><div class="muted">حساب خوانده شد</div></div>
    <div class="bar"><i id="b" style="width:10%"></i></div>
    <div class="row" style="margin-top:14px;justify-content:center"><button class="btn danger" id="stop">توقف</button></div>
    <div id="msg" class="muted" style="margin-top:12px;text-align:center"></div>`;
  if (bgMode) modal.parentElement.style.display = 'none'; // runs quietly in the background tab
  chrome.storage.local.set({ syncState: { type, state: 'running', count: 0, at: Date.now() } });
  chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === 'syncStop') window.postMessage({ __xal: 'syncStop' }, location.origin); });
  let pulse = 10;
  const t = setInterval(() => { pulse = (pulse + 6) % 100; const b = body.querySelector('#b'); if (b) b.style.width = `${pulse}%`; }, 400);
  body.querySelector('#stop').addEventListener('click', () => window.postMessage({ __xal: 'syncStop' }, location.origin));

  window.addEventListener('message', async function onMsg(e) {
    if (e.source !== window || e.data?.__xal !== 'sync' || e.data.type !== type) return;
    const d = e.data;
    if (d.state === 'progress') {
      const c = body.querySelector('#c'); if (c) c.textContent = XAL.fa(d.count);
      chrome.storage.local.set({ syncState: { type, state: 'running', count: d.count, at: Date.now() } });
      return;
    }
    if (d.state !== 'done') return;
    window.removeEventListener('message', onMsg);
    clearInterval(t);

    const [title, detail] = REASONS[d.reason] || REASONS.error;
    const needsYou = d.reason === 'auth' || d.reason === 'no_request';
    step('result', { reason: d.reason, count: d.users.length, pages: d.pages || 0, status: d.lastStatus || 0, seen: d.seen || [] });
    const seenTxt = d.seen?.length ? `درخواست‌هایی که X فرستاد: ${d.seen.join('، ')}` : 'هیچ درخواستی از X دیده نشد.';
    if (d.users.length) {
      const { followData = {} } = await chrome.storage.local.get('followData');
      const old = followData[type];
      followData[type] = {
        at: Date.now(), handle, partial: d.reason !== 'end', users: d.users,
        // for "who unfollowed me": who was in the list the last time
        prev: type === 'followers' && old?.users ? old.users.map((u) => u.handle) : old?.prev || [],
        prevAt: type === 'followers' && old?.at ? old.at : old?.prevAt || 0,
      };
      await chrome.storage.local.set({ followData, me: handle });
    }
    chrome.storage.local.set({ syncState: { type, state: 'done', reason: d.reason, title, detail, count: d.users.length, at: Date.now() } });
    if (bgMode) {
      // the result is already in the extension window; close this tab unless X needs the user (login / refresh)
      if (needsYou) { modal.parentElement.style.display = ''; chrome.runtime.sendMessage({ type: 'focusSelf' }); }
      else { chrome.runtime.sendMessage({ type: 'closeSelf' }); return; }
    }
    body.innerHTML = `<div style="text-align:center;padding:10px 0">
      <div style="font-size:34px;font-weight:900">${XAL.fa(d.users.length)}</div>
      <div style="font-weight:700;margin:4px 0">${title}</div><div class="muted">${detail}</div>${d.reason === 'no_request' ? `<div class="muted" dir="ltr" style="margin-top:10px;font-size:11px;word-break:break-all">${seenTxt}</div>` : ''}
      <div class="row" style="margin-top:16px;justify-content:center">${d.users.length ? '<button class="btn" id="open">نمایش نتایج</button>' : ''}<button class="btn ghost" id="x">بستن</button></div></div>`;
    body.querySelector('#x').addEventListener('click', close);
    const openIt = () => { XAL.openPage(`pages/following.html?tab=${type}`); close(); };
    body.querySelector('#open')?.addEventListener('click', openIt);
    if (d.users.length && d.reason === 'end' && !bgMode) setTimeout(openIt, 800);
  });

  if (location.hash === '#xal-sync') history.replaceState(null, '', location.pathname);
  chrome.storage.local.remove('syncJob'); // one job, one run
  window.postMessage({ __xal: 'syncStart', type }, location.origin);
  });
})();
