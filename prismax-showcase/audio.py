"""Procedural soundtrack + SFX for the PrismaX showcase motion piece (synced to motion.js timeline).
Writes out/audio.wav (48 kHz, stereo)."""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import wave, os

SR = 48000
T = 77.0
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


# ============================================================ timeline (mirrors motion.js)
INTRO_END, CAT_DUR, SITE_DUR = 10.0, 1.5, 3.3
CATS, SITES = [], []
tc = INTRO_END
for n_sites in (3, 4, 3, 5):
    CATS.append(tc); tc += CAT_DUR
    for j in range(n_sites):
        SITES.append((tc, j == 0)); tc += SITE_DUR
OUTRO = tc            # 65.5
END_CARD = 72.5

# ============================================================ music (D minor, 100 BPM, bar grid starts at 0.4s)
BPM = 100; BEAT = 60 / BPM; BAR = 4 * BEAT; ORIGIN = 0.4
CHORDS = [[62, 65, 69, 72], [58, 62, 65, 69], [60, 65, 69, 72], [60, 64, 67, 72]]   # Dm7 Bbmaj7 F/C C
ROOTS = [38, 34, 41, 36]
ARPS = [[74, 77, 81, 84], [70, 74, 77, 81], [72, 77, 81, 84], [72, 76, 79, 84]]
DRUMS_A, DRUMS_B = INTRO_END, OUTRO - 0.2


