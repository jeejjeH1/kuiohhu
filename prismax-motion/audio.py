"""Procedural cinematic score + SFX + voiceover mix for the PrismaX motion piece.
Synced to timeline.json / vo/words.json. Writes out/audio.wav (48 kHz stereo).
Needs numpy, scipy, soundfile."""
import json, os
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(f"{HERE}/timeline.json"))
WORDS = json.load(open(f"{HERE}/vo/words.json"))
VO = TL['vo']
SR = 48000
T = float(TL['duration'])
N = int(SR * T)
rng = np.random.default_rng(7)

music = np.zeros((2, N))     # ducked under the voice
sfxb = np.zeros((2, N))      # sound design, lightly ducked
send = np.zeros((2, N))      # reverb send


def w(i, k):
    return VO[i] + WORDS[i][min(k, len(WORDS[i]) - 1)]['s']


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def place(buf, t0, sig, gain=1.0, pan=0.0):
    i0 = int(round(t0 * SR))
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    if i0 < 0:
        sig = sig[:, -i0:]; i0 = 0
    n = min(sig.shape[1], N - i0)
    if n > 0:
        buf[:, i0:i0 + n] += sig[:, :n] * gain


def filt(x, kind, f, order=2):
    if kind == 'bp':
        sos = butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], btype='band', output='sos')
    else:
        sos = butter(order, f / (SR / 2), btype=kind, output='sos')
    return sosfilt(sos, x, axis=-1)


def sweep_lp(x, f0, f1, curve=1.0):
    """Cheap time-varying lowpass: crossfade a bank of fixed filters."""
    n = x.shape[-1]
    fs = np.geomspace(max(f0, 30), max(f1, 30), 8) if f0 < f1 else np.geomspace(max(f0, 30), max(f1, 30), 8)
    bank = [filt(x, 'lp', min(f, SR / 2.2)) for f in fs]
    pos = np.linspace(0, 1, n) ** curve * (len(fs) - 1)
    out = np.zeros_like(x)
    for k in range(len(fs)):
        wgt = np.clip(1 - np.abs(pos - k), 0, 1)
        out += bank[k] * wgt
    return out


def saw(freq, n, phase=0.0):
    ph = (phase + np.cumsum(np.full(n, freq) if np.isscalar(freq) else freq) / SR) % 1.0
    return 2 * ph - 1


def env(n, a, r, shape=1.0):
    t = tt(n); d = n / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.clip((d - t) / max(r, 1e-4), 0, 1) ** shape
    return e


# ============================================================ instruments
def sub_boom(size=1.0, f0=110, f1=30, dec=1.2):
    n = int(3.5 * SR); t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / dec) * size


def impact(size=1.0):
    n = int(4 * SR); t = tt(n)
    f = 30 + 100 * np.exp(-t / 0.07)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (1.1 * size))
    nz = filt(rng.standard_normal(n), 'lp', 1800) * np.exp(-t / 0.25)
    crack = filt(rng.standard_normal(n), 'hp', 2500) * np.exp(-t / 0.035) * 0.6
    return np.tanh((sub * 1.3 + nz * 0.6 + crack) * 1.4) * 0.7 * size


def braam(root, dur=4.0, amp=0.5, bright=2600):
    n = int(dur * SR); t = tt(n)
    s = np.zeros(n)
    for m, g in ((root - 12, 1.0), (root, .8), (root + 7, .55), (root + 12, .35)):
        for det in (-.12, 0, .1):
            s += saw(mtof(m + det), n, rng.random()) * g
    s = np.tanh(s * .6)
    e = np.minimum(1, t / .06) * np.exp(-t / (dur * .45))
    fc = 180 + bright * np.exp(-t / .5) * np.minimum(1, t / .05)
    # approximate the opening/closing filter with a fixed bank crossfade on the envelope
    lo, hi = filt(s, 'lp', 220), filt(s, 'lp', bright)
    mix = np.clip((fc - 180) / bright, 0, 1)
    return (lo * (1 - mix) + hi * mix) * e * amp


def drone(m, dur, amp=0.15, cut=600):
    n = int(dur * SR)
    s = np.zeros(n)
    for det in (-.08, 0, .07):
        s += saw(mtof(m + det), n, rng.random())
    s += 1.2 * np.sin(2 * np.pi * mtof(m - 12) * tt(n))
    s = filt(s, 'lp', cut)
    return s * env(n, 1.5, 1.5) * amp


