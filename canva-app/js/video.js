// Timeline + video export. Frames come from the same renderer as the editor.
//  - MP4 (H.264 + optional AAC) and WebM (VP9 + optional Opus) via WebCodecs + mp4-muxer / webm-muxer
//  - GIF via gifenc (no audio)
import { pageDur } from './model.js';
import { renderPage, loadFonts, preloadImages } from './renderer.js';
import { evaluateLottieAll } from './lottie.js';

const ease = (t) => t * t * (3 - 2 * t);

export const totalDuration = (design) => design.pages.reduce((s, p) => s + pageDur(p), 0);

// Frame at global time t (ms): draws the page (with its entrance transition if any).
export function renderFrame(ctx, design, t, scale = 1) {
  const pages = design.pages;
  const W = design.width, H = design.height;
  let acc = 0, k = 0;
  for (; k < pages.length - 1; k++) {
    const d = pageDur(pages[k]);
    if (t < acc + d) break;
    acc += d;
  }
  const page = pages[k];
  const local = Math.max(0, t - acc);
  const tr = page.transition;
  const prev = k > 0 ? pages[k - 1] : null;

  if (prev && tr && tr.type && tr.type !== 'none' && local < (tr.dur || 500)) {
    const q = ease(local / (tr.dur || 500));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    // outgoing page at its final state
    ctx.save();
    if (tr.type === 'slide') ctx.translate(-W * q, 0);
    renderPage(ctx, prev, design, scale, { time: pageDur(prev) });
    ctx.restore();
    // incoming page
    ctx.save();
    if (tr.type === 'fade') ctx.globalAlpha = q;
    if (tr.type === 'slide') ctx.translate(W * (1 - q), 0);
    if (tr.type === 'zoom') { ctx.globalAlpha = q; ctx.translate(W / 2, H / 2); ctx.scale(0.7 + 0.3 * q, 0.7 + 0.3 * q); ctx.translate(-W / 2, -H / 2); }
    if (tr.type === 'wipe') { ctx.beginPath(); ctx.rect(0, 0, W * q, H); ctx.clip(); }
    renderPage(ctx, page, design, scale, { time: local });
    ctx.restore();
    ctx.restore();
    return;
  }
  renderPage(ctx, page, design, scale, { time: local });
}

// Makes sure fonts, images and emoji are ready before the first frame.
export async function prepareDesign(design) {
  await loadFonts(design);
  await preloadImages(Object.values(design.assets || {}).filter((a) => a.kind !== 'audio').map((a) => a.src));
  await evaluateLottieAll(design);
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

function waitFor(cond, ms = 4000) {
  return new Promise((res) => {
    const t0 = performance.now();
    const tick = () => (cond() || performance.now() - t0 > ms ? res() : setTimeout(tick, 5));
    tick();
  });
}

async function decodeAudio(src) {
  const bin = atob(src.split(',')[1]);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    return await ctx.decodeAudioData(buf.buffer);
  } finally {
    ctx.close();
  }
}

// Planar float32 PCM for `frames` samples, looping the source to fill the video length.
function planarChunk(buffer, start, count, total) {
  const ch = Math.min(2, buffer.numberOfChannels);
  const out = new Float32Array(count * 2);
  const src = [buffer.getChannelData(0), buffer.getChannelData(ch > 1 ? 1 : 0)];
  const len = buffer.length;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < count; i++) {
      const idx = (start + i) % len;
      out[c * count + i] = src[c][idx];
    }
  }
  return out;
}

