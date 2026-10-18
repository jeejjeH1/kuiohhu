// Usage: node render.js preview t1 t2 ...   -> PNG stills in ./preview
//        node render.js video [workers]      -> out/video_noaudio.mp4
//        node render.js range f0 f1 out.mp4  -> re-render frames [f0, f1)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { fps: FPS, duration: DURATION } = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
const url = 'file://' + path.resolve(__dirname, 'index.html');
const ARGS = ['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR', e));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 120000 });
  return page;
}

async function preview(times) {
  const browser = await chromium.launch({ args: ARGS });
  const page = await openPage(browser);
  fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });
  for (const t of times) {
    await page.evaluate(t => window.render(t), +t);
    await page.screenshot({ path: path.join(__dirname, 'preview', `t${(+t).toFixed(2)}.png`) });
  }
  await browser.close();
}

async function renderRange(page, f0, f1, out) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = f0; f < f1; f++) {
    await page.evaluate(t => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95, timeout: 0 });   // motion-blurred frames can take >30s under load
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
}

// Short chunks pulled from a shared queue, so the expensive motion-blurred shots don't all land on one worker.
async function video(workers, chunkFrames = 60) {
  const total = Math.round(DURATION * FPS);
  const outDir = path.join(__dirname, 'out'); fs.mkdirSync(outDir, { recursive: true });
  const chunks = [];
  for (let f0 = 0; f0 < total; f0 += chunkFrames) chunks.push([f0, Math.min(total, f0 + chunkFrames), path.join(outDir, `chunk${String(chunks.length).padStart(3, '0')}.mp4`)]);
  let next = 0, done = 0;
  const worker = async () => {
    const browser = await chromium.launch({ args: ARGS });
    const page = await openPage(browser);
    while (next < chunks.length) {
      const [f0, f1, out] = chunks[next++];
      if (fs.existsSync(out + '.done')) { done++; continue; }   // resume an interrupted render
      await renderRange(page, f0, f1, out);
      fs.writeFileSync(out + '.done', '');
      console.log(`chunk ${++done}/${chunks.length} (frames ${f0}-${f1})`);
    }
    await browser.close();
  };
  await Promise.all(Array.from({ length: workers }, worker));
  fs.writeFileSync(path.join(outDir, 'parts.txt'), chunks.map(c => `file '${c[2]}'`).join('\n'));
  await new Promise(r => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(outDir, 'parts.txt'), '-c', 'copy', path.join(outDir, 'video_noaudio.mp4')], { stdio: 'inherit' }).on('close', r));
  chunks.forEach(c => { fs.unlinkSync(c[2]); fs.unlinkSync(c[2] + '.done'); });
}

async function range(f0, f1, out) {
  const browser = await chromium.launch({ args: ARGS });
  await renderRange(await openPage(browser), f0, f1, out);
  await browser.close();
}

const [mode, ...rest] = process.argv.slice(2);
(mode === 'preview' ? preview(rest) : mode === 'range' ? range(+rest[0], +rest[1], rest[2]) : video(+(rest[0] || 4)))
  .catch(e => { console.error(e); process.exit(1); });
