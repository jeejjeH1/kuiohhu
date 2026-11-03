// Usage: node render.js preview t1 t2 ...   -> preview/t*.png stills (1080x1920)
//        node render.js video [workers]      -> out/video_noaudio.mp4 (15 s, 30 fps, 1080x1920)
//        node render.js poster               -> molten_rocky_poster.png (1080x1350)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const FPS = 30, DUR = 15, VW = 1080, VH = 1920;
const page = (mode) => 'file://' + path.resolve(__dirname, 'index.html') + '?mode=' + mode;

async function openPage(browser, mode, w = VW, h = VH) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.error('PAGE ERROR', e));
  p.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await p.goto(page(mode));
  await p.evaluate(() => window.ready);
  return p;
}
const launch = () => chromium.launch({ args: ['--allow-file-access-from-files', '--ignore-gpu-blocklist'] });

async function preview(times) {
  const b = await launch(), p = await openPage(b, 'render');
  fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });
  for (const t of times) {
    const t0 = Date.now();
    await p.evaluate(t => window.render(t), +t);
    await p.screenshot({ path: path.join(__dirname, 'preview', `t${(+t).toFixed(2)}.png`) });
    console.log(`t=${t} in ${Date.now() - t0} ms`);
  }
  await b.close();
}

async function renderRange(f0, f1, out) {
  const b = await launch(), p = await openPage(b, 'render');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = f0; f < f1; f++) {
    await p.evaluate(t => window.render(t), f / FPS);
    const buf = await p.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((f - f0) % 30 === 0) console.log(`[${path.basename(out)}] frame ${f}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await b.close();
}

async function video(workers) {
  const total = DUR * FPS, outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const chunk = Math.ceil(total / workers), parts = [], jobs = [];
  for (let w = 0; w < workers; w++) {
    const f0 = w * chunk, f1 = Math.min(total, f0 + chunk), p = path.join(outDir, `part${w}.mp4`);
    parts.push(p); jobs.push(renderRange(f0, f1, p));
  }
  await Promise.all(jobs);
  fs.writeFileSync(path.join(outDir, 'parts.txt'), parts.map(p => `file '${p}'`).join('\n'));
  await new Promise(r => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(outDir, 'parts.txt'), '-c', 'copy', path.join(outDir, 'video_noaudio.mp4')], { stdio: 'inherit' }).on('close', r));
  console.log('done: out/video_noaudio.mp4');
}

async function poster() {
  const b = await launch(), p = await openPage(b, 'poster', 1080, 1350);
  await p.evaluate(() => window.render(10));
  await p.screenshot({ path: path.join(__dirname, 'molten_rocky_poster.png') });
  await b.close();
  console.log('done: molten_rocky_poster.png');
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'preview') preview(args.length ? args : ['0.8', '2.6', '4.6', '8.52', '11']);
else if (cmd === 'video') video(+(args[0] || 4));
else if (cmd === 'poster') poster();
else console.log('usage: node render.js preview|video|poster');
