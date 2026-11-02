// node poster.js -> poster.jpg (Rocky lit up + title)
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  await p.goto('file://' + path.resolve(__dirname, 'index.html')); await p.evaluate(() => window.ready);
  await p.evaluate(() => window.renderPoster());
  await p.screenshot({ path: path.join(__dirname, 'poster.jpg'), type: 'jpeg', quality: 92 });
  await b.close();
})();
