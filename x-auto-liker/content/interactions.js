// Collects who liked, reposted, replied, mentioned, followed or quoted you, from the notifications page you have open.
// Reads only what X already shows there; nothing is sent anywhere. Stored locally for the interactions page.
(() => {
  const { XAL } = window;
  const TRACK = self.XI_TRACK;
  const RESERVED = new Set(['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'compose', 'intent', 'hashtag']);
  let timer;
  let shownFor = 0;

  // One notification → event, or null if it isn't about someone's action.
  function readItem(item) {
    const text = (item.innerText || '').replace(/\s+/g, ' ').trim();
    const action = TRACK.actionOf(text);
    if (!action) return null;
    let handle = null, name = '';
    for (const a of item.querySelectorAll('a[href^="/"]')) {
      const m = (a.getAttribute('href') || '').match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      if (m && !RESERVED.has(m[1].toLowerCase())) { handle = m[1].toLowerCase(); name = (a.textContent || '').trim().slice(0, 60); break; }
    }
    if (!handle) return null;
    const dt = item.querySelector('time')?.getAttribute('datetime');
    const t = dt ? Date.parse(dt) : NaN;
    const time = isFinite(t) ? t : Date.now();
    return { k: TRACK.keyOf(handle, action, time), h: handle, n: name, a: action, t: time };
  }

  async function collect() {
    if (!/^\/notifications/.test(location.pathname)) return;
    const items = document.querySelectorAll('article, [data-testid="cellInnerDiv"]');
    const found = [];
    const seenNodes = new Set();
    items.forEach((el) => {
      if (seenNodes.has(el) || el.closest('nav')) return;
      seenNodes.add(el);
      const e = readItem(el);
      if (e) found.push(e);
    });
    if (!found.length) return;
    const { interactEvents = [] } = await chrome.storage.local.get('interactEvents');
    const { events, added } = TRACK.mergeEvents(interactEvents, found);
    if (added) {
      await chrome.storage.local.set({ interactEvents: events });
      if (shownFor < 3) { shownFor++; XAL.toast(`${XAL.fa(added)} تعامل جدید ذخیره شد`); }
    }
  }

  XAL.onScan(() => { clearTimeout(timer); timer = setTimeout(collect, 900); });
})();
