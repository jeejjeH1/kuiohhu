"""Procedural soundtrack + SFX for the KAST motion piece (synced to motion.js timeline).
Writes out/audio.wav (48 kHz, stereo)."""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import wave, os

SR = 48000
T = 70.0
N = int(SR * T)
rng = np.random.default_rng(1234)

dry = np.zeros((2, N))
send = np.zeros((2, N))        # reverb send
dly = np.zeros((2, N))         # delay send


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def place(buf, t0, sig, gain=1.0, pan=0.0):
    """Add mono or stereo sig into buf at time t0 with equal-power pan."""
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


def svf_sweep(x, f_curve, q=0.7, mode='bp'):
    """Time-varying state-variable filter (Chamberlin)."""
    low = band = 0.0
    out = np.empty_like(x)
    damp = 1.0 / q
    fc = 2 * np.sin(np.pi * np.clip(f_curve, 20, SR / 6) / SR)
    for i in range(len(x)):
        f = fc[i]
        low += f * band
        high = x[i] - low - damp * band
        band += f * high
        out[i] = band if mode == 'bp' else (low if mode == 'lp' else high)
    return out


def saw(freq, n, phase=0.0):
    ph = (phase + np.cumsum(np.full(n, freq) if np.isscalar(freq) else freq) / SR) % 1.0
    return 2 * ph - 1


def env_adsr(n, a, d, s, r, sustain_len=None):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n) if sustain_len is None else int(sustain_len * SR)
    e = np.concatenate([np.linspace(0, 1, max(a_n, 1)), np.linspace(1, s, max(d_n, 1)),
                        np.full(s_n, s), np.linspace(s, 0, max(r_n, 1))])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


# ============================================================ instruments
def kick(gain=1.0):
    n = int(0.5 * SR); t = tt(n)
    f = 45 + 110 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.28)
    click = filt(rng.standard_normal(n), 'hp', 2500) * np.exp(-t / 0.004) * 0.3
    return np.tanh((body + click) * 1.6) * gain


def clap():
    n = int(0.4 * SR); t = tt(n)
    nz = filt(rng.standard_normal(n), 'bp', (900, 3500))
    e = np.zeros(n)
    for k, off in enumerate([0, 0.011, 0.022]):
        i = int(off * SR); e[i:] += np.exp(-(t[:n - i]) / 0.008) * (0.8 if k < 2 else 1)
    e += np.exp(-np.maximum(t - 0.022, 0) / 0.12) * (t > 0.022) * 0.5
    return nz * e * 0.9


def hat(open_=False):
    n = int((0.25 if open_ else 0.07) * SR); t = tt(n)
    nz = filt(rng.standard_normal(n), 'hp', 7500)
    return nz * np.exp(-t / (0.07 if open_ else 0.018)) * 0.5


def pad_note(m, dur, cutoff=1400, amp=0.12):
    n = int(dur * SR)
    s = np.zeros(n)
    for det in (-0.09, 0.0, 0.07):
        s += saw(mtof(m + det), n, rng.random())
    s += 0.6 * np.sin(2 * np.pi * mtof(m - 12) * tt(n))
    s = filt(s, 'lp', cutoff)
    return s * env_adsr(n, 0.6, 0.4, 0.85, 0.9) * amp


_pluck_cache = {}


def pluck(m, amp=0.18, decay=0.22):
    key = (m, decay)
    if key not in _pluck_cache:
        _pluck_cache[key] = _pluck(m, decay)
    return _pluck_cache[key] * amp


def _pluck(m, decay):
    n = int(0.6 * SR); t = tt(n)
    s = saw(mtof(m), n) * 0.6 + np.sin(2 * np.pi * mtof(m) * t) * 0.6 + 0.25 * np.sin(2 * np.pi * mtof(m + 12) * t)
    cut = 600 + 5000 * np.exp(-t / 0.05)
    s = svf_sweep(s, cut, q=0.9, mode='lp')
    return s * np.exp(-t / decay)


def bass_note(m, dur, amp=0.32):
    n = int(dur * SR); t = tt(n)
    f = mtof(m)
    s = np.sin(2 * np.pi * f * t) + 0.35 * saw(f, n)
    s = filt(s, 'lp', 380)
    return np.tanh(s * 1.4) * env_adsr(n, 0.005, 0.08, 0.7, 0.05) * amp


