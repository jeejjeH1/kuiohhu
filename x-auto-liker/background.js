// Two modes, both using one tab navigated to each link in turn:
// - manual: the extension only opens the links; the user likes and presses "Next" (popup,
//   on-page overlay or Alt+N). Event-driven, so it survives service-worker restarts.
// - auto: open, wait the user's "before like" time, like, then wait "between likes".
// Progress lives in chrome.storage.local (runState) so the popup can be closed and reopened.

let currentRun = 0; // bumped on every start/stop; a loop exits once its id is stale
let keepAliveTimer = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// MV3 service workers are killed after ~30s without extension API activity.
// A cheap API call every 20s keeps it alive while a run is in progress.
function startKeepAlive() {
  stopKeepAlive();
  keepAliveTimer = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
}
function stopKeepAlive() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

async function setState(patch) {
  const { runState = {} } = await chrome.storage.local.get('runState');
  const next = { ...runState, ...patch };
  await chrome.storage.local.set({ runState: next });
  return next;
}

function summarize(results = [], mode = 'auto', kind = 'like') {
  const count = (r) => String(results.filter((x) => x.result === r).length)
    .replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  if (kind === 'unfollow') {
    return mode === 'manual'
      ? `${count('unfollowed')} آنفالو، ${count('skipped')} رد شد`
      : `${count('unfollowed')} آنفالو، ${count('already')} از قبل فالو نبود، ${count('error')} خطا`;
  }
  return mode === 'manual'
    ? `${count('liked')} لایک، ${count('skipped')} رد شد`
    : `${count('liked')} لایک، ${count('already')} از قبل، ${count('error')} خطا`;
}

// Sleeps in small steps so Stop takes effect quickly.
// Pause holds the run where it is: time spent paused does not count toward a wait.
let paused = false;
async function waitUnlessStopped(ms, runId) {
  let left = ms;
  while (left > 0) {
    if (runId !== currentRun) return false;
    if (paused) { await sleep(300); continue; }
    const step = Math.min(500, left);
    await sleep(step);
    left -= step;
  }
  return runId === currentRun;
}
async function waitWhilePaused(runId) {
  while (paused && runId === currentRun) await sleep(300);
  return runId === currentRun;
}


function navigateAndWait(tabId, url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('page load timeout'));
    }, timeoutMs);
    function onUpdated(id, info) {
      if (id !== tabId || info.status !== 'complete') return;
      // only the real page counts: a tab starts on about:blank, which can also report "complete"
      chrome.tabs.get(tabId).then((t) => {
        if (!t.url || t.url.startsWith('about:')) return;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }, () => {});
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.update(tabId, { url }).catch((e) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(e);
    });
  });
}

// Injected into the tweet page. Must be self-contained.
// action 'find': wait until the focal tweet's like button is on screen (no click).
// action 'click': click like on the focal tweet and confirm it turned red.
async function tweetActionInPage(statusId, action) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // The focal tweet is the article whose timestamp links to this status id.
  // Parent tweets (when the link is a reply) and replies link to their own ids.
  const findArticle = () => {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    return articles.find((a) => a.querySelector(`a[href*="/status/${statusId}"] time`)) ||
      articles.find((a) => a.getAttribute('tabindex') === '-1');
  };

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (location.pathname.startsWith('/i/flow/login') || document.querySelector('[data-testid="loginButton"]')) {
      return { result: 'error', detail: 'not logged in', fatal: true };
    }
    const article = findArticle();
    if (article) {
      if (article.querySelector('[data-testid="unlike"]')) return { result: 'already' };
      const btn = article.querySelector('[data-testid="like"]');
      if (btn) {
        if (action === 'find') return { result: 'ready' };
        btn.click();
        for (let i = 0; i < 20; i++) {
          await sleep(250);
          if (article.querySelector('[data-testid="unlike"]')) return { result: 'liked' };
        }
        return { result: 'error', detail: 'like not confirmed' };
      }
    }
    await sleep(500);
  }
  return { result: 'error', detail: 'tweet not found' };
}