def pad(notes, dur, amp=0.07, cut=1800, a=0.8, r=1.2):
    n = int(dur * SR)
    out = np.zeros((2, n))
    for k, m in enumerate(notes):
        for det, pan in ((-.1, -.6), (.09, .6), (0, 0)):
            s = saw(mtof(m + det), n, rng.random())
            s = filt(s, 'lp', cut)
            g = (pan + 1) * np.pi / 4
            out[0] += s * np.cos(g); out[1] += s * np.sin(g)
    return out * env(n, a, r) * amp


def choir(notes, dur, amp=0.06):
    n = int(dur * SR)
    s = np.zeros(n)
    for m in notes:
        for det in (-.15, .0, .14):
            vib = 1 + .004 * np.sin(2 * np.pi * 5.2 * tt(n) + rng.random() * 6)
            s += saw(mtof(m + det) * vib, n, rng.random())
    f = sum(filt(s, 'bp', (fc * .85, fc * 1.15)) * g for fc, g in ((700, 1), (1150, .7), (2600, .25)))
    return f * env(n, 1.2, 1.5) * amp


def piano(m, dur=3.0, amp=0.16):
    n = int(dur * SR); t = tt(n); f = mtof(m)
    s = np.zeros(n)
    for h, g, d in ((1, 1, 1.6), (2, .45, .9), (3, .22, .6), (4, .12, .4), (5, .06, .3)):
        s += np.sin(2 * np.pi * f * h * (1 + .0004 * h * h) * t) * g * np.exp(-t / d)
    s += filt(rng.standard_normal(n), 'bp', (f * 2, min(f * 8, 18000))) * np.exp(-t / .01) * .15
    return s * np.minimum(1, t / .003) * amp


def bell(m, dur=3.0, amp=0.12):
    n = int(dur * SR); t = tt(n); f = mtof(m)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.0 * np.exp(-t / .5)
    s = np.sin(2 * np.pi * f * t + mod) * np.exp(-t / 1.1) + .3 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / .5)
    return s * np.minimum(1, t / .002) * amp


_pl = {}
def pluck(m, amp=0.12, dec=0.18, cut=3500):
    key = (m, dec, cut)
    if key not in _pl:
        n = int(.5 * SR); t = tt(n)
        s = saw(mtof(m), n) * .6 + np.sin(2 * np.pi * mtof(m) * t) * .6
        s = filt(s, 'lp', cut) * np.exp(-t / dec) * np.minimum(1, t / .002)
        _pl[key] = s
    return _pl[key] * amp


def string_stab(m, dur=.22, amp=.1):
    n = int(dur * SR); t = tt(n)
    s = sum(saw(mtof(m + d), n, rng.random()) for d in (-.06, .05))
    s = filt(s, 'lp', 2400)
    return s * np.minimum(1, t / .008) * np.exp(-t / (dur * .45)) * amp


def kick(g=1.0):
    n = int(.5 * SR); t = tt(n)
    f = 42 + 100 * np.exp(-t / .03)
    b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .3)
    c = filt(rng.standard_normal(n), 'hp', 2500) * np.exp(-t / .004) * .25
    return np.tanh((b + c) * 1.6) * g


def taiko(g=1.0):
    n = int(1.2 * SR); t = tt(n)
    f = 60 + 70 * np.exp(-t / .04)
    b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .35)
    sk = filt(rng.standard_normal(n), 'bp', (150, 900)) * np.exp(-t / .06) * .6
    return np.tanh((b + sk) * 1.5) * g


def hat(op=False, g=.3):
    n = int((.22 if op else .06) * SR); t = tt(n)
    return filt(rng.standard_normal(n), 'hp', 7500) * np.exp(-t / (.06 if op else .015)) * g


def tick(f=3000, amp=.08):
    n = int(.025 * SR); t = tt(n)
    return np.sin(2 * np.pi * f * t) * np.exp(-t / .005) * amp


def click(amp=.3):
    n = int(.05 * SR); t = tt(n)
    return (filt(rng.standard_normal(n), 'bp', (1500, 6000)) * np.exp(-t / .003) + np.sin(2 * np.pi * 900 * t) * np.exp(-t / .01) * .4) * amp


def pop(f=900, amp=.2):
    n = int(.12 * SR); t = tt(n)
    ff = f * (1 + .8 * np.exp(-t / .012))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / .045) * amp