def chord_at(t):
    return int((t - ORIGIN) // BAR) % 4


tN = np.arange(N) / SR
pad = np.zeros((2, N))
for b in range(-1, int(T / BAR) + 1):
    t0 = ORIGIN + b * BAR
    if t0 >= END_CARD - 0.01:
        break
    ch = CHORDS[b % 4]
    lvl = 0.8 if t0 < INTRO_END else (0.55 if t0 < OUTRO - 1 else 0.85)
    cut = 900 if t0 < 5 else (1400 if t0 < INTRO_END else (2200 if t0 < OUTRO - 1 else 1200))
    dur = min(BAR + 0.8, END_CARD - t0 + 0.3)
    for k, m in enumerate(ch):
        place(pad, t0, pad_note(m, dur, cut, 0.08 * lvl), pan=(-0.5 + 0.33 * k))
# final chord under the end card
for k, m in enumerate((50, 62, 65, 69, 76)):
    place(pad, END_CARD, pad_note(m, T - END_CARD, 1700, 0.085), pan=(-0.5 + 0.25 * k))

kick_times = [b for b in np.arange(DRUMS_A, DRUMS_B, BEAT)]
sc = np.ones(N)
for k in kick_times:
    i0 = int(k * SR); n = int(0.35 * SR)
    sc[i0:i0 + n] = np.minimum(sc[i0:i0 + n], 1 - 0.45 * np.exp(-tt(min(n, N - i0)) / 0.1))
gap = np.ones(N)                                   # breath before the drop at 10.0
a_, b_ = int((INTRO_END - 0.22) * SR), int((INTRO_END - 0.04) * SR)
gap[a_:b_] = np.linspace(1, 0.15, b_ - a_); gap[b_:int(INTRO_END * SR)] = 0.15
pad *= sc * gap
dry += pad * 0.9
send += pad * 0.55

# drums
for i, k in enumerate(kick_times):
    place(dry, k, kick(0.72), 0.85)
for i, b in enumerate(np.arange(DRUMS_A, DRUMS_B, BEAT / 2)):
    off = i % 2 == 1
    place(dry, b, hat(off and i % 4 == 3), 0.26 if off else 0.1, pan=0.3 if off else -0.2)
for b in np.arange(DRUMS_A + BEAT, DRUMS_B, BEAT * 2):
    c = clap(); place(dry, b, c, 0.42); place(send, b, c, 0.45)

# bass: 8ths
for i, b in enumerate(np.arange(DRUMS_A, DRUMS_B, BEAT / 2)):
    root = ROOTS[chord_at(b)]
    m = root + (12 if i % 4 == 3 else 0)
    place(dry, b, bass_note(m, BEAT / 2 * 0.9, 0.3))

# arps: sparse in the intro, 8ths in the main section, quarters in the outro
arp = np.zeros((2, N))
pat = [0, 1, 2, 3, 2, 1, 3, 2]
for i, b in enumerate(np.arange(ORIGIN + 1 * BAR, INTRO_END - 0.3, BEAT / 2)):
    if b < 2.8: continue
    place(arp, b, pluck(ARPS[chord_at(b)][pat[i % 8]] - 12, 0.07, 0.3), pan=(-0.4 if i % 2 else 0.4))
for i, b in enumerate(np.arange(DRUMS_A, DRUMS_B, BEAT / 2)):
    place(arp, b, pluck(ARPS[chord_at(b)][pat[i % 8]], 0.1), pan=(-0.45 if i % 2 else 0.45))
for i, b in enumerate(np.arange(OUTRO, END_CARD - 0.4, BEAT)):
    place(arp, b, pluck(ARPS[chord_at(b)][i % 4] - 12, 0.08, 0.35), pan=(-0.3 if i % 2 else 0.3))
dry += arp * 0.8
dly += arp * 0.5
send += arp * 0.4

# ============================================================ SFX cues
def sfx(t0, sig, gain=1.0, pan=0.0, rev=0.3):
    place(dry, t0, sig, gain, pan); place(send, t0, sig, gain * rev, pan)

# intro: tile flies in from depth
rw = whoosh(1.3, 200, 4500, 0.35)
sfx(0.2, np.ascontiguousarray(rw[:, ::-1]), rev=0.4)
sfx(1.45, impact(0.45), rev=0.6)
for k, m in enumerate((62, 69, 74, 77)): sfx(1.5 + k * 0.05, bell(m + 12, 2.6, 0.05), rev=0.8)
sfx(1.6, shimmer(1.0, 0.12), rev=0.6)
sfx(2.5, whoosh(0.8, 300, 3000, 0.22))
for i in range(5): sfx(3.15 + i * 0.11, tick(2600 + i * 140, 0.05), pan=-0.2 + i * 0.1)
sfx(3.9, pop(880, 0.15))
sfx(5.4, whoosh(0.9, 250, 5000, 0.3))
sfx(6.05, impact(0.55), rev=0.6)
for k, m in enumerate((65, 69, 74)): sfx(6.05 + k * 0.04, bell(m + 12, 2.2, 0.05), rev=0.8)
sfx(6.0, whoosh(1.8, 100, 1500, 0.22), rev=0.5)                 # ring rising
sfx(8.3, riser(INTRO_END - 8.3, 0.35), rev=0.4)
sfx(INTRO_END, impact(1.0), rev=0.6)
for k, m in enumerate((50, 62, 69, 74, 77)): sfx(INTRO_END + k * 0.03, bell(m + 12, 3.2, 0.05), rev=0.8)
# category cards
for ci, a in enumerate(CATS):
    if ci > 0:
        sfx(a - 0.45, whoosh(0.9, 200, 4500, 0.3), rev=0.3)
    sfx(a + 0.12, bell(74 + (ci % 2) * 3, 2.0, 0.06), rev=0.8)
    sfx(a + 0.3, shimmer(0.8, 0.08), rev=0.6)
# sites
for si, (a, first) in enumerate(SITES):
    if not first and si > 0:
        sfx(a - 0.4, whoosh(0.85, 300, 4200, 0.24), rev=0.25)
    sfx(a + 0.22, pop(700 + (si % 5) * 90, 0.14), pan=-0.4)
    sfx(a + 0.5, tick(3000, 0.06), pan=-0.3)
# outro
sfx(OUTRO - 0.3, whoosh(1.6, 150, 3000, 0.32), rev=0.5)
for k, t0 in enumerate((66.35, 67.6, 68.5, 69.4)): sfx(t0, bell((69, 72, 74, 77)[k] + 12, 2.2, 0.045), rev=0.9)
sfx(71.0, riser(END_CARD - 71.0, 0.4), rev=0.4)
sfx(END_CARD, impact(0.9), rev=0.7)
for k, m in enumerate((62, 69, 74, 77, 81)): sfx(END_CARD + k * 0.05, bell(m + 12, 4.0, 0.05), rev=0.9)
sfx(END_CARD + 0.1, shimmer(1.4, 0.14), rev=0.7)
sfx(73.3, pop(900, 0.14))

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
fade_out = np.clip((T - tN) / 1.6, 0, 1)
mix *= fade_in * fade_out
mix *= 10 ** (-1.0 / 20) / np.max(np.abs(mix))

os.makedirs('out', exist_ok=True)
pcm = (mix.T * 32767).astype(np.int16)
with wave.open('out/audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote out/audio.wav', mix.shape)