def bell(m, dur=2.5, amp=0.2):
    n = int(dur * SR); t = tt(n)
    f = mtof(m)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t / 0.5)
    s = np.sin(2 * np.pi * f * t + mod) * np.exp(-t / 0.9) + 0.3 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.4)
    return s * amp * np.minimum(1, t / 0.002)


# ============================================================ sfx
def whoosh(dur=0.9, lo=300, hi=4000, amp=0.5):
    n = int(dur * SR); t = tt(n); x = t / dur
    bell_ = np.sin(np.pi * x) ** 2
    fc = lo + (hi - lo) * np.sin(np.pi * x) ** 1.5
    s = svf_sweep(rng.standard_normal(n), fc, q=1.6)
    s = s * bell_ * amp
    pan = np.linspace(-0.8, 0.8, n)
    a = (pan + 1) * np.pi / 4
    return np.stack([s * np.cos(a), s * np.sin(a)]) * np.sqrt(2)


def riser(dur, amp=0.35, f0=200, f1=6000):
    n = int(dur * SR); t = tt(n); x = t / dur
    fc = f0 * (f1 / f0) ** (x ** 1.4)
    nz = svf_sweep(rng.standard_normal(n), fc, q=2.2)
    tone_f = 110 * 2 ** (x ** 1.6 * 3)
    tone = np.sin(2 * np.pi * np.cumsum(tone_f) / SR) * 0.25 + saw(tone_f * 1.005, n) * 0.08
    e = x ** 2.2
    return (nz * 0.8 + tone) * e * amp


def impact(size=1.0):
    n = int(3.2 * SR); t = tt(n)
    f = 32 + 90 * np.exp(-t / 0.09)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.9 * size))
    nz = filt(rng.standard_normal(n), 'lp', 2200) * np.exp(-t / 0.18)
    crack = filt(rng.standard_normal(n), 'hp', 3000) * np.exp(-t / 0.03) * 0.5
    return np.tanh((sub * 1.2 + nz * 0.5 + crack) * 1.3) * 0.75 * size


def tick(f=3200, amp=0.12):
    n = int(0.03 * SR); t = tt(n)
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006) * amp


def pop(f=900, amp=0.25):
    n = int(0.12 * SR); t = tt(n)
    ff = f * (1 + 0.8 * np.exp(-t / 0.012))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.04) * amp


def glitch(dur=0.2, amp=0.25):
    n = int(dur * SR)
    s = np.zeros(n)
    i = 0
    while i < n:
        seg = int(rng.uniform(0.008, 0.03) * SR)
        kind = rng.integers(3)
        tseg = tt(min(seg, n - i))
        if kind == 0:
            part = np.sign(np.sin(2 * np.pi * rng.uniform(200, 2000) * tseg)) * 0.5
        elif kind == 1:
            part = rng.standard_normal(len(tseg)) * 0.6
        else:
            part = np.zeros(len(tseg))
        s[i:i + len(tseg)] = part
        i += seg
    s = np.round(s * 6) / 6
    return s * amp


def beep():
    n = int(0.42 * SR); t = tt(n)
    a = np.sin(2 * np.pi * 1975 * t) * ((t < 0.11) * np.minimum(1, t / 0.003))
    b = np.sin(2 * np.pi * 2637 * t) * ((t > 0.14) & (t < 0.38)) * np.exp(-np.maximum(t - 0.14, 0) / 0.18)
    return (a + b) * 0.22


def click():
    n = int(0.06 * SR); t = tt(n)
    return (filt(rng.standard_normal(n), 'bp', (1500, 5000)) * np.exp(-t / 0.004) * 0.6 +
            np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.02) * 0.5)


def shimmer(dur=1.2, amp=0.12):
    n = int(dur * SR); t = tt(n); x = t / dur
    s = np.zeros(n)
    for m in (88, 93, 95, 100):
        s += np.sin(2 * np.pi * mtof(m) * t + rng.random() * 6) * (0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(5, 11) * t))
    nz = filt(rng.standard_normal(n), 'hp', 9000) * 0.6
    return (s * 0.25 + nz) * np.sin(np.pi * x) ** 2 * amp


def crackle(dur, amp=0.15):
    n = int(dur * SR)
    s = np.zeros(n)
    for _ in range(int(dur * 70)):
        i = rng.integers(0, n - 400)
        s[i:i + 400] += filt(rng.standard_normal(400), 'hp', 2000) * np.exp(-tt(400) / 0.002) * rng.uniform(.3, 1)
    return s * amp