def whoosh(dur=.9, lo=300, hi=5000, amp=.4):
    n = int(dur * SR); x = np.linspace(0, 1, n)
    nz = rng.standard_normal(n)
    b = np.sin(np.pi * x) ** 2
    s = sweep_lp(filt(nz, 'hp', lo), lo * 2, hi, 1.0) * b
    s = s * (1 - .7 * x) + sweep_lp(filt(nz[::-1], 'hp', lo), hi, lo * 2) * b * .7 * x
    pan = np.linspace(-.8, .8, n); a = (pan + 1) * np.pi / 4
    return np.stack([s * np.cos(a), s * np.sin(a)]) * np.sqrt(2) * amp


def riser(dur, amp=.35, f0=200, f1=7000, tone=110):
    n = int(dur * SR); x = np.linspace(0, 1, n)
    nz = sweep_lp(filt(rng.standard_normal(n), 'hp', f0), f0 * 2, f1, 1.5)
    tf = tone * 2 ** (x ** 1.6 * 3)
    tn = np.sin(2 * np.pi * np.cumsum(tf) / SR) * .3 + saw(tf * 1.006, n) * .08
    return (nz * .8 + tn) * x ** 2.3 * amp


def reverse_cymbal(dur=1.2, amp=.35):
    n = int(dur * SR); t = tt(n)
    s = filt(rng.standard_normal(n), 'hp', 4000) * np.exp(-t / .5)
    return s[::-1] * amp


def glitch(dur=.25, amp=.22):
    n = int(dur * SR); s = np.zeros(n); i = 0
    while i < n:
        seg = int(rng.uniform(.006, .03) * SR); m = min(seg, n - i); ts = tt(m)
        k = rng.integers(3)
        s[i:i + m] = (np.sign(np.sin(2 * np.pi * rng.uniform(150, 2500) * ts)) * .5 if k == 0 else rng.standard_normal(m) * .6 if k == 1 else 0)
        i += seg
    return np.round(s * 6) / 6 * amp


def shimmer(dur=1.4, amp=.1, base=88):
    n = int(dur * SR); t = tt(n); x = t / dur
    s = sum(np.sin(2 * np.pi * mtof(m) * t + rng.random() * 6) * (.5 + .5 * np.sin(2 * np.pi * rng.uniform(5, 11) * t)) for m in (base, base + 5, base + 7, base + 12))
    return (s * .25 + filt(rng.standard_normal(n), 'hp', 9000) * .5) * np.sin(np.pi * x) ** 2 * amp


def servo(dur=.6, f0=500, f1=900, amp=.05):
    n = int(dur * SR); x = np.linspace(0, 1, n)
    f = f0 + (f1 - f0) * np.sin(np.pi * x)
    s = saw(f, n) * .3 + np.sin(2 * np.pi * np.cumsum(f * 2) / SR) * .3
    s = filt(s, 'bp', (300, 3000))
    return s * np.sin(np.pi * x) ** .8 * amp


def thud(amp=.4):
    n = int(.35 * SR); t = tt(n)
    f = 90 + 120 * np.exp(-t / .015)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .07) + filt(rng.standard_normal(n), 'bp', (400, 2500)) * np.exp(-t / .012) * .5) * amp


def scrape(dur, amp=.08):
    n = int(dur * SR); t = tt(n)
    s = filt(rng.standard_normal(n), 'bp', (600, 2400)) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 23 * t)))
    return s * env(n, .15, .3) * amp


def chime(ok=True, amp=.1):
    if ok:
        a = bell(88, .6, amp); b = np.pad(bell(95, .5, amp * .8), (int(.07 * SR), int(.2 * SR)))[:len(a)]
        return a + b
    n = int(.3 * SR); t = tt(n)
    return filt(np.sign(np.sin(2 * np.pi * 140 * t)), 'lp', 1200) * np.exp(-t / .1) * amp * .6


def M(t0, sig, g=1.0, pan=0.0, rev=.3):
    place(music, t0, sig, g, pan); place(send, t0, sig, g * rev, pan)


def X(t0, sig, g=1.0, pan=0.0, rev=.25):
    place(sfxb, t0, sig, g, pan); place(send, t0, sig, g * rev, pan)


# ============================================================ (01) the question 0–9
D = 38   # D2
M(0.0, drone(D - 12, 6.7, .22, 300), rev=.2)
M(0.0, drone(D + 7 - 12, 6.7, .08, 500), rev=.3)
M(0.8, pad([D + 12, D + 15, D + 19], 6.0, .045, 900, 2.5, .3), rev=.6)
X(0.0, sub_boom(.5, 80, 28, 2.0), rev=.4)
# data particles: soft ticks whose density follows the spawn curve
for i in range(520):
    ts = .25 + 6.0 * rng.random() ** .55
    if ts < 6.6:
        X(ts, tick(2000 + rng.random() * 4000, .02 + .03 * rng.random()), pan=rng.uniform(-.9, .9), rev=.35)
