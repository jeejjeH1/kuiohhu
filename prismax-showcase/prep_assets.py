"""Builds everything in assets/ from the raw uploads:
   - shots/sNN.jpg : phone screenshots with status bar, URL bar and nav bar cropped off
   - clip/fNNN.jpg : frames of the Ambassador Hall screen recording (cropped the same way)
   - logos.js      : vector paths for the Prisma(x) wordmark and the P(x) mark (traced)
Usage: python3 prep_assets.py <uploads_dir>   (needs pillow, numpy, scipy, potracer, ffmpeg)"""
import sys, os, json, subprocess
import numpy as np
from PIL import Image
from scipy import ndimage
import potrace

SRC = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(HERE, 'assets')
os.makedirs(f'{A}/shots', exist_ok=True); os.makedirs(f'{A}/clip', exist_ok=True)

# screenshots in the order of the post (None = the screen recording, site 12)
ORDER = ['dd41d018', '2d9ab902', '83548ed8', '58733453', 'a356ba5f', '390dd8f3', '684852a8', 'f6f6a768',
         '8beafdb2', '63920416', 'd5c6f87b', None, '10d191d9', 'c1e55488', '9cee7242']
TOP, BOTTOM = 264, 2272          # below the URL bar / above the Android nav bar (1080x2400 captures)
for i, key in enumerate(ORDER, 1):
    if not key:
        continue
    im = Image.open(f'{SRC}/{key}-image.jpg').convert('RGB')
    bottom = 2172 if key == 'c1e55488' else BOTTOM   # Nexus Hub: drop the "Edit with Lovable" badge
    im.crop((0, TOP, 1080, bottom)).save(f'{A}/shots/s{i:02d}.jpg', quality=90)

video = [f for f in os.listdir(SRC) if f.endswith('.mp4')][0]
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '0.2', '-t', '5.1', '-i', f'{SRC}/{video}',
                '-vf', f'crop=1080:{BOTTOM - TOP}:0:{TOP},scale=540:-1,fps=30', '-q:v', '4', f'{A}/clip/f%03d.jpg'], check=True)


def clean(mask):
    """Drop anything touching the border (background / transparent corners)."""
    lab, n = ndimage.label(mask)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    for b in border:
        mask[lab == b] = False
    return mask


def trace(alpha, up):
    a = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize(
        (alpha.shape[1] * up, alpha.shape[0] * up), Image.LANCZOS)).astype(float) / 255
    mask = clean(a > 0.5)
    ys, xs = np.where(mask)
    pad = 4 * up
    mask = mask[max(ys.min() - pad, 0):ys.max() + pad, max(xs.min() - pad, 0):xs.max() + pad]
    path = potrace.Bitmap(~mask).trace(  # potracer fills False pixels
        turdsize=10, alphamax=1.0, opticurve=True, opttolerance=0.2)
    d = []
    for c in path:
        s = c.start_point; d.append(f'M{s.x:.1f},{s.y:.1f}')
        for seg in c.segments:
            if seg.is_corner:
                d.append(f'L{seg.c.x:.1f},{seg.c.y:.1f}L{seg.end_point.x:.1f},{seg.end_point.y:.1f}')
            else:
                d.append(f'C{seg.c1.x:.1f},{seg.c1.y:.1f} {seg.c2.x:.1f},{seg.c2.y:.1f} {seg.end_point.x:.1f},{seg.end_point.y:.1f}')
        d.append('Z')
    return {'w': int(mask.shape[1]), 'h': int(mask.shape[0]), 'd': ''.join(d)}


# wordmark: white on dark in the Knowledge Center hero
L = np.asarray(Image.open(f'{SRC}/390dd8f3-image.jpg').convert('L').crop((250, 670, 830, 830))).astype(float)
bg = np.percentile(L, 30)
wm = trace(np.clip((L - bg - 8) / (245 - bg - 8), 0, 1), 3)
# P(x) mark: black on cream (the PNG has transparent rounded corners -> composite on cream first)
im = Image.open(f'{SRC}/36d50fbd-image.png').convert('RGBA')
flat = Image.new('RGBA', im.size, (223, 216, 208, 255)); flat.alpha_composite(im)
L = np.asarray(flat.convert('L')).astype(float)
cream = np.percentile(L, 90)
px = trace(np.clip((cream - 6 - L) / (cream - 16 - L.min()), 0, 1), 5)
with open(f'{A}/logos.js', 'w') as f:
    f.write('window.LOGOS = ' + json.dumps({'wm': wm, 'px': px}) + ';\n')
print('wordmark', wm['w'], wm['h'], '| mark', px['w'], px['h'])
