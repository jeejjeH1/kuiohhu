// Passive "active audience": when you open one of YOUR tweets and read the replies, the repliers are counted
// locally. Nothing is requested; it only records what is already on your screen.
(() => {
  const { XAL } = window;
  const MAX_IDS = 4000;

  async function record() {
    const me = XAL.me();
    const m = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!me || !m || m[1].toLowerCase() !== me.toLowerCase()) return;
    const found = [];
    document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => {
      const t = XAL.tweetInfo(a);
      if (!t.id || t.id === m[2] || !t.handle || t.handle.toLowerCase() === me.toLowerCase()) return;
      found.push(t);
    });
    if (!found.length) return;
    const { audience = { seen: [], people: {} } } = await chrome.storage.local.get('audience');
    const seen = new Set(audience.seen);
    let changed = false;
    for (const t of found) {
      if (seen.has(t.id)) continue;
      seen.add(t.id); changed = true;
      const k = t.handle.toLowerCase();
      const p = audience.people[k] || { handle: t.handle, name: t.name, avatar: t.avatar, replies: 0, likes: 0, threads: [] };
      p.replies += 1; p.likes += t.likes || 0; p.name = t.name || p.name; p.avatar = t.avatar || p.avatar; p.last = Date.now();
      if (!p.threads.includes(m[2])) p.threads.push(m[2]);
      audience.people[k] = p;
    }
    if (!changed) return;
    audience.seen = [...seen].slice(-MAX_IDS);
    await chrome.storage.local.set({ audience });
  }

  let timer;
  XAL.onScan(() => { clearTimeout(timer); timer = setTimeout(record, 1200); }); // debounce: record once the replies have loaded
})();
