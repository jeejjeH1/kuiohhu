// Post queue logic shared by the queue page and the background worker. Pure functions; no chrome.* here.
// Items are the same objects as the existing `drafts` list: { id, text, at (created), due? (ms, scheduled time),
// sent? (ms, marked as posted), notified? (ms, reminder shown) }. Items without `due` are plain drafts.
(() => {
  const X_LIMIT = 280;
  const URL_RE = /https?:\/\/\S+/g;

  // X counts every link as 23 characters, whatever its length.
  function charCount(text) {
    const withoutLinks = String(text || '').replace(URL_RE, (u) => 'x'.repeat(23));
    return [...withoutLinks].length;
  }

  // Scheduled items that are not posted yet, earliest first, then the plain drafts (newest first).
  function sortQueue(items) {
    const open = (items || []).filter((x) => !x.sent);
    const scheduled = open.filter((x) => typeof x.due === 'number').sort((a, b) => a.due - b.due);
    const drafts = open.filter((x) => typeof x.due !== 'number').sort((a, b) => (b.at || 0) - (a.at || 0));
    return { scheduled, drafts };
  }

  // Items whose time has come and whose reminder has not been shown yet.
  function dueNow(items, now) {
    return (items || []).filter((x) => !x.sent && typeof x.due === 'number' && x.due <= now && !x.notified);
  }

  // X's own composer, pre-filled. The user still presses Post; nothing is sent by the extension.
  function intentUrl(text) {
    return `https://x.com/intent/post?text=${encodeURIComponent(String(text || ''))}`;
  }

  const api = { X_LIMIT, charCount, sortQueue, dueNow, intentUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else self.XQ = api;
})();