// Injected into a profile page (unfollow queue). Same contract as tweetActionInPage.
// The follow button is found by its data-testid when X provides one, and otherwise by its
// visible text / label (Following / Follow, in English or Persian), so it survives markup changes.
async function profileActionInPage(handle, action) {
  function followStateInPage() {
    const scope = document.querySelector('[data-testid="placementTracking"]') ||
      document.querySelector('[data-testid="userActions"]') || document.querySelector('main') || document;
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    // skip the confirmation dialog's own buttons and anything hidden
    const btns = [...scope.querySelectorAll('button, [role="button"]')]
      .filter((b) => b.offsetParent !== null && !b.closest('[role="dialog"], [role="alertdialog"]'));
    const label = (b) => norm(b.getAttribute('aria-label') || b.textContent);
    const unf = btns.find((b) => /-unfollow$/.test(b.dataset.testid || '') || /^(Following|Unfollow|دنبال می‌کنید)$/i.test(label(b)));
    if (unf) return { state: 'following', button: unf };
    const fol = btns.find((b) => /-follow$/.test(b.dataset.testid || '') || /^(Follow|دنبال کردن)$/i.test(label(b)));
    if (fol) return { state: 'follow', button: fol };
    return { state: null };
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (location.pathname.startsWith('/i/flow/login') || document.querySelector('[data-testid="loginButton"]')) {
      return { result: 'error', detail: 'not logged in', fatal: true };
    }
    if (document.querySelector('[data-testid="emptyState"]')) return { result: 'error', detail: 'account not found' };
    if (/rate limit|too many requests|unusual activity|try again later/i.test(document.body?.innerText || '')) return { result: 'error', detail: 'X shows a limit', fatal: true, fatalReason: 'X نشان داد محدودیت یا فعالیت غیرعادی؛ برای امنیت حساب متوقف شد.' };
    const st = followStateInPage();
    if (st.state === 'follow') return { result: 'already' }; // not following anymore
    if (st.state === 'following') {
      if (action === 'find') return { result: 'ready' };
      st.button.click();
      for (let i = 0; i < 20; i++) {
        await sleep(250);
        // confirmation sheet: X's own confirm button, or a dialog button labelled Unfollow / آنفالو
        const sheet = document.querySelector('[data-testid="confirmationSheetConfirm"]') ||
          [...document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button')]
            .find((b) => /^(Unfollow|آنفالو)$/i.test((b.textContent || '').trim()));
        sheet?.click();
        if (followStateInPage().state === 'follow') return { result: 'unfollowed' };
      }
      return { result: 'error', detail: 'unfollow not confirmed' };
    }
    await sleep(500);
  }
  return { result: 'error', detail: 'follow button not found' };
}

const KIND = {
  like: { func: tweetActionInPage, target: (url) => url.match(/status\/(\d+)/)[1], max: 30 },
  unfollow: { func: profileActionInPage, target: (url) => new URL(url).pathname.split('/')[1], max: 1000 },
};

async function runInTab(tabId, kind, url, action) {
  const k = KIND[kind];
  const [inj] = await chrome.scripting.executeScript({
    target: { tabId },
    func: k.func,
    args: [k.target(url), action],
  });
  return inj?.result || { result: 'error', detail: 'no result' };
}

// Daily unfollow counter, so the auto queue respects the user's cap.
const today = () => new Date().toISOString().slice(0, 10);
async function unfollowsToday() {
  const { unfollowLog } = await chrome.storage.local.get('unfollowLog');
  return unfollowLog?.day === today() ? unfollowLog.n : 0;
}
async function countUnfollow() {
  await chrome.storage.local.set({ unfollowLog: { day: today(), n: (await unfollowsToday()) + 1 } });
}

const randBetween = (min, max) => min + Math.floor(Math.random() * (Math.max(min, max) - min + 1));

// opts: { kind, links, preMinMs, preMaxMs, delayMinMs, delayMaxMs, closeTab, dailyCap }
async function run(opts) {
  const { links, closeTab } = opts;
  const kind = opts.kind || 'like';
  const runId = ++currentRun;
  paused = false;
  startKeepAlive();
  await chrome.storage.local.set({
    runState: {
      kind, mode: 'auto', running: true, queue: links, results: [], statusText: '', tabId: null, dailyCap: opts.dailyCap || null,
      index: 0, phase: 'opening', phaseStart: Date.now(), phaseEnd: null,
    },
  });

  let tabId = null;
  const results = [];
  let stopReason = '';
  let errStreak = 0;
  // Once Stop is pressed (or a new run starts) this loop must not write state anymore.
  const update = (patch) => (runId === currentRun ? setState(patch) : Promise.resolve());
  const phase = (name, index, ms = null) => update({
    phase: name, index, phaseStart: Date.now(), phaseEnd: ms === null ? null : Date.now() + ms,
  });

  try {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
    tabId = tab.id;
    await update({ tabId });

    for (let i = 0; i < links.length; i++) {
      if (runId !== currentRun) return;
      await phase('opening', i);

      const url = links[i];
      let outcome;
      try {
        await navigateAndWait(tabId, url);
        outcome = await runInTab(tabId, kind, url, 'find');
        if (outcome.result === 'ready') {
          if (kind === 'unfollow' && (await unfollowsToday()) >= (opts.dailyCap || 50)) {
            stopReason = 'سقف روزانه‌ی آنفالو پر شد';
            break;
          }
          const pre = randBetween(opts.preMinMs, opts.preMaxMs);
          if (pre > 0) {
            await phase('reading', i, pre);
            if (!(await waitUnlessStopped(pre, runId))) return;
          }
          await phase('liking', i);
          if (!(await waitWhilePaused(runId))) return;
          outcome = await runInTab(tabId, kind, url, 'click');
          if (outcome.result === 'unfollowed') await countUnfollow();
        }
      } catch (e) {
        outcome = { result: 'error', detail: e.message };
      }

      if (runId !== currentRun) return;
      results.push({ url, result: outcome.result, detail: outcome.detail });
      await update({ results: [...results] });

      if (outcome.fatal) { stopReason = outcome.fatalReason || 'وارد حساب X نشده‌اید — اول لاگین کنید.'; break; }
      errStreak = outcome.result === 'error' ? errStreak + 1 : 0;
      if (errStreak >= 3) { stopReason = 'سه خطای پشت‌سرهم؛ برای امنیت حساب متوقف شد.'; break; }

      if (i < links.length - 1) {
        const wait = randBetween(opts.delayMinMs, opts.delayMaxMs);
        await phase('waiting', i + 1, wait);
        if (!(await waitUnlessStopped(wait, runId))) return;
      }
    }
  } catch (e) {
    stopReason = `خطا: ${e.message}`;
  }

  if (runId !== currentRun) return;
  const summary = summarize(results, 'auto', kind);

  if (tabId !== null && closeTab && !stopReason) {
    chrome.tabs.remove(tabId).catch(() => {});
  }
  stopKeepAlive();
  await setState({
    running: false,
    phase: stopReason ? 'stopped' : 'done',
    phaseEnd: null,
    statusText: stopReason ? `${stopReason} — ${summary}` : `تمام شد — ${summary}`,
  });
}

/* ───────────── manual mode ───────────── */

// Injected: reads (never clicks) whether the focal tweet is liked.
async function readLikeStateInPage(statusId) {
  const findArticle = () => {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    return articles.find((a) => a.querySelector(`a[href*="/status/${statusId}"] time`)) ||
      articles.find((a) => a.getAttribute('tabindex') === '-1');
  };
  for (let i = 0; i < 6; i++) {
    const a = findArticle();
    if (a?.querySelector('[data-testid="unlike"]')) return 'liked';
    if (a?.querySelector('[data-testid="like"]')) return 'skipped';
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'skipped';
}

// Injected: reads (never clicks) whether you still follow this profile.
async function readFollowStateInPage() {
  function followStateInPage() {
    const scope = document.querySelector('[data-testid="placementTracking"]') ||
      document.querySelector('[data-testid="userActions"]') || document.querySelector('main') || document;
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    // skip the confirmation dialog's own buttons and anything hidden
    const btns = [...scope.querySelectorAll('button, [role="button"]')]
      .filter((b) => b.offsetParent !== null && !b.closest('[role="dialog"], [role="alertdialog"]'));
    const label = (b) => norm(b.getAttribute('aria-label') || b.textContent);
    const unf = btns.find((b) => /-unfollow$/.test(b.dataset.testid || '') || /^(Following|Unfollow|دنبال می‌کنید)$/i.test(label(b)));
    if (unf) return { state: 'following', button: unf };
    const fol = btns.find((b) => /-follow$/.test(b.dataset.testid || '') || /^(Follow|دنبال کردن)$/i.test(label(b)));
    if (fol) return { state: 'follow', button: fol };
    return { state: null };
  }
  for (let i = 0; i < 6; i++) {
    const st = followStateInPage();
    if (st.state === 'following') return 'skipped';
    if (st.state === 'follow') return 'unfollowed';
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'skipped';
}

async function startManual({ links, closeTab, autoNext, kind = 'like' }) {
  currentRun++; // cancels any auto run still going
  paused = false;
  stopKeepAlive();
  // Save the state before the first page loads, so the on-page panel finds it.
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  await chrome.storage.local.set({
    runState: {
      kind, mode: 'manual', running: true, queue: links, results: [], index: 0, tabId: tab.id,
      phase: 'manual', phaseStart: Date.now(), phaseEnd: null, closeTab, autoNext, statusText: '',
    },
  });
  await chrome.tabs.update(tab.id, { url: links[0] });
}

let advancing = false; // ignore double presses while the next page is being opened
async function manualNext() {
  if (advancing) return;
  const { runState: s } = await chrome.storage.local.get('runState');
  if (!s?.running || s.mode !== 'manual') return;
  advancing = true;
  try {
    const url = s.queue[s.index];
    let result = 'skipped';
    try {
      const [inj] = s.kind === 'unfollow'
        ? await chrome.scripting.executeScript({ target: { tabId: s.tabId }, func: readFollowStateInPage })
        : await chrome.scripting.executeScript({
          target: { tabId: s.tabId }, func: readLikeStateInPage, args: [url.match(/status\/(\d+)/)[1]],
        });
      result = inj?.result || 'skipped';
    } catch { /* tab on another page or closed: count as skipped */ }

    const results = [...s.results, { url, result }];
    const index = s.index + 1;
    if (index >= s.queue.length) {
      await finishManual({ ...s, results }, false);
      return;
    }
    await setState({ results, index, phaseStart: Date.now() });
    await chrome.tabs.update(s.tabId, { url: s.queue[index], active: true });
  } finally {
    advancing = false;
  }
}

async function finishManual(s, stopped) {
  if (s.closeTab && !stopped) chrome.tabs.remove(s.tabId).catch(() => {});
  await chrome.storage.local.set({
    runState: {
      ...s, running: false, phase: stopped ? 'stopped' : 'done', phaseEnd: null,
      statusText: `${stopped ? 'متوقف شد' : 'تمام شد'} — ${summarize(s.results, 'manual', s.kind)}`,
    },
  });
}

/* Sync watchdog: a little after the sync tab finishes loading, check where it ended up and whether the
   extension is running inside it. If the sync did not even start, say why (login page, no access, …). */
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const { syncJob } = await chrome.storage.local.get('syncJob');
  if (!syncJob || syncJob.tabId !== tabId || Date.now() - syncJob.at > 5 * 60e3) return;
  await sleep(3500); // let the page's own scripts and the content script start
  const { syncDiag, syncState } = await chrome.storage.local.get(['syncDiag', 'syncState']);
  if (syncDiag?.steps?.page) return; // the content script already took over
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  const injected = !!(await chrome.tabs.sendMessage(tabId, { type: 'xalPing' }).catch(() => null));
  const url = tab.url || '';
  const login = /\/(i\/flow\/login|login)(\/|\?|$)/.test(url);
  const [title, detail] = login ? ['وارد X نشده‌اید', 'تب به صفحه‌ی ورود رفت. در همین مرورگر وارد X شوید و دوباره همگام‌سازی را بزنید.']
    : !injected ? ['اکستنشن داخل صفحه‌ی X اجرا نشد', 'در chrome://extensions مطمئن شوید «دسترسی به سایت» برای اکستنشن روی «در همه‌ی سایت‌ها» یا x.com است، اکستنشن را Reload کنید و تب‌های X را رفرش کنید.']
      : ['تب به صفحه‌ی لیست نرفت', 'اکستنشن اجرا شد ولی آدرس تب صفحه‌ی Following/Followers نیست. نام کاربری ذخیره‌شده ممکن است اشتباه باشد.'];
  await chrome.storage.local.set({
    syncDiag: { at: Date.now(), type: syncJob.type, path: url, steps: { tabUrl: url, injected } },
    syncState: { ...(syncState || {}), type: syncJob.type, state: 'done', reason: login ? 'login' : !injected ? 'not_injected' : 'wrong_url', title, detail, count: 0, at: Date.now() },
  });
  chrome.storage.local.remove('syncJob');
});

// Show the on-page panel each time the run's tab finishes loading a link.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const { runState: s } = await chrome.storage.local.get('runState');
  if (!s?.running || s.mode !== 'manual' || s.tabId !== tabId) return;
  chrome.scripting.executeScript({ target: { tabId }, files: ['overlay.js'] }).catch(() => {});
});

