// "Make an image from this tweet": renders a styled card on a canvas for stories / channels.
(() => {
  const { XAL } = window;

  const SIZES = { story: [1080, 1920, 'استوری ۹:۱۶'], square: [1080, 1080, 'مربع ۱:۱'], post: [1080, 1350, 'پست ۴:۵'] };
  const THEMES = {
    aurora: { label: 'شفق', bg: ['#07060d'], blobs: ['#ff2e7e', '#a24bff', '#2ad4ff'], card: 'rgba(22,18,40,.82)', ink: '#f4f2ff', sub: '#a39dc4', line: 'rgba(255,255,255,.12)' },
    sunset: { label: 'غروب', bg: ['#ff5f6d', '#ffc371'], card: '#ffffff', ink: '#0f1419', sub: '#536471', line: 'rgba(0,0,0,.08)' },
    ocean: { label: 'اقیانوس', bg: ['#1c92d2', '#6dd5ed'], card: '#ffffff', ink: '#0f1419', sub: '#536471', line: 'rgba(0,0,0,.08)' },
    grape: { label: 'انگور', bg: ['#8e2de2', '#4a00e0'], card: 'rgba(15,10,35,.86)', ink: '#ffffff', sub: '#b9b0dd', line: 'rgba(255,255,255,.12)' },
    mint: { label: 'نعنا', bg: ['#0ba360', '#3cba92'], card: '#ffffff', ink: '#0f1419', sub: '#536471', line: 'rgba(0,0,0,.08)' },
    light: { label: 'روشن', bg: ['#eef0f4', '#dfe3ea'], card: '#ffffff', ink: '#0f1419', sub: '#536471', line: 'rgba(0,0,0,.08)' },
    dark: { label: 'تیره', bg: ['#000000', '#15181c'], card: '#16181c', ink: '#e7e9ea', sub: '#71767b', line: 'rgba(255,255,255,.1)' },
  };
  const FONT = 'XalVaz, TwitterChirp, "Segoe UI", sans-serif';

  const loadImg = async (url) => {
    if (!url) return null;
    const data = await XAL.fetchDataURL(url).catch(() => null);
    if (!data) return null;
    return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = data; });
  };

  function wrap(ctx, text, maxW) {
    const lines = [];
    for (const para of text.split('\n')) {
      if (!para.trim()) { lines.push(''); continue; }
      let line = '';
      for (const word of para.split(/\s+/)) {
        const tryLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(tryLine).width <= maxW) { line = tryLine; continue; }
        if (line) lines.push(line);
        if (ctx.measureText(word).width > maxW) { // very long token (URL): hard break
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width > maxW) { lines.push(chunk); chunk = ''; }
            chunk += ch;
          }
          line = chunk;
        } else line = word;
      }
      lines.push(line);
    }
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines;
  }

  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

  function render(canvas, info, imgs, opt) {
    const [W, H] = SIZES[opt.size];
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const th = THEMES[opt.theme];

    // background
    const g = ctx.createLinearGradient(0, 0, W, H);
    th.bg.forEach((c, i) => g.addColorStop(th.bg.length === 1 ? 0 : i / (th.bg.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (th.blobs) {
      [[W * 0.85, H * 0.12, th.blobs[0]], [W * 0.1, H * 0.88, th.blobs[1]], [W * 0.5, H * 0.55, th.blobs[2]]].forEach(([x, y, c], i) => {
        const rg = ctx.createRadialGradient(x, y, 0, x, y, W * (i === 2 ? 0.45 : 0.65));
        rg.addColorStop(0, `${c}aa`); rg.addColorStop(1, `${c}00`);
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      });
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.arc(W * 0.92, H * 0.06, W * 0.32, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(W * 0.04, H * 0.95, W * 0.26, 0, 7); ctx.fill();
    }

    const PAD = 80, IN = 64;
    const cw = W - PAD * 2, iw = cw - IN * 2;
    const rtl = XAL.isRtlText(info.text);
    // keep @mentions, #tags and links in one left-to-right piece inside Persian lines
    const text = rtl ? (info.text || ' ').replace(/[@#][\w\u0600-\u06FF]+|https?:\/\/\S+/g, (m) => `\u202A${m}\u202C`) : (info.text || ' ');

    // measure: header 120, text, photo, footer
    const photo = opt.photo ? imgs.photo : null;
    const maxCardH = H - PAD * 2 - (opt.mark ? 70 : 0);
    const maxFs = opt.size === 'story' ? 66 : 58;
    // Fit: prefer big text; shrink the photo before shrinking the text below 40px.
    let fs, lines, photoH = 0, fixedH, fits = false;
    const layout = (f, pScale) => {
      ctx.font = `500 ${f}px ${FONT}`;
      lines = wrap(ctx, text, iw);
      photoH = photo ? Math.min(iw * (photo.height / photo.width), maxCardH * pScale) : 0;
      fixedH = IN + 120 + 40 + (photo ? photoH + 40 : 0) + (opt.footer ? 90 : 0) + IN;
      return fixedH + lines.length * f * 1.6 <= maxCardH;
    };
    outer: for (const [minF, pScale] of [[40, 0.42], [40, 0.3], [34, 0.22], [28, 0.16]]) {
      for (fs = maxFs; fs >= minF; fs -= 2) if (layout(fs, pScale)) { fits = true; break outer; }
    }
    if (!fits) { fs = 28; layout(fs, 0.16); }
    const lh = fs * 1.6;
    const maxLines = Math.max(1, Math.floor((maxCardH - fixedH) / lh));
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += ' …'; }
    const ch = fixedH + lines.length * lh;
    const cx = PAD, cy = (H - ch - (opt.mark ? 70 : 0)) / 2;

    // card
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 30;
    rr(ctx, cx, cy, cw, ch, 56); ctx.fillStyle = th.card; ctx.fill();
    ctx.restore();
    rr(ctx, cx, cy, cw, ch, 56); ctx.strokeStyle = th.line; ctx.lineWidth = 2; ctx.stroke();

    // header (avatar on the reading side)
    const hy = cy + IN;
    const ax = rtl ? cx + cw - IN - 120 : cx + IN;
    ctx.save(); ctx.beginPath(); ctx.arc(ax + 60, hy + 60, 60, 0, 7); ctx.clip();
    if (imgs.avatar) ctx.drawImage(imgs.avatar, ax, hy, 120, 120);
    else { ctx.fillStyle = '#a24bff'; ctx.fillRect(ax, hy, 120, 120); }
    ctx.restore();
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    const tx = rtl ? ax - 32 : ax + 152;
    ctx.fillStyle = th.ink; ctx.font = `900 46px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    const name = info.name || info.handle;
    ctx.fillText(name, tx, hy + 54);
    if (info.verified) {
      const nw = ctx.measureText(name).width;
      const bx = rtl ? tx - nw - 30 : tx + nw + 30;
      ctx.fillStyle = '#1d9bf0'; ctx.beginPath(); ctx.arc(bx, hy + 38, 19, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(bx - 9, hy + 38); ctx.lineTo(bx - 2, hy + 46); ctx.lineTo(bx + 10, hy + 30); ctx.stroke();
    }
    ctx.fillStyle = th.sub; ctx.font = `500 34px ${FONT}`;
    ctx.direction = 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillText(`@${info.handle}`, tx, hy + 104);

    // text
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillStyle = th.ink; ctx.font = `500 ${fs}px ${FONT}`;
    let y = hy + 120 + 40 + fs;
    const lx = rtl ? cx + cw - IN : cx + IN;
    for (const l of lines) { ctx.fillText(l, lx, y); y += lh; }
    y = hy + 160 + lines.length * lh; // bottom of the text block

    // photo
    if (photo) {
      y += 10;
      ctx.save(); rr(ctx, cx + IN, y, iw, photoH, 32); ctx.clip();
      const s = Math.max(iw / photo.width, photoH / photo.height);
      ctx.drawImage(photo, cx + IN + (iw - photo.width * s) / 2, y + (photoH - photo.height * s) / 2, photo.width * s, photo.height * s);
      ctx.restore();
      y += photoH + 30;
    }

    // footer
    if (opt.footer) {
      ctx.fillStyle = th.line; ctx.fillRect(cx + IN, y, iw, 2);
      y += 62;
      ctx.font = `500 32px ${FONT}`; ctx.fillStyle = th.sub;
      ctx.direction = 'rtl'; ctx.textAlign = 'right';
      const d = info.time ? new Date(info.time) : null;
      const date = d ? d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
      const stats = [info.likes && `♥ ${XAL.fa(info.likes.toLocaleString('en'))}`, info.reposts && `⟲ ${XAL.fa(info.reposts.toLocaleString('en'))}`].filter(Boolean).join('   ');
      ctx.fillText([date, stats].filter(Boolean).join('   ·   '), cx + cw - IN, y);
      ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.font = `900 40px ${FONT}`; ctx.fillStyle = th.ink;
      ctx.fillText('𝕏', cx + IN, y + 4);
    }

    if (opt.mark) {
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.font = `500 28px ${FONT}`;
      ctx.fillStyle = th.blobs || th.card !== '#ffffff' ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.8)';
      ctx.fillText('ساخته‌شده با X Auto Liker', W / 2, H - PAD + 10);
    }
  }

  XAL.openCard = async (info) => {
    const saved = (await chrome.storage.local.get('cardOpts')).cardOpts || {};
    const opt = { size: 'story', theme: 'aurora', photo: true, footer: true, mark: true, ...saved };
    const { body, modal } = XAL.modal({ title: '✨ ساخت عکس از توییت', wide: true });
    modal.style.width = 'min(880px, calc(100vw - 32px))';
    body.innerHTML = `
      <div style="display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:280px;display:grid;place-items:center;padding:14px;border-radius:18px;background:rgba(0,0,0,.35);min-height:300px">
          <canvas id="cv" style="max-width:100%;max-height:min(560px, calc(100vh - 200px));border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.5)"></canvas>
        </div>
        <div style="width:290px;display:flex;flex-direction:column;gap:16px">
          <div><div class="muted" style="margin-bottom:6px">اندازه</div><div class="row" id="sizes">${Object.entries(SIZES).map(([k, v]) => `<span class="chip" data-k="${k}">${v[2]}</span>`).join('')}</div></div>
          <div><div class="muted" style="margin-bottom:6px">رنگ</div><div class="row" id="themes">${Object.entries(THEMES).map(([k, t]) => `<span class="chip" data-k="${k}" title="${t.label}" style="padding:0;width:34px;height:34px;border-radius:12px;background:linear-gradient(135deg,${(t.blobs || t.bg).join(',')})"></span>`).join('')}</div></div>
          <div class="row" id="opts">
            <span class="chip" data-k="photo">🖼 عکس توییت</span><span class="chip" data-k="footer">📅 تاریخ و آمار</span><span class="chip" data-k="mark">🏷 امضا</span>
          </div>
          <div class="row" style="margin-top:4px"><button class="btn" id="dl" style="flex:1">⬇ دانلود PNG</button><button class="btn ghost" id="cp">کپی</button></div>
          <div class="muted" id="st" style="font-size:12px">در حال آماده‌سازی…</div>
        </div>
      </div>`;
    const cv = body.querySelector('#cv');
    const imgs = { avatar: null, photo: null };
    const paint = () => {
      body.querySelectorAll('#sizes .chip').forEach((c) => c.classList.toggle('on', c.dataset.k === opt.size));
      body.querySelectorAll('#themes .chip').forEach((c) => { c.classList.toggle('on', c.dataset.k === opt.theme); c.style.outline = c.dataset.k === opt.theme ? '3px solid #fff' : 'none'; });
      body.querySelectorAll('#opts .chip').forEach((c) => c.classList.toggle('on', !!opt[c.dataset.k]));
      render(cv, info, imgs, opt);
      chrome.storage.local.set({ cardOpts: opt });
    };
    body.querySelectorAll('#sizes .chip').forEach((c) => c.addEventListener('click', () => { opt.size = c.dataset.k; paint(); }));
    body.querySelectorAll('#themes .chip').forEach((c) => c.addEventListener('click', () => { opt.theme = c.dataset.k; paint(); }));
    body.querySelectorAll('#opts .chip').forEach((c) => c.addEventListener('click', () => { opt[c.dataset.k] = !opt[c.dataset.k]; paint(); }));
    body.querySelector('#dl').addEventListener('click', () => {
      cv.toBlob((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = `tweet_${info.handle}_${info.id}.png`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    });
    body.querySelector('#cp').addEventListener('click', () => cv.toBlob(async (b) => {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); XAL.toast('عکس کپی شد ✓'); } catch { XAL.toast('کپی نشد؛ از دانلود استفاده کنید'); }
    }, 'image/png'));

    await XAL.fontsReady;
    paint();
    const [avatar, photo] = await Promise.all([
      loadImg(info.avatar.replace(/_(normal|bigger|x96|200x200)\./, '_400x400.')),
      loadImg(info.photos[0] ? info.photos[0].replace(/name=\w+/, 'name=large') : ''),
    ]);
    imgs.avatar = avatar; imgs.photo = photo;
    paint();
    body.querySelector('#st').textContent = 'آماده ✓ — اندازه و رنگ را عوض کنید';
  };
})();
