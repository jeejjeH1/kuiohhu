// Usage: node render.js preview t1 t2 ...   -> PNG stills in ./preview
//        node render.js video [workers]      -> out/video_noaudio.mp4
//        node render.js range f0 f1 out.mp4  -> re-render frames [f0, f1)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const FPS = 30;
const url = 'file://' + path.resolve(__dirname, 'index.html');

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR', e));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(url);
  await page.evaluate(() => window.ready);
  return page;
}

async function preview(times) {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await openPage(browser);
  fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });
  for (const t of times) {
    await page.evaluate(t => window.render(t), +t);
    await page.screenshot({ path: path.join(__dirname, 'preview', `t${(+t).toFixed(2)}.png`) });
  }
  await browser.close();
}

async function renderRange(browser, f0, f1, out) {
  const page = await openPage(browser);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = f0; f < f1; f++) {
    await page.evaluate(t => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await page.close();
}

async function video(workers) {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const total = Math.round(await (await openPage(browser)).evaluate(() => window.DURATION) * FPS);
  const outDir = path.join(__dirname, 'out'); fs.mkdirSync(outDir, { recursive: true });
  const chunk = Math.ceil(total / workers);
  const parts = [];
  const jobs = [];
  for (let w = 0; w < workers; w++) {
    const f0 = w * chunk, f1 = Math.min(total, f0 + chunk);
    const p = path.join(outDir, `part${w}.mp4`); parts.push(p);
    jobs.push(renderRange(browser, f0, f1, p));
  }
  await Promise.all(jobs);
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'parts.txt'), parts.map(p => `file '${p}'`).join('\n'));
  await new Promise(r => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(outDir, 'parts.txt'), '-c', 'copy', path.join(outDir, 'video_noaudio.mp4')], { stdio: 'inherit' }).on('close', r));
  parts.forEach(p => fs.unlinkSync(p));
}

async function range(f0, f1, out) {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  await renderRange(browser, f0, f1, out);
  await browser.close();
}

const [mode, ...rest] = process.argv.slice(2);
(mode === 'preview' ? preview(rest) : mode === 'range' ? range(+rest[0], +rest[1], rest[2]) : video(+(rest[0] || 4)))
  .catch(e => { console.error(e); process.exit(1); });