X(3.6, riser(3.0, .28, 300, 6000, 70), rev=.4)
# the hook: the big counter rattles, accelerating, then flies away
tk = 0.06
while tk < 2.05:
    X(tk, tick(1800 + 1400 * tk / 2.05, .045 + .03 * tk / 2.05), pan=rng.uniform(-.25, .25), rev=.1)
    tk += max(.022, .11 * (1 - tk / 2.05) ** 1.5)
X(0.0, impact(.55), rev=.5)
X(1.9, whoosh(.6, 200, 3500, .3), rev=.3)
# hard cut to silence at 6.65, then the hit on "Not"
cut = np.ones(N); i0, i1 = int(6.6 * SR), int(6.68 * SR)
cut[i0:i1] = np.linspace(1, 0, i1 - i0); cut[i1:int(7.0 * SR)] = 0
music *= cut; sfxb *= cut; send *= cut
X(VO['q2'], impact(1.1), rev=.6)
M(VO['q2'], braam(D, 4.5, .42, 2200), rev=.6)
X(VO['q2'], glitch(.3, .2), pan=.2)
X(w('q2', 1), glitch(.15, .12), pan=-.3)
M(7.4, drone(D - 12, 2.2, .14, 260), rev=.3)
X(8.3, shimmer(.9, .12, 86), rev=.6)
X(8.45, riser(.6, .2, 800, 9000, 300), rev=.3)

# ============================================================ (02) quantity 9–24.9
BPM = 120; B = 60 / BPM
X(9.0, whoosh(1.0, 200, 4000, .35))
X(9.05, sub_boom(.55, 100, 30, 1.0), rev=.3)
M(9.0, drone(D - 12, 15.6, .14, 380), rev=.25)
M(9.0, pad([D + 12, D + 17, D + 22], 9.3, .03, 1200, 1.5, 1.0), rev=.6)


# arm phase (same profile as js/scene3d.js) -> one mechanical tick per quarter cycle
def phase_profile():
    dt = 1 / 240; s = .62; ts, ss = [], []
    t = 9.0
    def sp1(t):
        if t < 10.4: return .42
        if t < 12.6:
            x = (t - 10.4) / 2.2; x = 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2
            return .42 + (3.8 - .42) * x
        x = min(1, (t - 12.6) / 1.0); return 3.8 + (.42 - 3.8) * (1 - (1 - x) ** 3)
    while t <= 13.6 + 1e-9:
        ts.append(t); ss.append(s); s += sp1(t) * dt; t += dt
    sA = s; n = int(np.ceil(sA + .42 * 3.45)); n += n % 2
    c = (n + .30 - sA) / (17.05 - 13.6)
    t = 13.6 + dt
    while t <= 25:
        s += (c if t < 17.05 else .42) * dt; ts.append(t); ss.append(s); t += dt
    return np.array(ts), np.array(ss)


pt, ps = phase_profile()
q = np.floor(ps * 4)
for k in np.nonzero(np.diff(q))[0]:
    tk = pt[k + 1]
    if tk < 18.3:
        X(tk, click(.08 if tk < 14.2 else .06), pan=.3, rev=.15)
cyc = np.nonzero(np.diff(np.floor(ps)))[0]
for k in cyc:
    tk = pt[k + 1]
    if tk < 18.3: X(tk, servo(.5 if tk < 10.4 else .25, 400, 1100, .05), pan=.25, rev=.2)
# ostinato: string stabs, 16ths, D minor, intensity rises with the time-lapse
OST = [D + 12, D + 15, D + 19, D + 24, D + 19, D + 15, D + 12, D + 19]
for i, tb in enumerate(np.arange(9.6, 14.1, B / 4)):
    g = .05 + .07 * np.clip((tb - 9.6) / 4, 0, 1)
    M(tb, string_stab(OST[i % 8], .2, g), pan=(-.4 if i % 2 else .4), rev=.25)
for tb in np.arange(10.6, 14.1, B):
    M(tb, kick(.5 + .3 * np.clip((tb - 10.6) / 3, 0, 1)), rev=.05)
X(12.2, riser(1.9, .2, 400, 8000, 150), rev=.3)
# "But the data is full of" — darker, dissonant
X(VO['r2'], impact(.6), rev=.5)
M(VO['r2'], braam(D - 1, 3.5, .22, 1200), rev=.5)
M(14.2, pad([D + 12, D + 13, D + 18], 6.0, .035, 900, .4, 1.0), rev=.6)
for tb in np.arange(14.2, 18.3, B):
    M(tb, kick(.55), rev=.05)
    M(tb + B / 2, hat(False, .12), pan=.3)
