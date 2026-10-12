// Runs on app.sorsa.io only in the background tab the extension opens for a score (URL hash #xal-sorsa, see
// sorsaRender in background.js). Records the JSON responses the site itself loads, so the background can read the
// score from them. Page world, document_start. Nothing is sent anywhere.
(() => {
  if (!location.hash.includes('xal-sorsa') || window.__xalSorsaLog) return;
  const log = (window.__xalSorsaLog = []);
  const keep = (url, text) => {
    if (log.length >= 60 || typeof text !== 'string' || text.length > 3e6) return;
    try { log.push({ url: String(url).slice(0, 300), data: JSON.parse(text) }); } catch { /* not JSON */ }
  };
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      if (/json/i.test(res.headers.get('content-type') || '')) res.clone().text().then((t) => keep(res.url, t), () => {});
    } catch { /* ignore */ }
    return res;
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.addEventListener('load', () => {
      try { if (/json/i.test(this.getResponseHeader('content-type') || '') && (this.responseType === '' || this.responseType === 'text')) keep(url, this.responseText); } catch { /* ignore */ }
    });
    return open.call(this, method, url, ...rest);
  };
})();
