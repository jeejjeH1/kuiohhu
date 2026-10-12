// Persian / English interface. The UI text is written in Persian; in English mode every known string is replaced
// from i18n-dict.js. Numbers inside a string are kept ({n}) and shown with Latin digits. Strings that are not in the
// dictionary stay as they are, and user content (tweets, bios, names, comments) is never touched.
(() => {
  if (window.XI) return;
  const FA_DIG = '۰۱۲۳۴۵۶۷۸۹';
  const NUM = /[۰-۹0-9]+(?:[.,٬٫][۰-۹0-9]+)*/g;
  const HAS_FA = /[؀-ۿ]/;
  const toLatin = (s) => s.replace(/[۰-۹]/g, (d) => FA_DIG.indexOf(d)).replace(/٬/g, ',').replace(/٫/g, '.');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const keyOf = (s) => norm(s).replace(NUM, '{n}');

  const XI = (window.XI = { lang: 'fa', debug: false, scope: null, roots: new Set(), misses: new Set() });
  const orig = new WeakMap();      // text node / [element, attr] -> original Persian
  const written = new WeakMap();   // text node -> the English we wrote (to ignore our own mutation)

  XI.translate = (s) => {
    const dict = window.XI_DICT || {};
    const k = keyOf(s);
    if (!/[A-Za-z؀-ۿ]/.test(k.replace(/\{n\}/g, ''))) return toLatin(norm(s));   // only digits/punctuation: Latin digits
    const hit = dict[k];
    if (hit === undefined) return null;
    const nums = norm(s).match(NUM) || [];
    let i = 0;
    return hit.replace(/\{n\}/g, () => toLatin(nums[i++] ?? ''));
  };

  // UI only: skip user content and anything we do not own (on X's own page only our .xal-* elements are touched).
  const SKIP = 'script,style,textarea,input,[data-no-i18n],.u .main,.tw,.titem,.cm .tx,.xal-tr-text,.txt,.menu .list,[contenteditable]';
  function inScope(el) {
    if (!el || el.closest(SKIP)) return false;
    if (!XI.scope || el.getRootNode() instanceof ShadowRoot) return true;
    return !!el.closest(XI.scope);
  }

  function note(text) {
    if (!XI.debug || !HAS_FA.test(text)) return;
    const k = keyOf(text);
    if (!XI.misses.has(k)) { XI.misses.add(k); try { chrome.runtime.sendMessage({ type: 'i18nMiss', key: k }); } catch { /* ignore */ } }
  }

  function textNode(n) {
    const el = n.parentElement;
    if (!el || !inScope(el)) return;
    const cur = n.nodeValue;
    if (written.get(n) === cur) return;                 // our own write
    if (XI.lang !== 'en') {
      if (orig.has(n) && written.get(n) === cur) { n.nodeValue = orig.get(n); written.delete(n); }
      return;
    }
    if (!HAS_FA.test(cur)) return;
    const lead = cur.match(/^\s*/)[0], trail = cur.match(/\s*$/)[0];
    const en = XI.translate(cur);
    if (en === null) { note(cur); return; }
    orig.set(n, cur);
    const out = lead + en + trail;
    written.set(n, out);
    n.nodeValue = out;
  }

  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const attrOrig = new WeakMap(); // element -> { attr: persian }
  function attrs(el) {
    if (!el.getAttribute || !inScope(el)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      const saved = attrOrig.get(el)?.[a];
      if (XI.lang !== 'en') { if (saved !== undefined) { el.setAttribute(a, saved); delete attrOrig.get(el)[a]; } continue; }
      if (!v || !HAS_FA.test(v)) continue;
      const en = XI.translate(v);
      if (en === null) { note(v); continue; }
      attrOrig.set(el, { ...(attrOrig.get(el) || {}), [a]: v });
      el.setAttribute(a, en);
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1) attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) textNode(n); else attrs(n); }
  }

  let timer = null, pending = new Set();
  function flush() { timer = null; const p = pending; pending = new Set(); p.forEach((n) => walk(n)); }
  const queue = (n) => { pending.add(n); if (!timer) timer = setTimeout(flush, 20); };

  XI.observe = (root) => {
    if (XI.roots.has(root)) return;
    XI.roots.add(root);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') queue(m.target);
        else if (m.type === 'attributes') queue(m.target);
        else m.addedNodes.forEach(queue);
      }
    }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    walk(root);
  };

  XI.setLang = (lang) => {
    XI.lang = lang === 'en' ? 'en' : 'fa';
    const dirs = XI.lang === 'en' ? 'ltr' : 'rtl';
    if (XI.dirTargets !== false) { document.documentElement.setAttribute('lang', XI.lang); if (!XI.scope) document.documentElement.dir = dirs; }
    XI.roots.forEach((r) => walk(r));
    XI.onChange?.(XI.lang);
  };

  const start = (lang, debug) => { XI.debug = !!debug; XI.setLang(lang); };
  chrome.storage.local.get(['lang', 'i18nDebug']).then(({ lang, i18nDebug }) => {
    start(lang || 'fa', i18nDebug);
    if (!XI.scope) XI.observe(document.documentElement);   // extension pages: the whole page
  });
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.lang) XI.setLang(c.lang.newValue); });
})();