// Closing the run's tab ends a manual run.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { runState: s } = await chrome.storage.local.get('runState');
  if (s?.running && s.mode === 'manual' && s.tabId === tabId) finishManual(s, true);
});

chrome.commands.onCommand.addListener((cmd) => { if (cmd === 'next-link') manualNext(); });


/* ───────────── AI comments (OpenRouter) ─────────────
   Runs here, not in the X page, so the key never reaches X and X's content rules do not apply. */
const OR = 'https://openrouter.ai/api/v1';
const AI_DEFAULTS = {
  apiKey: '', model: 'auto', count: 10, lang: 'auto', temperature: 0.9,
  prompt: `تو یک کاربر باهوش، دوستانه و خوش‌سلیقه‌ی X (توییتر) هستی. برای توییت زیر {{count}} کامنت متفاوت بنویس.

قواعد:
- هر کامنت کوتاه و طبیعی باشد (حداکثر ۲۰۰ کاراکتر)، شبیه آدم واقعی، نه ربات.
- متنوع باشند: موافقت، سؤال، نکته‌ی تازه، شوخی ملایم، تجربه‌ی شخصی.
- بدون هشتگ، بدون لینک، بدون تعریف‌های اغراق‌آمیز و کلیشه‌ای.
- فقط به محتوای خود توییت جواب بده.
زبان کامنت‌ها: {{lang}}`,
};
// Free models change often, so the list is read live; these name patterns rank the good ones first.
const AI_PREFER = [/gpt-oss-120b/, /llama-3\.3-70b/, /deepseek.*(v3|chat)/, /qwen3.*(235|480|32)/, /llama-4/, /gemini.*(2\.5|2\.0|flash)/, /qwen.*72b/, /gemma-3-27b/, /mistral.*(small|large|medium)/, /gemma-3/, /llama-3\.1-405b/];
const AI_AVOID = /(r1|reasoning|thinking|coder|vision|\bvl\b|embed|image|moderation|guard|safety|audio|tts|whisper)/i;
const AI_FALLBACK = ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat-v3-0324:free', 'qwen/qwen-2.5-72b-instruct:free', 'google/gemma-3-27b-it:free'];