for i, tb in enumerate(np.arange(14.2, 18.3, B / 4)):
    M(tb, string_stab([D + 12, D + 13, D + 17, D + 13][i % 4], .18, .055), pan=(-.3 if i % 2 else .3), rev=.2)
X(w('r2', 6), glitch(.35, .2), pan=.4)            # incorrect movements
for k in range(5): X(w('r2', 6) + .05 + k * .09, servo(.25, 300 + k * 90, 1400, .04), pan=rng.uniform(-.7, .7))
X(17.05, glitch(.18, .16), pan=-.2)                 # grasp slips
for tc, a in ((17.2, .45), (17.37, .18), (17.6, .06)): X(tc, thud(a), pan=-.15, rev=.2)
# repetitive: the grid reveal — stutter loop of the same bar
X(18.3, whoosh(1.6, 150, 3000, .4), rev=.4)
M(18.3, choir([D + 12, D + 19, D + 24], 2.8, .05), rev=.7)
for tb in np.arange(18.5, 20.6, B / 2):
    M(tb, string_stab(D + 12, .15, .06), pan=-.3); M(tb + B / 4, string_stab(D + 13, .15, .05), pan=.3)
    M(tb, kick(.5), rev=.05)
for k in range(8): X(18.6 + k * .25, tick(2400, .05), pan=-.5 + k * .14)
# "More data ≠ better learning" — the floor drops out
X(VO['r3'], sub_boom(.7, 90, 30, 1.6), rev=.4)
M(VO['r3'], pad([D, D + 7, D + 12], 3.6, .04, 500, .2, .8), rev=.5)
for tb in np.arange(20.8, 23.6, B * 2): M(tb, kick(.35), rev=.05)
n_ = int(2.6 * SR); f_ = np.geomspace(200, 1600, n_)
X(21.0, np.sin(2 * np.pi * np.cumsum(f_) / SR) * np.sin(np.pi * np.linspace(0, 1, n_)) * .03, pan=.3, rev=.4)
X(23.6, riser(1.3, .42, 300, 12000, 110), rev=.5)
X(23.9, reverse_cymbal(1.0, .3), rev=.4)

# ============================================================ (03) quality 24.9–35
X(24.9, impact(.45), rev=.7)
X(24.9, shimmer(1.6, .14, 91), rev=.8)
F = 41   # F2 — the lift into major
PROG = [[F + 12, F + 16, F + 19], [F + 17, F + 21, F + 24], [F + 14, F + 17, F + 21], [F + 19, F + 23, F + 26]]   # F  Bb  Dm  C
ROOTS = [F, F + 5, F - 3, F + 7]
for k, tb in enumerate(np.arange(24.9, 35.0, B * 4)):
    ch = PROG[k % 4]
    M(tb, pad(ch, B * 4 + .6, .04, 2200, .3, .6), rev=.6)
    M(tb, drone(ROOTS[k % 4], B * 4 + .4, .08, 300), rev=.2)
    for j in range(8):
        tn = tb + j * B / 2
        if tn >= 34.9: break
        m = ch[[0, 1, 2, 1, 0, 2, 1, 2][j]] + 12
        M(tn, piano(m, 1.6, .07 if tb < 29 else .085), pan=(-.35 if j % 2 else .35), rev=.45)
for tb in np.arange(29.0, 34.8, B):
    M(tb, kick(.45), rev=.05)
    M(tb + B / 2, hat(True, .1), pan=.2)
for i in (0, 1, 3): X(w('g1', i), pop(700 + i * 120, .16), rev=.4)
X(26.68, click(.25), rev=.3); X(26.7, bell(93, 1.2, .05), rev=.6)
for i in range(5): X(26.05 + i * .13, pop(500 + i * 90, .1), pan=-.6 + i * .3)
for i in range(8): X(w('g2', 4) + i * .11, pop(800 + i * 60, .12), pan=-.7 + i * .2, rev=.3)
X(30.2, servo(.6, 500, 900, .04), pan=.4); X(31.2, servo(.6, 450, 950, .04), pan=.4)
X(31.27, thud(.15), pan=.3)
X(32.4, whoosh(.6, 600, 7000, .2))
X(32.45, glitch(.12, .08))
X(34.15, chime(True, .09), pan=.3, rev=.6)
X(34.55, whoosh(.5, 300, 4000, .35))

