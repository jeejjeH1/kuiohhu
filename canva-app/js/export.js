// Export: PNG / JPG / multi-page PDF, then download or share.
import { pageToCanvas, loadFonts, preloadImages } from './renderer.js';

const enc = new TextEncoder();

function dataURLBytes(url) {
  const bin = atob(url.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Minimal PDF writer: one JPEG per page, page size = design size (px -> pt at 72dpi * 0.75).
export function buildPDF(pages) {
  const parts = [];
  let len = 0;
  const offsets = [];
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length;
  const pageIds = pages.map((_, i) => 3 + i * 3);
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => id + ' 0 R').join(' ')}] /Count ${n} >>`));
  pages.forEach((p, i) => {
    const pid = pageIds[i], cid = pid + 1, iid = pid + 2;
    const W = (p.w * 0.75).toFixed(2), H = (p.h * 0.75).toFixed(2);
    obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`));
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(cid, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(iid, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream');
    });
  });
  const total = 3 + n * 3;
  const xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

async function prepare(design) {
  await loadFonts(design);
  const srcs = Object.values(design.assets || {}).map((a) => a.src);
  await preloadImages(srcs);
}

// opts: { format: 'png'|'jpg'|'pdf', scale, quality, transparent, pages: [indices] }
export async function exportDesign(design, opts) {
  await prepare(design);
  const idx = opts.pages?.length ? opts.pages : design.pages.map((_, i) => i);
  const base = (design.name || 'design').replace(/[\\/:*?"<>|]/g, '_');
  if (opts.format === 'pdf') {
    const pages = idx.map((i) => {
      const c = pageToCanvas(design.pages[i], design, opts.scale);
      return { w: design.width, h: design.height, pxW: c.width, pxH: c.height, jpeg: dataURLBytes(c.toDataURL('image/jpeg', opts.quality ?? 0.92)) };
    });
    return [new File([buildPDF(pages)], base + '.pdf', { type: 'application/pdf' })];
  }
  const type = opts.format === 'jpg' ? 'image/jpeg' : 'image/png';
  const files = [];
  for (const i of idx) {
    const c = pageToCanvas(design.pages[i], design, opts.scale, { transparent: opts.format === 'png' && opts.transparent });
    const blob = await toBlob(c, type, opts.quality ?? 0.92);
    const suffix = idx.length > 1 ? `-${i + 1}` : '';
    files.push(new File([blob], `${base}${suffix}.${opts.format}`, { type }));
  }
  return files;
}

export function downloadFiles(files) {
  files.forEach((f, i) => setTimeout(() => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, i * 350));
}

export async function shareFiles(files, title) {
  if (navigator.canShare?.({ files })) {
    await navigator.share({ files, title });
    return true;
  }
  return false;
}
