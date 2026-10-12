// Mentions inbox. On X's notifications page the replies and mentions already on screen are saved locally
// (nothing is requested). A reply the user picks in the inbox is put into the reply box of its tweet; never posted.
(() => {
  const { XAL } = window;
  const MAX = 500;
  // Persian words are matched as whole words (\b does not work for Persian letters)
  const QUESTION = /[?؟]|\b(how|what|why|when|where|who|which)\b|(?<![؀-ۿ])(چطور|چرا|چی|کی|کجا|کدام|چند|آیا)(?![؀-ۿ])/i;
  const THANKS = /ممنون|مرسی|متشکر|تشکر|دستت درد|عالی بود|thank|thanks|thx|🙏|❤/i;

  // priority: verified, or someone who already replied to you more than once (from the audience records)
  function classify(t, people) {
    if (t.verified || (people[t.handle.toLowerCase()]?.replies || 0) >= 2) return 'priority';
    if (QUESTION.test(t.text)) return 'question';
    if (THANKS.test(t.text)) return 'thanks';
    return 'other';
  }

  async function collect() {
    if (!location.pathname.startsWith('/notifications')) return;
    const me = XAL.me();
    const found = [];
    document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => {
      const t = XAL.tweetInfo(a);
      if (!t.id || !t.handle || (me && t.handle.toLowerCase() === me.toLowerCase())) return;
      found.push(t);
    });
    if (!found.length) return;
    const { inbox = {}, audience } = await chrome.storage.local.get(['inbox', 'audience']);
    const people = audience?.people || {};
    let changed = false;
    for (const t of found) {
      if (inbox[t.id]) continue;
      inbox[t.id] = { id: t.id, handle: t.handle, name: t.name, avatar: t.avatar, text: t.text, url: t.url, time: t.time,
        kind: classify(t, people), done: false, at: Date.now() };
      changed = true;
    }
    if (!changed) return;
    const ids = Object.keys(inbox);
    if (ids.length > MAX) ids.sort((a, b) => inbox[a].at - inbox[b].at).slice(0, ids.length - MAX).forEach((k) => delete inbox[k]);
    await chrome.storage.local.set({ inbox });
  }

  // A reply queued from the inbox: wait for this tweet's reply box, put the text in it, and stop.
  async function deliverPending() {
    const m = location.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    if (!m) return;
    const { pendingReply } = await chrome.storage.local.get('pendingReply');
    if (!pendingReply || pendingReply.id !== m[1] || Date.now() - pendingReply.at > 10 * 60e3) return;
    let ed = null;
    for (let i = 0; i < 40 && !ed; i++) {
      ed = document.querySelector('[data-testid="primaryColumn"] [data-testid="tweetTextarea_0"]');
      if (!ed) await XAL.sleep(250);
    }
    if (!ed) return;
    XAL.insertText(ed, pendingReply.text);
    await chrome.storage.local.remove('pendingReply');
  }

  let timer;
  XAL.onScan(() => { clearTimeout(timer); timer = setTimeout(collect, 1200); });
  setTimeout(deliverPending, 1500);
})();