# ============================================================ (04) the physical world 35–47.4
X(35.0, sub_boom(.8, 70, 26, 2.0), rev=.6)
M(35.0, drone(D - 12, 12.4, .17, 300), rev=.3)
M(35.0, choir([D + 12, D + 17, D + 21], 6.5, .035), rev=.8)
M(35.2, pad([D + 24, D + 27, D + 31], 6.0, .02, 3000, 2.0, 2.0), rev=.8)
for tb in np.arange(35.0, 43.4, 1.0):
    M(tb, kick(.5), rev=.1); M(tb + .28, kick(.25), rev=.1)    # heartbeat
X(35.2, servo(1.5, 250, 400, .035), pan=.2, rev=.3)
X(36.7, servo(.8, 600, 1500, .05), pan=.2); X(37.45, thud(.25), pan=.2, rev=.3); X(37.45, click(.2))
X(38.35, servo(.5, 500, 800, .04))
X(38.6, scrape(2.5, .07), pan=.1, rev=.2)
X(38.62, thud(.3), rev=.2)
M(38.4, pad([D + 12, D + 15, D + 19, D + 24], 5.0, .03, 1500, 1.0, 1.0), rev=.6)
X(41.4, servo(.7, 500, 1300, .05), pan=-.2); X(41.75, click(.2)); X(42.5, servo(.6, 700, 1600, .04), pan=.3); X(43.1, thud(.2))
# environment montage — a hit + shutter on every cut, toms building
for i in range(6):
    tc = 43.4 + i * .5
    X(tc, taiko(.5 + i * .06), rev=.4); X(tc, click(.35), pan=.5 - i * .2)
    X(tc, glitch(.06, .07))
    M(tc, string_stab([D + 12, D + 15, D + 17, D + 19, D + 20, D + 22][i], .4, .08), rev=.4)
    if i % 2: X(tc + .25, taiko(.3), rev=.3)
for tb in np.arange(44.4, 46.3, B / 2): X(tb, taiko(.22 + .25 * (tb - 44.4) / 2), rev=.3)
M(43.4, braam(D, 3.0, .12, 900), rev=.6)
X(45.6, riser(1.75, .5, 200, 14000, 80), rev=.5)
X(46.1, reverse_cymbal(1.25, .42), rev=.5)
cut = np.ones(N); i0, i1 = int(47.3 * SR), int(47.36 * SR)
cut[i0:i1] = np.linspace(1, 0, i1 - i0); cut[i1:int(47.4 * SR)] = 0
music *= cut; sfxb *= cut; send *= cut

# ============================================================ (05) PrismaX 47.4–56.9
X(47.4, impact(1.35), rev=.8)
X(47.4, sub_boom(1.0, 120, 26, 2.5), rev=.5)
M(47.4, braam(D, 5.5, .5, 3200), rev=.8)
M(47.4, choir([D + 12, D + 19, D + 24, D + 28], 4.5, .05), rev=.9)
X(47.55, shimmer(1.2, .16, 91), rev=.8)
for k in range(5): X(47.85 + k * .07, bell(86 + [0, 3, 7, 10, 12][k], 2.0, .04), pan=-.6 + k * .3, rev=.8)
X(48.1, riser(.25, .15, 2000, 12000, 400))
X(w('x1', 3), impact(.55), rev=.7)
for m in (62, 66, 69, 74, 78): X(w('x1', 3), bell(m + 12, 4.0, .05), rev=.9)       # D major bloom on the wordmark
M(w('x1', 3), pad([D + 24, D + 28, D + 31, D + 36], 3.2, .04, 3500, .1, 1.5), rev=.8)
X(48.7, shimmer(1.5, .12, 93), rev=.8)
X(50.0, whoosh(.85, 200, 6000, .38), rev=.3)
X(50.72, pop(520, .12), rev=.4)
# pipeline: bright pulse in D major
PIPE = [[D + 24, D + 28, D + 31], [D + 19, D + 23, D + 26], [D + 21, D + 24, D + 28], [D + 26, D + 31, D + 33]]   # D  G  Bm  ... (G/D colour)
PR = [D, D - 5, D - 1, D + 5]
for k, tb in enumerate(np.arange(50.4, 56.9, B * 2)):
    ch = PIPE[k % 4]
    M(tb, pad(ch, B * 2 + .4, .035, 2400, .2, .5), rev=.5)
    for j in range(8):
        tn = tb + j * B / 4
        if tn >= 56.6: break
        M(tn, pluck(ch[j % 3] + 12, .07, .16), pan=(-.4 if j % 2 else .4), rev=.35)
    M(tb, drone(PR[k % 4], B * 2 + .2, .07, 260), rev=.1)