// opts: { format: 'mp4'|'webm'|'gif', fps, scale (0..1 of design size), audio: dataURL|null, onProgress(0..1) }
export async function exportVideo(design, opts) {
  const { format, onProgress = () => {} } = opts;
  const fps = opts.fps || (format === 'gif' ? 12 : 30);
  const total = totalDuration(design);
  const frames = Math.max(1, Math.round((total / 1000) * fps));
  await prepareDesign(design);

  if (format === 'gif') return exportGif(design, { fps, frames, scale: opts.scale, onProgress });

  if (!('VideoEncoder' in window)) throw new Error('این مرورگر خروجی ویدیو را پشتیبانی نمی‌کند');
  const w = even(design.width * opts.scale), h = even(design.height * opts.scale);
  const sx = w / design.width, sy = h / design.height;
  const isMp4 = format === 'mp4';
  // MP4 prefers H.264; browsers without an H.264 encoder fall back to VP9 inside MP4.
  let vCodec = isMp4 ? 'avc1.640028' : 'vp09.00.10.08';
  let mp4Video = 'avc';
  if (isMp4 && !(await VideoEncoder.isConfigSupported({ codec: vCodec, width: w, height: h, bitrate: 6e6, framerate: fps })).supported) {
    vCodec = 'vp09.00.10.08';
    mp4Video = 'vp9';
  }
  const vSupport = await VideoEncoder.isConfigSupported({ codec: vCodec, width: w, height: h, bitrate: 6e6, framerate: fps });
  if (!vSupport.supported) throw new Error('کدک ویدیو در این مرورگر در دسترس نیست');

  const { Muxer: Mp4Muxer, ArrayBufferTarget: Mp4Target } = isMp4 ? await import('../vendor/mp4-muxer.mjs') : {};
  const { Muxer: WebMMuxer, ArrayBufferTarget: WebMTarget } = isMp4 ? {} : await import('../vendor/webm-muxer.mjs');

  // audio (optional)
  let audioBuf = null;
  if (opts.audio) {
    try { audioBuf = await decodeAudio(opts.audio); } catch { audioBuf = null; }
  }
  const aCodec = isMp4 ? 'mp4a.40.2' : 'opus';
  let aOK = false;
  if (audioBuf && 'AudioEncoder' in window) {
    const sr = audioBuf.sampleRate;
    const s = await AudioEncoder.isConfigSupported({ codec: aCodec, sampleRate: sr, numberOfChannels: 2, bitrate: 128000 });
    aOK = s.supported;
  }

  const target = isMp4 ? new Mp4Target() : new WebMTarget();
  const muxer = isMp4
    ? new Mp4Muxer({
      target, fastStart: 'in-memory',
      video: { codec: mp4Video, width: w, height: h },
      ...(aOK ? { audio: { codec: 'aac', numberOfChannels: 2, sampleRate: audioBuf.sampleRate } } : {}),
    })
    : new WebMMuxer({
      target,
      video: { codec: 'V_VP9', width: w, height: h, frameRate: fps },
      ...(aOK ? { audio: { codec: 'A_OPUS', numberOfChannels: 2, sampleRate: audioBuf.sampleRate } } : {}),
    });

  let encErr = null;
  const vEnc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encErr = e; },
  });
  vEnc.configure({ codec: vCodec, width: w, height: h, bitrate: w * h * fps * 0.12, framerate: fps });

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const frameDur = 1e6 / fps;
  for (let i = 0; i < frames; i++) {
    if (encErr) throw encErr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    renderFrame(ctx, design, (i / fps) * 1000, 1);
    const vf = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
    vEnc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
    vf.close();
    if (vEnc.encodeQueueSize > 6) await waitFor(() => vEnc.encodeQueueSize <= 2, 60000);
    if (i % 5 === 0) { onProgress(i / frames * (aOK ? 0.8 : 1)); await new Promise((r) => setTimeout(r, 0)); }
  }
  await vEnc.flush();
  vEnc.close();

  if (aOK) {
    const sr = audioBuf.sampleRate;
    const aEnc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { encErr = e; },
    });
    aEnc.configure({ codec: aCodec, sampleRate: sr, numberOfChannels: 2, bitrate: 128000 });
    const totalSamples = Math.round((total / 1000) * sr);
    const CH = 1024;
    for (let s = 0; s < totalSamples; s += CH) {
      const n = Math.min(CH, totalSamples - s);
      const data = planarChunk(audioBuf, s, n, totalSamples);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((s / sr) * 1e6), data });
      aEnc.encode(ad);
      ad.close();
      if (aEnc.encodeQueueSize > 20) await waitFor(() => aEnc.encodeQueueSize <= 5, 60000);
    }
    await aEnc.flush();
    aEnc.close();
    onProgress(0.95);
  }
  if (encErr) throw encErr;
  muxer.finalize();
  onProgress(1);
  const mime = isMp4 ? 'video/mp4' : 'video/webm';
  return new File([target.buffer], (design.name || 'video') + '.' + (isMp4 ? 'mp4' : 'webm'), { type: mime });
}

async function exportGif(design, { fps, frames, scale, onProgress }) {
  const { GIFEncoder, quantize, applyPalette } = await import('../vendor/gifenc.mjs');
  const s = Math.min(scale || 1, 480 / Math.max(design.width, design.height));
  const w = even(design.width * s), h = even(design.height * s);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const gif = GIFEncoder();
  for (let i = 0; i < frames; i++) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(w / design.width, 0, 0, h / design.height, 0, 0);
    renderFrame(ctx, design, (i / fps) * 1000, 1);
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, w, h, { palette, delay: Math.round(1000 / fps) });
    onProgress(i / frames);
    if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  onProgress(1);
  return new File([gif.bytes()], (design.name || 'animation') + '.gif', { type: 'image/gif' });
}