async function aiSettings() {
  const { ai } = await chrome.storage.local.get('ai');
  return { ...AI_DEFAULTS, ...(ai || {}) };
}

async function aiFreeModels(force = false) {
  const { aiModelCache } = await chrome.storage.local.get('aiModelCache');
  if (!force && aiModelCache && Date.now() - aiModelCache.at < 6 * 3600e3) return aiModelCache.list;
  const res = await fetch(`${OR}/models`);
  if (!res.ok) throw new Error(`models ${res.status}`);
  const data = (await res.json()).data || [];
  const free = data.filter((m) => String(m.pricing?.prompt) === '0' && String(m.pricing?.completion) === '0'
    && (!m.architecture?.output_modalities || m.architecture.output_modalities.includes('text')) && (m.context_length || 0) >= 8000);
  const score = (m) => { const i = AI_PREFER.findIndex((re) => re.test(m.id)); return (i < 0 ? 100 : i) * 1e6 - (m.context_length || 0) + (AI_AVOID.test(m.id) ? 1e9 : 0); };
  const list = free.sort((a, b) => score(a) - score(b)).map((m) => ({ id: m.id, name: m.name || m.id, ctx: m.context_length || 0 }));
  await chrome.storage.local.set({ aiModelCache: { at: Date.now(), list } });
  return list;
}

function aiBuildPrompt(cfg, tweet, extra) {
  const lang = { auto: 'همان زبان توییت', en: 'انگلیسی', fa: 'فارسی' }[cfg.lang] || cfg.lang;
  const body = cfg.prompt.replaceAll('{{count}}', cfg.count).replaceAll('{{lang}}', lang).replaceAll('{{author}}', tweet.name ? `${tweet.name} (@${tweet.handle})` : `@${tweet.handle}`).replaceAll('{{tweet}}', tweet.text);
  const hasTweet = cfg.prompt.includes('{{tweet}}');
  return `${body}${hasTweet ? '' : `\n\nتوییت از ${tweet.name || ''} (@${tweet.handle}):\n"""\n${tweet.text}\n"""`}${extra ? `\n\nدستور اضافه برای این بار: ${extra}` : ''}

خروجی را فقط به این شکل بده، بدون هیچ توضیح یا متن دیگری و بدون markdown:
یک آرایه‌ی JSON با دقیقاً ${cfg.count} شیء به شکل {"text": "متن کامنت", "fa": "ترجمه‌ی فارسی همین کامنت"}.
اگر خود کامنت فارسی است، مقدار "fa" را رشته‌ی خالی بگذار.`;
}

// Some models put the Persian translation inside the comment itself ("English text — فارسی" or "English (فارسی)").
// Keep the original comment clean so copy / use only ever carry that, and move the translation to its own field.
function aiSplitMixed(it) {
  const fa = /[\u0600-\u06FF]/;
  const m = it.text.match(/^(.*?[A-Za-z].*?)\s*(?:[(\[]\s*|[-–—|/:]+\s*|\n+)([\u0600-\u06FF][\s\S]*?)[)\]]?\s*$/);
  if (m && fa.test(m[2]) && (m[1].match(/[A-Za-z]/g) || []).length >= 8 && !fa.test(m[1])) {
    return { text: m[1].trim().replace(/[\s(\[\-–—|/:]+$/, ''), fa: it.fa || m[2].trim() };
  }
  return it;
}

// Models answer in many shapes: fenced JSON, an object holding the array, or numbered lines.
function aiParse(text) {
  return aiParseRaw(text).map(aiSplitMixed);
}
function aiParseRaw(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const tryJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let v = tryJson(t);
  if (!v) { const a = t.indexOf('['), b = t.lastIndexOf(']'); if (a >= 0 && b > a) v = tryJson(t.slice(a, b + 1)); }
  if (!v) { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) v = tryJson(t.slice(a, b + 1)); }
  if (v && !Array.isArray(v)) v = v.comments || v.items || v.replies || Object.values(v).find(Array.isArray);
  if (Array.isArray(v)) {
    const out = v.map((x) => (typeof x === 'string' ? { text: x, fa: '' } : { text: String(x.text || x.comment || x.reply || '').trim(), fa: String(x.fa || x.persian || x.translation || '').trim() })).filter((x) => x.text);
    if (out.length) return out;
  }
  const lines = t.split('\n').map((l) => l.replace(/^\s*(?:\d+[.)\-]|[-*•])\s*/, '').trim()).filter((l) => l.length > 3);
  return lines.map((l) => { const [text, fa] = l.split(/\s*(?:\|\||\|\|\||—\s*fa:|\s-\s(?=[؀-ۿ]))\s*/); return { text: (text || '').replace(/^["“]|["”]$/g, ''), fa: fa || '' }; }).filter((x) => x.text);
}

// Models to try, best first: the chosen one, or the top of the live free list (with a built-in fallback).
async function aiCandidates(cfg) {
  if (cfg.model && cfg.model !== 'auto') return [cfg.model];
  let list = [];
  try { list = (await aiFreeModels()).slice(0, 5).map((m) => m.id); } catch { /* use the fallback */ }
  return list.length ? list : AI_FALLBACK;
}