for tb in np.arange(50.4, 56.6, B):
    M(tb, kick(.55), rev=.05); M(tb + B / 2, hat(True, .1), pan=.25)
for tb in np.arange(51.4, 56.6, B * 2): M(tb + B, hat(True, .16), rev=.3)
# gate verdicts
ACCEPT = [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0]
for i, a in enumerate(ACCEPT):
    tg = 50.65 + i * .3 + 1.55
    if tg < 56.4 and tg > w('x2', 2): X(tg, chime(bool(a), .06 if a else .1), pan=0.0, rev=.35)
for k, i in enumerate((0, 2, 7)): X(w('x2', i), pop(600 + k * 200, .14), rev=.4)
X(w('x2', 12), shimmer(1.0, .08, 95), rev=.6)
X(56.45, whoosh(.6, 300, 5000, .3))

# ============================================================ (06) balance 56.9–70.9
M(56.9, pad([D + 12, D + 17, D + 21], 4.0, .035, 1500, .3, 1.2), rev=.7)       # Dm hush
M(57.0, piano(D + 24, 2.5, .09), rev=.6); M(57.6, piano(D + 29, 2.5, .07), rev=.6); M(58.2, piano(D + 27, 2.5, .07), rev=.6)
X(56.9, sub_boom(.35, 80, 30, 1.2), rev=.5)
# the grid spreads: a cascade of tiny pops
for k in range(40): X(w('b2', 3) + k * .02 + rng.random() * .02, pop(900 + rng.random() * 900, .04), pan=rng.uniform(-.9, .9), rev=.3)
X(w('b2', 6), shimmer(1.2, .1, 90), rev=.6)
for k in range(24): X(w('b2', 9) + k * .045, tick(2500 + k * 80, .035), pan=-.8 + k * .07, rev=.3)
for k, tb in enumerate(np.arange(59.6, 66.0, B * 2)):
    ch = PROG[k % 4]
    M(tb, pad([m + 2 - 12 + 12 for m in ch], B * 2 + .4, .035, 2000, .3, .5), rev=.6)
    for j in range(4):
        M(tb + j * B / 2, piano(ch[(j * 2) % 3] + 14, 1.4, .06), pan=(-.3 if j % 2 else .3), rev=.5)
for tb in np.arange(60.6, 65.9, B): M(tb, kick(.4), rev=.05)
# "The real challenge is balance" — three vertex hits, then the resolve
X(VO['b3'] - .3, whoosh(.6, 200, 3000, .25))
M(66.0, drone(D - 12, 4.9, .12, 300), rev=.3)
M(66.0, pad([D + 12, D + 19, D + 24], 4.6, .03, 1200, .8, 1.0), rev=.7)
X(w('b3', 4), impact(.4), rev=.6)
tq = w('b3', 5); tn = max(w('b3', 6), tq + .45); td = w('b3', 7)
for k, tv in enumerate((tq, tn, td)):
    X(tv, taiko(.5), rev=.5); X(tv, bell([74, 79, 81][k] + 12, 2.0, .06), rev=.8)
for m in (62, 66, 69, 74): X(70.0, bell(m + 12, 3.0, .045), rev=.9)
X(70.0, shimmer(1.2, .1, 93), rev=.8)
X(70.45, whoosh(.6, 200, 3000, .25))

# ============================================================ (07) the future 70.9–81
X(70.9, sub_boom(.8, 70, 26, 2.5), rev=.6)
M(70.9, drone(D - 12, 6.0, .18, 260), rev=.3)
M(70.9, choir([D + 12, D + 17, D + 21], 5.5, .04), rev=.9)
M(71.4, pad([D + 12, D + 15, D + 19, D + 24], 5.0, .035, 1800, 2.0, .6), rev=.7)
X(72.0, riser(4.4, .3, 150, 6000, 55), rev=.5)
for tb in np.arange(71.4, 76.3, B): M(tb, taiko(.25 + .3 * (tb - 71.4) / 4.9), rev=.4)
X(w('f1', 11), impact(.5), rev=.6)
# hush on "It will depend on the quality..."
M(76.8, piano(D + 26, 3.0, .1), rev=.7); M(w('f2', 5), piano(D + 31, 3.0, .1), rev=.7); M(w('f2', 8), piano(D + 33, 3.0, .09), rev=.7)
M(76.8, pad([D + 14, D + 19, D + 24], 4.0, .03, 1400, 1.0, .5), rev=.8)
X(78.6, riser(2.35, .42, 300, 14000, 110), rev=.5)
X(79.8, reverse_cymbal(1.15, .4), rev=.5)
cut = np.ones(N); i0, i1 = int(80.9 * SR), int(80.96 * SR)
cut[i0:i1] = np.linspace(1, .0, i1 - i0); cut[i1:int(81.0 * SR)] = 0
music *= cut; sfxb *= cut; send *= cut

