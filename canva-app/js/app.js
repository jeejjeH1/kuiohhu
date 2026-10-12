// App shell: switches between the home screen and the editor.
import { Home, clearTemplateThumbs } from './home.js';
import { FONTS } from './model.js';
import { Editor } from './editor.js';
import { getDesign, settings } from './store.js';
import { toast } from './util.js';

const theme = settings.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.dataset.theme = theme;

const homeEl = document.getElementById('home');
const editorEl = document.getElementById('editor');
let editor = null;

const home = new Home(homeEl, { open: (id) => openDesign(id) });

async function openDesign(id, { push = true } = {}) {
  const d = await getDesign(id);
  if (!d) { toast('طرح پیدا نشد'); return showHome({ push: false }); }
  editor?.destroy();
  homeEl.hidden = true;
  editorEl.hidden = false;
  if (push) history.pushState({ id }, '', '#d=' + id);
  editor = new Editor(editorEl, d, {
    onExit: (nextId) => {
      editor = null;
      if (nextId) openDesign(nextId, { push: false });
      else if (history.state?.id) history.back();
      else showHome({ push: false });
    },
  });
}

function showHome({ push = true } = {}) {
  editor?.destroy();
  editor = null;
  editorEl.hidden = true;
  editorEl.innerHTML = '';
  homeEl.hidden = false;
  if (push) history.pushState({}, '', location.pathname);
  home.render();
}

window.addEventListener('popstate', async (e) => {
  if (e.state?.id) openDesign(e.state.id, { push: false });
  else {
    if (editor) { await editor.save(); }
    showHome({ push: false });
  }
});

const m = location.hash.match(/^#d=(.+)$/);
if (m) {
  history.replaceState({}, '', location.pathname);
  openDesign(m[1]);
} else showHome({ push: false });

// Web fonts arrive asynchronously: load them, then refresh template thumbnails.
if (document.fonts) {
  Promise.all(FONTS.flatMap((f) => ['400', '700'].map((w) => document.fonts.load(`${w} 40px "${f.family}"`, 'aآ').catch(() => {}))))
    .then(() => {
      clearTemplateThumbs();
      if (!homeEl.hidden) home.render();
    });
}

// The Android app serves files from its own assets, so no service worker is needed there.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.TarhsazAndroid) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