// Translate one tweet to Persian. Cached per tweet so reading it again costs nothing.
async function aiTranslate({ id, text }) {
  const { aiTransCache = {} } = await chrome.storage.local.get('aiTransCache');
  if (id && aiTransCache[id]) return { ok: true, fa: aiTransCache[id].fa, model: aiTransCache[id].model, cached: true };
  const cfg = await aiSettings();
  if (!cfg.apiKey) return { ok: false, code: 'no_key', error: 'کلید OpenRouter ثبت نشده است. از «کامنت هوشمند ← تنظیمات» وارد کنید.' };
  const prompt = `این توییت را به فارسی روان و طبیعی ترجمه کن. اسم‌ها، @منشن‌ها، هشتگ‌ها و لینک‌ها را همان‌طور نگه دار. فقط ترجمه را بنویس، بدون توضیح و بدون علامت نقل‌قول.\n\n${text}`;
  let lastError = 'پاسخی از مدل‌ها نیامد.';
  for (const model of await aiCandidates(cfg)) {
    try {
      const res = await fetch(`${OR}/chat/completions`, { method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://x.com', 'X-Title': 'X Auto Liker' },
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }) });
      if (res.status === 401 || res.status === 403) return { ok: false, code: 'auth', error: 'کلید OpenRouter معتبر نیست.' };
      if (res.status === 402) return { ok: false, code: 'credit', error: 'اعتبار OpenRouter کافی نیست.' };
      if (!res.ok) { lastError = `${model}: خطای ${res.status}`; continue; }
      const data = await res.json();
      const fa = String(data.choices?.[0]?.message?.content || '').replace(/^["“«]|["”»]$/g, '').trim();
      if (!fa || !/[\u0600-\u06FF]/.test(fa)) { lastError = `${model}: ترجمه‌ی فارسی نداد`; continue; }
      if (id) {
        aiTransCache[id] = { fa, model, at: Date.now() };
        const keys = Object.keys(aiTransCache);
        if (keys.length > 300) for (const k of keys.sort((a, b) => aiTransCache[a].at - aiTransCache[b].at).slice(0, keys.length - 300)) delete aiTransCache[k];
        await chrome.storage.local.set({ aiTransCache });
      }
      return { ok: true, fa, model };
    } catch (e) { lastError = `${model}: ${e.message}`; }
  }
  return { ok: false, code: 'failed', error: lastError };
}