# ============================================================ end card 81–88
X(81.0, impact(1.2), rev=.9)
X(81.0, sub_boom(.9, 110, 28, 2.6), rev=.5)
END = [D + 12, D + 16, D + 19, D + 24, D + 28]
M(81.0, pad(END, 7.0, .05, 2600, .05, 4.0), rev=.9)
M(81.0, choir([D + 24, D + 28, D + 31], 6.5, .045), rev=.9)
M(81.0, drone(D - 12, 7.0, .14, 300), rev=.4)
for k, m in enumerate((74, 78, 81, 86, 90)): X(81.0 + k * .06, bell(m, 5.5, .05), rev=.9, pan=-.5 + k * .25)
X(81.55, shimmer(1.6, .12, 93), rev=.8)
X(83.0, shimmer(1.4, .08, 98), rev=.8)
X(83.1, piano(D + 36, 4.0, .07), rev=.8)
X(84.0, piano(D + 40, 3.5, .05), rev=.8)

# ============================================================ voice
voice = np.zeros((2, N))
for i in VO:
    a, sr = sf.read(f"{HERE}/vo/{i}.wav", dtype='float64')
    if a.ndim > 1: a = a.mean(1)
    a = resample_poly(a, SR, sr)
    a = filt(a, 'hp', 85)
    # gentle presence + compression
    a = a + .25 * filt(a, 'bp', (2500, 6000))
    pk = np.max(np.abs(a)) + 1e-9; a = a / pk
    a = np.tanh(a * 1.6) / np.tanh(1.6)
    place(voice, VO[i], a * .5)
vs = np.zeros((2, N)); place(vs, 0, voice[0] * .12)

# ducking envelope from the voice
ve = np.abs(voice[0])
ve = filt(ve, 'lp', 8)
ve = np.clip(ve / (np.max(ve) * .35 + 1e-9), 0, 1)
duck_m = 1 - .55 * ve
duck_s = 1 - .45 * ve

# reverb
def ir(dur=3.2, pre=.02):
    n = int(dur * SR); t = tt(n)
    e = np.exp(-t / (dur * .28))
    L = filt(rng.standard_normal(n), 'lp', 7000) * e; R = filt(rng.standard_normal(n), 'lp', 7000) * e
    p = int(pre * SR)
    x = np.pad(np.stack([L, R]), ((0, 0), (p, 0)))[:, :n]
    return x / np.sqrt(np.sum(x[0] ** 2))   # unit energy
IR = ir()
rev = np.stack([fftconvolve(send[c] * duck_s, IR[c])[:N] for c in range(2)]) * .5
VIR = IR[:, :int(1.2 * SR)] * np.exp(-tt(int(1.2 * SR)) / .25); VIR /= np.sqrt(np.sum(VIR[0] ** 2))
vrev = np.stack([fftconvolve(vs[0], VIR[c])[:N] for c in range(2)]) * .6

mix = music * duck_m * 1.0 + sfxb * duck_s * .9 + rev + voice * 3.6 + vrev * 3.6
mix = filt(mix, 'hp', 25)
# master: soft limiter
pk = np.max(np.abs(mix))
mix = mix / pk * 1.25
mix = np.tanh(mix) / np.tanh(1.25)
# loudness-ish normalisation (RMS target ~ -15 dBFS) with a -1 dBFS ceiling
rms = np.sqrt(np.mean(mix ** 2)); mix *= 10 ** (-15 / 20) / rms
mix = np.clip(mix, -.89, .89)
fade = np.ones(N); fn = int(1.0 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade
os.makedirs(f"{HERE}/out", exist_ok=True)
sf.write(f"{HERE}/out/audio.wav", mix.T.astype(np.float32), SR, subtype='PCM_24')
print('peak', np.max(np.abs(mix)), 'rms dB', 20 * np.log10(np.sqrt(np.mean(mix ** 2))))
if os.environ.get('STEMS'):
    for name, x in (('voice', voice), ('music', music * duck_m), ('sfx', sfxb * duck_s), ('rev', rev)):
        sf.write(f"{HERE}/out/stem_{name}.wav", (x / 4).T.astype(np.float32), SR)
