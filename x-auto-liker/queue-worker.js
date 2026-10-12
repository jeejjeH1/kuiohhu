// Background side of the post queue: every minute, checks for scheduled posts whose time has come and shows a
// reminder. Clicking it opens the queue page. Nothing is posted by the extension.
importScripts('queue-core.js');
(() => {
  const ALARM = 'xal-queue';
  const Q = self.XQ;

  async function tick() {
    const { drafts = [] } = await chrome.storage.local.get('drafts');
    const now = Date.now();
    const due = Q.dueNow(drafts, now);
    if (!due.length) return;
    for (const d of due) {
      chrome.notifications.create(`xal-q-${d.id}`, {
        type: 'basic', iconUrl: 'icons/queue-128.png', title: 'وقت انتشار توییت', message: d.text.slice(0, 140) || 'توییت زمان‌بندی‌شده', priority: 1,
      });
    }
    const ids = new Set(due.map((d) => d.id));
    const fresh = (await chrome.storage.local.get('drafts')).drafts || [];
    await chrome.storage.local.set({ drafts: fresh.map((x) => (ids.has(x.id) ? { ...x, notified: now } : x)) });
  }

  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) tick(); });
  chrome.notifications.onClicked.addListener((id) => {
    if (!id.startsWith('xal-q-')) return;
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/queue.html') });
    chrome.notifications.clear(id);
  });
})();