async function aiComments({ tweet, extra, count }) {
  const cfg = { ...(await aiSettings()) };
  if (count) cfg.count = count;
  if (!cfg.apiKey) return { ok: false, code: 'no_key', error: 'کلید OpenRouter ثبت نشده است. از «تنظیمات» وارد کنید.' };
  const candidates = await aiCandidates(cfg);
  const prompt = aiBuildPrompt(cfg, tweet, extra);
  let lastError = 'پاسخی از مدل‌ها نیامد.';
  for (const model of candidates) {
    try {
      const res = await fetch(`${OR}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://x.com', 'X-Title': 'X Auto Liker' },
        body: JSON.stringify({ model, temperature: cfg.temperature, max_tokens: 2400, messages: [{ role: 'user', content: prompt }] }),
      });
      if (res.status === 401 || res.status === 403) return { ok: false, code: 'auth', error: 'کلید OpenRouter معتبر نیست.' };
      if (res.status === 402) return { ok: false, code: 'credit', error: 'اعتبار OpenRouter کافی نیست (این مدل رایگان نبود یا سقف رایگان پر شده).' };
      if (!res.ok) { lastError = `${model}: خطای ${res.status}`; continue; } // 404 / 429 / 5xx: try the next model
      const data = await res.json();
      if (data.error) { lastError = `${model}: ${data.error.message || 'خطا'}`; continue; }
      const items = aiParse(data.choices?.[0]?.message?.content);
      if (items.length >= 2) return { ok: true, model, items: items.slice(0, Math.max(cfg.count, 1)) };
      lastError = `${model}: پاسخ قابل‌خواندن نبود`;
    } catch (e) { lastError = `${model}: ${e.message}`; }
  }
  return { ok: false, code: 'failed', error: lastError };
}

async function aiTestKey(key) {
  const res = await fetch(`${OR}/auth/key`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) return { ok: false, error: res.status === 401 ? 'کلید معتبر نیست.' : `خطای ${res.status}` };
  const d = (await res.json()).data || {};
  return { ok: true, label: d.label || '', free: !!d.is_free_tier, usage: d.usage };
}

// ── Sorsa Score ─────────────────────────────────────────────────────────────────────────────────────────
// Two sources, both background-only:
//  1. No key (default): the user's own app.sorsa.io sign-in in this browser. We load the public Sorsa profile page
//     with that session (credentials: 'include') and read the score from the page data. A free Sorsa account is enough.
//  2. Optional API key (https://api.sorsa.io/v3, header ApiKey): /score → { score }, /score-changes → { week_delta,
//     month_delta }, /top-followers → { users: [...] }. Used when the page gave nothing, or for top followers.
const SORSA = 'https://api.sorsa.io/v3';
const SORSA_APP = 'https://app.sorsa.io';
const SORSA_TTL = 12 * 3600e3;
const num = (v) => {
  if (typeof v === 'string') v = v.replace(/,/g, '').trim();
  return v !== '' && v !== null && v !== undefined && typeof v !== 'boolean' && isFinite(Number(v)) ? Number(v) : null;
};
function sorsaPick(d) {
  if (typeof d === 'number') return d;
  if (!d || typeof d !== 'object') return null;
  for (const [k, v] of Object.entries(d)) if (/score/i.test(k) && num(v) !== null) return Number(v);
  for (const v of Object.values(d)) if (v && typeof v === 'object') { const r = sorsaPick(v); if (r !== null) return r; }
  return null;
}
const sorsaUser = (u) => ({
  username: u.username || u.screen_name || u.handle || '', name: u.display_name || u.name || '',
  avatar: u.profile_image_url || u.profile_image_url_https || u.avatar || u.image || '',
  followers: num(u.followers_count ?? u.followers), score: num(u.score ?? u.sorsa_score ?? u.twitter_score), verified: !!u.verified,
});
const sorsaUsers = (list) => list.map(sorsaUser).filter((u) => u.username).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

// ── 1. Sorsa website with the user's session ──
// app.sorsa.io is a Next.js app: its server-rendered data sits in self.__next_f.push([n, "…"]) chunks as lines of
// "id:JSON", with React Query records ({ queryKey: [...], state: { data } }). Field names are not documented, so we
// look for them loosely and fall back to the score shown in the page text / meta tags.
function sorsaPageData(html) {
  let flight = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[\d+,\s*"((?:\\.|[^"\\])*)"\]\)/g)) {
    try { flight += JSON.parse(`"${m[1]}"`); } catch { /* skip broken chunk */ }
  }
  const roots = [];
  for (const line of flight.split('\n')) {
    const i = line.indexOf(':');
    if (i < 1 || i > 8) continue;
    try { roots.push(JSON.parse(line.slice(i + 1))); } catch { /* not a JSON record */ }
  }
  for (const m of html.matchAll(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/g)) { try { roots.push(JSON.parse(m[1])); } catch { /* ignore */ } }
  return roots;
}
const deltaKey = (k, period) => period.test(k) && /delta|change|diff|grow|gain/i.test(k);
// Walks JSON records (page data or API responses) for this handle's score, score changes and top followers.
function sorsaScan(roots, handle) {
  const h = handle.toLowerCase();
  const out = { score: null, week: null, month: null, top: null };
  const isMe = (o) => [o.screen_name, o.username, o.handle].some((v) => typeof v === 'string' && v.replace(/^@/, '').toLowerCase() === h);
  const deltas = (o, loose) => {
    for (const [k, v] of Object.entries(o)) {
      if (num(v) === null) continue;
      if (out.week === null && (deltaKey(k, /week|7d|7_d|seven/i) || (loose && /^(week|weekly|7d|d7)$/i.test(k)))) out.week = num(v);
      if (out.month === null && (deltaKey(k, /month|30d|30_d|thirty/i) || (loose && /^(month|monthly|30d|d30)$/i.test(k)))) out.month = num(v);
    }
  };
  const seen = new Set();
  const visit = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 60 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node.queryKey)) {
      const key = node.queryKey.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
      const data = node.state?.data;
      const aboutMe = key.toLowerCase().includes(h);
      if (data !== undefined && data !== null) {
        if (/top.?follow/i.test(key) && aboutMe && !out.top) {
          const list = Array.isArray(data) ? data : data.users || data.items || data.data || data.results;
          if (Array.isArray(list)) out.top = sorsaUsers(list);
        } else if (/change|delta|history/i.test(key) && aboutMe && typeof data === 'object') deltas(data, true);
        else if (/score/i.test(key) && aboutMe && out.score === null) out.score = typeof data === 'object' ? sorsaPick(data) : num(data);
      }
    }
    if (!Array.isArray(node) && isMe(node)) {
      if (out.score === null) for (const k of ['score', 'score_value', 'sorsa_score', 'sorsaScore', 'scoreValue', 'twitter_score', 'total_score']) if (num(node[k]) !== null) { out.score = num(node[k]); break; }
      if (out.score === null) for (const [k, v] of Object.entries(node)) if (/score/i.test(k) && !/change|delta|diff|rank|percent|pct|history|prev/i.test(k) && num(v) !== null) { out.score = num(v); break; }
      deltas(node, false);
      for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object' && !Array.isArray(v) && !isMe(v)) deltas(v, /change|delta|diff/i.test(`${k} ${Object.keys(v).join(' ')}`));
    }
    for (const v of Array.isArray(node) ? node : Object.values(node)) if (v && typeof v === 'object') visit(v, depth + 1);
  };
  for (const r of roots) visit(r, 0);
  return out;
}
const sorsaTextScore = (src) => {
  const m = src.match(/sorsa\s*score\s*(?:of|is)?\s*[:=\-]?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i) || src.match(/\bscore\s*(?:of|is)?\s*[:=\-]?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  const v = m ? num(m[1]) : null;
  return v !== null && v > 0 && v < 100000 ? v : null;
};
function sorsaParse(html, handle) {
  const h = handle.toLowerCase();
  const out = sorsaScan(sorsaPageData(html), handle);
  const textScore = sorsaTextScore;
  // Fallbacks, most specific first: the page's meta tags ("… Score 870 …"), serialized fields / CSS-module class
  // names seen on Sorsa pages (closest to the handle), then the visible text.
  if (out.score === null) {
    const meta = [...html.matchAll(/<meta[^>]+>/gi)].map((m) => m[0]).filter((t) => /og:title|og:description|twitter:title|name="description"/i.test(t))
      .map((t) => (t.match(/content=["']([^"']*)["']/i) || [])[1] || '').join(' ');
    out.score = textScore(meta);
  }
  if (out.score === null) {
    const cands = [];
    for (const re of [/\\?"(?:score_value|sorsa_score|sorsaScore|scoreValue|score)\\?"\s*:\s*\\?"?([0-9]+(?:\.[0-9]+)?)/gi,
      /class=["'][^"']*(?:scoreValue|profileScoreStats|score-value|ScoreValue)[^"']*["'][^>]*>\s*(?:<[^>]+>\s*)*([0-9][0-9,]*(?:\.[0-9]+)?)\s*</gi]) {
      for (const m of html.matchAll(re)) { const v = num(m[1]); if (v !== null && v > 0 && v < 100000) cands.push({ v, i: m.index }); }
    }
    if (cands.length) {
      const low = html.toLowerCase();
      const at = [];
      for (let i = low.indexOf(h); i !== -1 && at.length < 200; i = low.indexOf(h, i + h.length)) at.push(i);
      const near = at.length ? cands.map((c) => ({ ...c, d: Math.min(...at.map((i) => Math.abs(i - c.i))) })).sort((x, y) => x.d - y.d)[0] : null;
      out.score = near && near.d < 1500 ? near.v : cands.length === 1 ? cands[0].v : null;
    }
  }
  if (out.score === null) {
    out.score = textScore(html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' '));
  }
  return out;
}
const sorsaLoginPage = (url) => { try { return /^\/(authorization|login|sign-?in|auth)\b/i.test(new URL(url).pathname); } catch { return false; } };
async function sorsaWeb(handle) {
  let res;
  try {
    res = await fetch(`${SORSA_APP}/profile/${encodeURIComponent(handle)}`, { credentials: 'include', cache: 'no-store', headers: { Accept: 'text/html' } });
  } catch { return { ok: false, code: 'failed', error: 'به app.sorsa.io دسترسی نیست.' }; }
  if (sorsaLoginPage(res.url) || res.status === 401) return { ok: false, code: 'login', error: 'برای دیدن امتیاز بدون کلید، در همین مرورگر وارد app.sorsa.io شوید.' };
  if (res.status === 404) return { ok: true, score: null, week: null, month: null };
  if (res.status === 429) return { ok: false, code: 'limit', error: 'Sorsa موقتاً درخواست‌ها را محدود کرده؛ کمی بعد دوباره امتحان کنید.' };
  if (!res.ok) return { ok: false, code: 'failed', error: `خطای Sorsa ${res.status}` };
  const html = await res.text();
  const r = sorsaParse(html, handle);
  // Keep the last page where no score was found, so the user can save it from the settings page for debugging.
  if (r.score === null) {
    await chrome.storage.local.set({ sorsaDebug: { handle, url: res.url, status: res.status, at: Date.now(), size: html.length,
      flight: html.includes('__next_f'), mentions: html.toLowerCase().split(handle.toLowerCase()).length - 1, html: html.slice(0, 1500000) } });
  }
  return { ok: true, ...r, top: r.top?.length ? r.top.slice(0, 20) : undefined };
}
// Last resort when the page HTML has no score (rendered in the browser): open the Sorsa profile in a background tab,
// let content/sorsa-hook.js record the site's own JSON responses, read them and the rendered text, close the tab.
// One tab at a time.
let sorsaTabQueue = Promise.resolve();
function sorsaRender(handle) {
  const run = async () => {
    const tab = await chrome.tabs.create({ url: `${SORSA_APP}/profile/${encodeURIComponent(handle)}#xal-sorsa`, active: false });
    let best = null, last = null;
    try {
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 750));
        const t = await chrome.tabs.get(tab.id).catch(() => null);
        if (!t) break;
        if (t.url && sorsaLoginPage(t.url)) return { ok: false, code: 'login', error: 'برای دیدن امتیاز بدون کلید، در همین مرورگر وارد app.sorsa.io شوید.' };
        if (t.status !== 'complete' && i < 20) continue;
        const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN',
          func: () => ({ log: window.__xalSorsaLog || [], text: (document.body?.innerText || '').slice(0, 30000), url: location.href }) }).catch(() => [null]);
        const v = res?.result;
        if (!v) continue;
        last = v;
        const out = sorsaScan(v.log.map((x) => x.data), handle);
        if (out.score === null) out.score = sorsaTextScore(v.text);
        if (out.score !== null) {
          // Give the page one more round to deliver score changes / top followers, then stop.
          if (best && best.score === out.score) { best = out; break; }
          best = out;
        }
      }
    } finally { chrome.tabs.remove(tab.id).catch(() => {}); }
    if (best) return { ok: true, ...best, top: best.top?.length ? best.top.slice(0, 20) : undefined };
    if (last) {
      const prev = (await chrome.storage.local.get('sorsaDebug')).sorsaDebug || {};
      await chrome.storage.local.set({ sorsaDebug: { ...prev, rendered: { url: last.url, text: last.text.slice(0, 5000), calls: last.log.map((x) => x.url).slice(0, 40), sample: JSON.stringify(last.log.slice(0, 8)).slice(0, 200000) } } });
    }
    return { ok: true, score: null, week: null, month: null };
  };
  const p = sorsaTabQueue.then(run, run);
  sorsaTabQueue = p.catch(() => {});
  return p;
}
async function sorsaSession() {
  try {
    const res = await fetch(`${SORSA_APP}/`, { credentials: 'include', cache: 'no-store' });
    return { ok: true, login: !sorsaLoginPage(res.url) };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── 2. Official API with the user's key ──
async function sorsaGet(key, path, handle) {
  const res = await fetch(`${SORSA}/${path}?username=${encodeURIComponent(handle)}`, { headers: { ApiKey: key, Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) return { ok: false, code: 'auth', error: 'کلید Sorsa معتبر نیست.' };
  if (res.status === 402 || res.status === 429) return { ok: false, code: 'limit', error: 'سقف یا اعتبار Sorsa تمام شده است.' };
  if (res.status === 404) return { ok: true, data: null };
  if (!res.ok) return { ok: false, code: 'failed', error: `خطای Sorsa ${res.status}` };
  let data = null;
  try { data = await res.json(); } catch { /* keep null */ }
  return { ok: true, data };
}
async function sorsaApi(key, handle) {
  const [s, c] = await Promise.all([sorsaGet(key, 'score', handle), sorsaGet(key, 'score-changes', handle).catch(() => ({ ok: false }))]);
  if (!s.ok) return s;
  const d = c.ok && c.data ? c.data : {};
  return { ok: true, score: sorsaPick(s.data), week: num(d.week_delta), month: num(d.month_delta) };
}
async function sorsaTopApi(key, handle) {
  const r = await sorsaGet(key, 'top-followers', handle);
  if (!r.ok) return r;
  const list = Array.isArray(r.data?.users) ? r.data.users : Array.isArray(r.data) ? r.data : [];
  return { ok: true, users: sorsaUsers(list) };
}

// Website first; the key (if any) when the website can't help. Last error wins only if nothing worked.
async function sorsaFetch(cfg, handle) {
  let r = cfg.source !== 'api' ? await sorsaWeb(handle) : { ok: false, code: 'skip' };
  if (r.ok && r.score !== null) return { ...r, src: 'web' };
  if (r.ok && cfg.render !== false) {
    const t = await sorsaRender(handle).catch((e) => ({ ok: false, code: 'failed', error: e.message }));
    if (t.ok && t.score !== null) return { ...t, src: 'tab' };
    if (!t.ok) r = t;
  }
  if (cfg.key) {
    const a = await sorsaApi(cfg.key, handle);
    if (a.ok) return { ...a, src: 'api' };
    if (!r.ok) r = a;
  }
  if (!r.ok && r.code === 'skip') return { ok: false, code: 'off', error: 'اول کلید Sorsa را در تنظیمات وارد کنید.' };
  return r;
}
async function sorsaTopFetch(cfg, handle) {
  const { sorsaCache = {} } = await chrome.storage.local.get('sorsaCache');
  const fromPage = sorsaCache[handle]?.v?.top;
  if (fromPage?.length) return { ok: true, users: fromPage };
  if (cfg.key) return sorsaTopApi(cfg.key, handle);
  return { ok: false, code: 'nokey', error: 'برترین دنبال‌کننده‌ها در صفحه‌ی Sorsa این حساب پیدا نشد. می‌توانید آن را در خود Sorsa ببینید.' };
}
// One cache per kind ('sorsaCache' for the score, 'sorsaTopCache' for top followers), 12 hours, at most 400 handles.
async function sorsaCached(store, handle, force, fetcher) {
  const { sorsa = {}, [store]: cache = {} } = await chrome.storage.local.get(['sorsa', store]);
  const k = String(handle).replace(/^@/, '').toLowerCase();
  const hit = cache[k];
  if (!force && hit && Date.now() - hit.at < SORSA_TTL) return { ...hit.v, ok: true, cached: true, at: hit.at };
  const r = await fetcher(sorsa, k);
  if (r.ok && !(store === 'sorsaCache' && r.score === null)) {
    const { ok, ...v } = r;
    cache[k] = { v, at: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > 400) for (const o of keys.sort((a, c) => cache[a].at - cache[c].at).slice(0, keys.length - 400)) delete cache[o];
    await chrome.storage.local.set({ [store]: cache });
    r.at = cache[k].at;
  }
  return r;
}
async function sorsaScore(handle, { manual = false, force = false } = {}) {
  const { sorsa = {} } = await chrome.storage.local.get('sorsa');
  if (!manual && sorsa.enabled === false) return { ok: false, code: 'off' };
  return sorsaCached('sorsaCache', handle, force, sorsaFetch);
}
const sorsaTop = (handle, force) => sorsaCached('sorsaTopCache', handle, force, sorsaTopFetch);

let missQueue = Promise.resolve();
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'i18nMiss') {
    missQueue = missQueue.then(async () => {
      const { i18nMisses } = await chrome.storage.local.get('i18nMisses');
      const a = i18nMisses || [];
      if (!a.includes(msg.key)) await chrome.storage.local.set({ i18nMisses: [...a, msg.key] });
    });
    return;
  }
  if (msg.type === 'sorsaScore') {
    sorsaScore(msg.handle, msg).then(sendResponse, (e) => sendResponse({ ok: false, code: 'failed', error: e.message }));
    return true;
  }
  if (msg.type === 'sorsaTop') {
    sorsaTop(msg.handle, !!msg.force).then(sendResponse, (e) => sendResponse({ ok: false, code: 'failed', error: e.message }));
    return true;
  }
  if (msg.type === 'sorsaDebug') {
    chrome.storage.local.get('sorsaDebug').then((d) => sendResponse(d.sorsaDebug || null));
    return true;
  }
  if (msg.type === 'sorsaSession') {
    sorsaSession().then(sendResponse);
    return true;
  }
  if (msg.type === 'sorsaTest') {
    sorsaGet(String(msg.key || ''), 'score', msg.handle || 'jack')
      .then((r) => (r.ok ? { ok: true, score: sorsaPick(r.data) } : r))
      .then(sendResponse, (e) => sendResponse({ ok: false, code: 'failed', error: e.message }));
    return true;
  }
  if (msg.type === 'aiTranslate') {
    aiTranslate(msg).then(sendResponse, (e) => sendResponse({ ok: false, code: 'failed', error: e.message }));
    return true;
  } else if (msg.type === 'aiComments') {
    aiComments(msg).then(sendResponse, (e) => sendResponse({ ok: false, code: 'failed', error: e.message }));
    return true;
  } else if (msg.type === 'aiModels') {
    aiFreeModels(!!msg.force).then((list) => sendResponse({ ok: true, list }), (e) => sendResponse({ ok: false, error: e.message }));
    return true;
  } else if (msg.type === 'aiTestKey') {
    aiTestKey(msg.key).then(sendResponse, (e) => sendResponse({ ok: false, error: e.message }));
    return true;
  } else if (msg.type === 'aiDefaults') {
    sendResponse({ defaults: AI_DEFAULTS });
  } else if (msg.type === 'syncWho') {
    chrome.storage.local.get('syncJob').then(({ syncJob }) => {
      const mine = !!syncJob && _sender.tab && syncJob.tabId === _sender.tab.id && Date.now() - syncJob.at < 5 * 60e3;
      sendResponse({ job: mine ? syncJob : null });
    });
    return true; // async answer
  } else if (msg.type === 'closeSelf' && _sender.tab) {
    chrome.tabs.remove(_sender.tab.id).catch(() => {});
    sendResponse({ ok: true });
  } else if (msg.type === 'focusSelf' && _sender.tab) {
    chrome.tabs.update(_sender.tab.id, { active: true }).catch(() => {});
    sendResponse({ ok: true });
  } else if (msg.type === 'pause' || msg.type === 'resume') {
    paused = msg.type === 'pause';
    setState({ paused });
    sendResponse({ ok: true });
  } else if (msg.type === 'start') {
    const links = msg.links.slice(0, KIND[msg.kind || 'like'].max);
    if (msg.mode === 'manual') startManual({ ...msg, links });
    else run({ ...msg, links });
    sendResponse({ ok: true });
  } else if (msg.type === 'next') {
    manualNext();
    sendResponse({ ok: true });
  } else if (msg.type === 'stop') {
    currentRun++;
    stopKeepAlive();
    chrome.storage.local.get('runState').then(({ runState }) => {
      if (runState?.mode === 'manual') return finishManual(runState, true);
      return setState({
        running: false, phase: 'stopped', phaseEnd: null,
        statusText: `متوقف شد — ${summarize(runState?.results, 'auto', runState?.kind)}`,
      });
    });
    sendResponse({ ok: true });
  } else if (msg.type === 'fetchDataURL') {
    fetchDataURL(msg.url).then((dataURL) => sendResponse({ dataURL }), () => sendResponse({}));
    return true; // async response
  } else if (msg.type === 'download') {
    chrome.downloads.download({ url: msg.url, filename: msg.filename, conflictAction: 'uniquify' })
      .then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: e.message }));
    return true;
  } else if (msg.type === 'openPage') {
    // bring an already-open copy of the page to the front instead of opening another
    const base = chrome.runtime.getURL(msg.page.split('?')[0]);
    chrome.tabs.query({ url: `${base}*` }).then(async (tabs) => {
      if (tabs[0]) {
        await chrome.tabs.update(tabs[0].id, { active: true, url: chrome.runtime.getURL(msg.page) });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      } else chrome.tabs.create({ url: chrome.runtime.getURL(msg.page) });
    });
    sendResponse({ ok: true });
  }
});

// Images for the tweet-card canvas: fetched here (host permission, no CORS taint) as data: URLs.
async function fetchDataURL(url) {
  if (!/^https:\/\/(pbs|abs)\.twimg\.com\//.test(url)) throw new Error('blocked host');
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${res.headers.get('content-type') || 'image/jpeg'};base64,${btoa(bin)}`;
}

// If the browser restarted, the run's tab is gone; mark the stale state as stopped.
// (A manual run survives worker restarts, so only reset on startup/update, not on wake-up.)
chrome.runtime.onStartup.addListener(() => { paused = false; setState({ running: false, paused: false }); });
chrome.runtime.onInstalled.addListener(() => setState({ running: false }));