# ============================================================ music
BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT
CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]]   # Am F C G
ROOTS = [33, 29, 36, 31]
ARPS = [[69, 72, 76, 81], [65, 69, 72, 77], [67, 72, 76, 79], [67, 71, 74, 79]]


def chord_at(t):
    return int(t // BAR) % 4


# pad layer (whole piece, intensity by section)
def pad_level(t):
    if t < 1: return 0.6
    if t < 7: return 0.9
    if t < 22.5: return 0.6
    if t < 25: return 0.8
    if t < 58.5: return 0.55
    if t < 64.3: return 0.85
    return 0.9


def pad_cut(t):
    if t < 7: return 900
    if t < 22.5: return 1300
    if t < 25: return 700 + 2000 * (t - 22.5) / 2.5
    if t < 58.5: return 2200
    if t < 64.3: return 1100
    return 1800


pad = np.zeros((2, N))
for b in range(int(T / BAR)):
    t0 = b * BAR
    if 24.6 <= t0 < 25.0:
        continue
    ch = CHORDS[b % 4]
    dur = BAR + 0.8
    if t0 >= 64:
        ch = [57, 60, 64, 71]; dur = T - t0
    for k, m in enumerate(ch):
        place(pad, t0, pad_note(m, dur, pad_cut(t0), 0.09 * pad_level(t0)), pan=(-0.5 + 0.5 * k))
    if t0 >= 64:
        break

# sidechain envelope from kicks
kick_times = []
for b in np.arange(7.0, 22.5, BEAT): kick_times.append(b)
for b in np.arange(25.0, 58.5, BEAT): kick_times.append(b)
kick_times = [k for k in kick_times if not (52.95 <= k < 53.5)]
sc = np.ones(N)
tN = np.arange(N) / SR
for k in kick_times:
    i0 = int(k * SR); n = int(0.35 * SR)
    sc[i0:i0 + n] = np.minimum(sc[i0:i0 + n], 1 - 0.55 * np.exp(-tt(min(n, N - i0)) / 0.09))
# silence gap before the drop
gap = np.ones(N)
gap[int(24.7 * SR):int(24.85 * SR)] = np.linspace(1, 0, int(24.85 * SR) - int(24.7 * SR))
gap[int(24.85 * SR):int(25.0 * SR)] = 0
pad *= sc * gap
dry += pad * 0.9
send += pad * 0.5

# drums
for k in kick_times:
    g = 0.55 if k < 13 else (0.8 if k < 22.5 else 1.0)
    kk = kick(g)
    if k < 13:
        kk = filt(kk, 'lp', 600)
    place(dry, k, kk, 0.9)
for b in np.arange(13.0, 22.5, BEAT):
    place(dry, b + BEAT / 2, hat(True), 0.35, pan=0.25)
for b in np.arange(25.0, 58.5, BEAT / 4):
    if 52.95 <= b < 53.5: continue
    step = round((b - 25.0) / (BEAT / 4)) % 4
    place(dry, b, hat(step == 2), 0.34 if step == 2 else 0.14, pan=0.3 if step % 2 else -0.2)
for b in np.arange(26.0, 58.5, BEAT * 2):
    t0 = b + BEAT
    if 52.95 <= t0 < 53.5: continue
    c = clap(); place(dry, t0, c, 0.55); place(send, t0, c, 0.4)

# bass: 8th notes
for b in np.arange(13.0, 58.5, BEAT / 2):
    if 22.5 <= b < 25.0 or 52.95 <= b < 53.5: continue
    root = ROOTS[chord_at(b)]
    step = round(b / (BEAT / 2)) % 2
    m = root + (12 if step and b > 25 else 0)
    place(dry, b, bass_note(m, BEAT / 2 * 0.9, 0.3 if b < 22.5 else 0.36) * 1.0)

# arp plucks (16ths) in the main section
arp = np.zeros((2, N))
for i, b in enumerate(np.arange(26.0, 58.5, BEAT / 4)):
    if 52.95 <= b < 53.6: continue
    notes = ARPS[chord_at(b)]
    pat = [0, 1, 2, 3, 2, 1, 2, 3]
    m = notes[pat[i % 8]]
    place(arp, b, pluck(m, 0.11 if b < 50 else 0.13), pan=(-0.45 if i % 2 else 0.45))
dry += arp * 0.8
dly += arp * 0.5
send += arp * 0.35

# outro pulse (58.5-64.3): soft heartbeat + arp sparse
for b in np.arange(58.5, 64.0, BEAT):
    place(dry, b, filt(kick(0.5), 'lp', 400), 0.7)
for i, b in enumerate(np.arange(58.5, 64.0, BEAT / 2)):
    notes = ARPS[chord_at(b)]
    p = pluck(notes[i % 4] - 12, 0.07, 0.3)
    place(dry, b, p, pan=(-0.3 if i % 2 else 0.3)); place(dly, b, p, 0.6); place(send, b, p, 0.5)

# ============================================================ SFX cues
def sfx(t0, sig, gain=1.0, pan=0.0, rev=0.3):
    place(dry, t0, sig, gain, pan); place(send, t0, sig, gain * rev, pan)

# risers
for (a, b_, amp) in [(0.0, 1.0, 0.18), (23.0, 25.0, 0.45), (54.8, 55.6, 0.25), (62.8, 64.3, 0.35)]:
    sfx(a, riser(b_ - a, amp), 1.0, rev=0.4)
# impacts
for (t0, s) in [(1.0, 0.55), (25.0, 1.15), (55.6, 0.6), (64.3, 1.0)]:
    sfx(t0, impact(s), 1.0, rev=0.6)
# drop chord stab + bell at the logo
for m in (57, 64, 69, 72, 76):
    sfx(25.0, bell(m + 12, 3.5, 0.06), rev=0.8)
for m in (57, 64, 69, 71, 76):
    sfx(64.3, bell(m + 12, 5.0, 0.06), rev=0.9)
# transition whooshes
for ts in [6.75, 12.85, 22.35, 27.85, 33.35, 38.85, 44.35, 49.85, 53.4, 58.35]:
    sfx(ts - 0.5, whoosh(1.0, 250, 5000, 0.35), rev=0.25)
# S1 word ticks + split
for i in range(6): sfx(1.0 + i * 0.09, tick(2600 + i * 120, 0.06), pan=-0.2)
for i in range(6): sfx(2.2 + i * 0.09, tick(2800 + i * 120, 0.06), pan=0.2)
sfx(3.6, whoosh(0.8, 120, 900, 0.3), rev=0.5)
sfx(3.75, bell(76, 2.0, 0.05), rev=0.8)
# S2
for i in range(5): sfx(7.0 + i * 0.12, pop(700 + i * 90, 0.2), pan=-0.6)
for i in range(5): sfx(7.25 + i * 0.12, pop(1100 + i * 90, 0.18), pan=0.6)
sfx(7.6, crackle(0.9, 0.18), rev=0.2)
n_ = int(1.3 * SR); f_ = np.linspace(300, 1400, n_)
sfx(9.0, np.sin(2 * np.pi * np.cumsum(f_) / SR) * np.sin(np.pi * np.arange(n_) / n_) * 0.06, pan=-0.3, rev=0.4)
sfx(10.35, glitch(0.45, 0.22), rev=0.3)
sfx(10.4, impact(0.3), 0.6, rev=0.4)
sfx(10.45, crackle(0.8, 0.12), pan=0.1)
# S3 rows
for i in range(4):
    sfx(13.5 + i, glitch(0.16, 0.18), pan=0.2)
    sfx(13.5 + i, pop(220, 0.35))
for i in range(4): sfx(17.9 + i * 0.1, whoosh(0.25, 2000, 8000, 0.18), rev=0.2)
sfx(18.5, whoosh(0.6, 200, 2000, 0.3))
sfx(20.0, whoosh(0.35, 1500, 8000, 0.22))
sfx(20.5, pop(600, 0.2))
# S4
sfx(22.6, bell(69, 2.0, 0.05), rev=0.9)
sfx(25.35, shimmer(1.0, 0.18), rev=0.6)
sfx(26.5, shimmer(1.1, 0.12), rev=0.6)
sfx(26.0, pop(880, 0.15))
# P1 payments
sfx(28.2, whoosh(0.9, 200, 3500, 0.4))
sfx(29.3, shimmer(0.8, 0.1))
sfx(30.15, whoosh(0.6, 400, 4000, 0.3))
sfx(30.85, beep(), 1.0, pan=0.3, rev=0.25)
for i in range(3): sfx(31.6 + i * 0.3, pop(1000 + i * 150, 0.22), pan=0.4)
# P2
sfx(33.8, whoosh(1.4, 150, 1200, 0.15), rev=0.4)
for k, t0 in enumerate(np.arange(34.3, 35.6, 0.05)): sfx(t0, tick(2200 + (k % 5) * 180, 0.07), pan=-0.4)
sfx(35.6, bell(81, 2.0, 0.12), rev=0.7); sfx(35.6, bell(88, 2.0, 0.06), rev=0.7)
# P3
sfx(39.2, whoosh(1.2, 100, 1500, 0.3), rev=0.5)
for k in range(9): sfx(39.9 + k * 0.32, pop(1500 + (k % 4) * 200, 0.08), pan=0.5 - (k % 3) * 0.3, rev=0.6)
for i in range(4): sfx(40.2 + i * 0.35, pop(800 + i * 120, 0.2), pan=(-0.5 if i in (0, 3) else 0.6))
# P4
for i in range(8): sfx(44.8 + i * 0.1, pop(600 + (i * 137) % 700, 0.16), pan=((i % 3) - 1) * 0.5)
sfx(44.9, pop(400, 0.25))
rw = whoosh(0.85, 300, 6000, 0.4)
sfx(46.6, np.ascontiguousarray(rw[:, ::-1]), rev=0.3)
sfx(47.55, click(), 0.9)
for k, m in enumerate((81, 85, 88)): sfx(47.65 + k * 0.07, bell(m, 1.6, 0.08), rev=0.6)
# S6
sfx(50.35, whoosh(1.0, 150, 3000, 0.4))
sfx(51.7, shimmer(1.0, 0.12))
sfx(52.9, whoosh(0.6, 3000, 300, 0.3))
sfx(54.0, whoosh(0.5, 300, 2500, 0.2), pan=-0.5)
sfx(54.15, whoosh(0.5, 300, 2500, 0.2), pan=0.5)
for k, m in enumerate((69, 76, 81)): sfx(55.6 + k * 0.05, bell(m + 12, 2.5, 0.07), rev=0.8)
hum_n = int(2.5 * SR); ht = tt(hum_n)
hum = (np.sin(2 * np.pi * 110 * ht) + 0.5 * np.sin(2 * np.pi * 220.7 * ht)) * np.minimum(1, ht / 0.3) * np.minimum(1, (2.5 - ht) / 0.4) * 0.05
sfx(55.6, hum, rev=0.3)
# S7
sfx(58.6, bell(64, 2.5, 0.04), rev=0.9)
sfx(61.8, bell(69, 2.5, 0.05), rev=0.9)
sfx(64.65, shimmer(1.0, 0.16), rev=0.6)
sfx(65.9, pop(900, 0.18))
sfx(65.8, shimmer(1.4, 0.1), rev=0.7)

# ============================================================ FX buses
# delay (dotted 8th, ping-pong)
d = int(0.75 * BEAT * SR)
dl = np.zeros((2, N))
src = filt(dly, 'lp', 4000)
fb = 0.38
for k in range(1, 6):
    g = fb ** k
    ch = k % 2
    sh = d * k
    if sh < N:
        dl[ch, sh:] += src[0, :N - sh] * g * 0.7 + src[1, :N - sh] * g * 0.3
dry += dl * 0.7
send += dl * 0.3

# reverb (stereo exponential-noise IR)
irn = int(2.8 * SR); it = tt(irn)
irs = []
for c in range(2):
    ir = rng.standard_normal(irn) * np.exp(-it / 0.75)
    ir = filt(ir, 'lp', 5500)
    ir[:int(0.012 * SR)] = 0
    irs.append(ir / np.sqrt(np.sum(ir ** 2)))
wet = np.stack([fftconvolve(filt(send[c], 'hp', 200), irs[c])[:N] for c in range(2)])

mix = dry + wet * 0.55
mix = filt(mix, 'hp', 28)
# master: gentle glue + soft clip
mix *= 1.0 / (np.max(np.abs(mix)) + 1e-9)
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
# fades
fade_in = np.minimum(1, tN / 0.05)
fade_out = np.clip((T - tN) / 0.8, 0, 1)
mix *= fade_in * fade_out
mix *= 10 ** (-1.0 / 20) / np.max(np.abs(mix))

os.makedirs('out', exist_ok=True)
pcm = (mix.T * 32767).astype(np.int16)
with wave.open('out/audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote out/audio.wav', mix.shape)
