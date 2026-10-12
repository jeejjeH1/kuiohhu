// Persian font + direction fix for X.
// XalFa only covers Arabic-script code points, so putting it first in X's font stack changes Persian
// glyphs and leaves Latin text, numbers and emoji in X's own font.
(() => {
  const { XAL } = window;
  const STACK = 'XalFa, TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  const style = document.createElement('style');
  style.id = 'xal-persian';
  const css = (t) => `
    ${t.persianFont ? `
    body, body *:not(svg):not(path):not(i) { font-family: ${STACK} !important; }
    [lang="fa"], [lang="ar"], [lang="ur"], [lang="ps"] { line-height: 1.75 !important; }` : ''}
    ${t.rtlFix ? `
    [data-testid^="tweetTextarea_"] [data-block], [data-testid="dmComposerTextInput"] [data-block] { unicode-bidi: plaintext; text-align: start; }
    .xal-rtl { direction: rtl !important; text-align: right !important; unicode-bidi: isolate; }
    .xal-rtl a { unicode-bidi: isolate; }` : ''}`;

  // Tweets that start with @mention / a link / emoji get the wrong direction from dir="auto".
  const TEXT_SEL = '[data-testid="tweetText"], [data-testid="UserDescription"], [data-testid="messageEntry"] [dir="auto"]';
  function fixDirections() {
    if (!XAL.tools.rtlFix) return;
    document.querySelectorAll(`${TEXT_SEL}:not([data-xal-dir])`).forEach((el) => {
      el.dataset.xalDir = '1';
      if (XAL.isRtlText(el.textContent || '')) el.classList.add('xal-rtl');
    });
  }

  XAL.onTools((t) => {
    style.textContent = css(t);
    if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
    if (!t.rtlFix) document.querySelectorAll('.xal-rtl').forEach((el) => el.classList.remove('xal-rtl'));
    document.querySelectorAll('[data-xal-dir]').forEach((el) => delete el.dataset.xalDir);
    fixDirections();
  });
  XAL.onScan(fixDirections);
})();
