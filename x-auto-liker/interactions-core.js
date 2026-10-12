// Interaction tracking, pure logic (shared by the notifications collector and the interactions page).
// An event is one notification about someone who liked / reposted / replied / mentioned / followed / quoted you.
// Stored locally as `interactEvents`: [{ k (dedupe key), h (handle), n (name), a (action), t (time ms) }].
(() => {
  const ACTIONS = [
    ['like', /liked|like[sd]? your|پسند|لایک/i],
    ['repost', /reposted|retweeted|بازنشر|ریتوییت/i],
    ['reply', /replied|replying|پاسخ/i],
    ['quote', /quoted|quote tweet|نقل/i],
    ['mention', /mentioned|mention|منشن|اشاره/i],
    ['follow', /followed you|follows? you|دنبال/i],
  ];
  const MAX_EVENTS = 5000;
  const DAY = 86400e3;

  function actionOf(text) {
    for (const [a, re] of ACTIONS) if (re.test(text)) return a;
    return null;
  }

  // Dedupe key: the same notification read twice gives the same key.
  function keyOf(h, a, t) { return `${h}|${a}|${Math.floor(t / 60e3)}`; }

  // Adds new events; returns the list with the old ones kept (capped, newest first) and how many were new.
  function mergeEvents(existing, incoming) {
    const seen = new Set((existing || []).map((e) => e.k));
    const fresh = [];
    for (const e of incoming || []) {
      if (!e || !e.h || !e.a || !isFinite(e.t) || seen.has(e.k)) continue;
      seen.add(e.k);
      fresh.push(e);
    }
    const all = [...fresh, ...(existing || [])].sort((x, y) => y.t - x.t).slice(0, MAX_EVENTS);
    return { events: all, added: fresh.length };
  }

  // One row per account: counts, last interaction, this week's total, and whether they went quiet.
  // `scores` is { handle: sorsaScore } from the cache, if available; nothing is fetched here.
  function summarize(events, now, { scores = {}, inactiveDays = 30 } = {}) {
    const by = new Map();
    for (const e of events || []) {
      let r = by.get(e.h);
      if (!r) {
        r = { handle: e.h, name: e.n || '', counts: { like: 0, repost: 0, reply: 0, quote: 0, mention: 0, follow: 0 }, total: 0, last: 0, week: 0 };
        by.set(e.h, r);
      }
      if (e.n && !r.name) r.name = e.n;
      r.counts[e.a] = (r.counts[e.a] || 0) + 1;
      r.total++;
      if (e.t > r.last) r.last = e.t;
      if (now - e.t < 7 * DAY) r.week++;
    }
    const rows = [...by.values()].map((r) => ({
      ...r,
      score: scores[r.handle] ?? null,
      quiet: now - r.last >= inactiveDays * DAY,
    }));
    rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.total - a.total);
    return rows;
  }

  const api = { actionOf, keyOf, mergeEvents, summarize, MAX_EVENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else self.XI_TRACK = api;
})();
