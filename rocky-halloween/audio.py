"""Procedural sound design for MAGNITUDE 10.31 (synced to motion.js timeline).
Writes out/audio.wav (48 kHz stereo). Needs numpy + scipy."""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import wave, os

SR = 48000
DUR = 32.0
N = int(SR * DUR)
rng = np.random.default_rng(1031)
dry = np.zeros((2, N))
send = np.zeros((2, N))

TH = [(2.3, .22), (4.5, .38), (6.3, .55), (7.7, .8), (11.0, 1.0)]
ALARM, LAMP_DIE, ALARM_OFF, BLACK = 9.6, 11.0, 13.55, 14.0
EYES, LOGO, SEAMS, SEAMS_END = 15.3, 16.2, 17.0, 18.7
V1, V2, SHAKE, CUT01, SHEET, END = 21.5, 22.4, 23.0, 23.9, 24.9, 27.9
HIT = 26.75


def tt(n): return np.arange(n) / SR


def place(buf, t0, sig, gain=1.0, pan=0.0):
    i0 = int(round(t0 * SR))
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    if i0 < 0: sig = sig[:, -i0:]; i0 = 0
    n = min(sig.shape[1], N - i0)
    if n > 0: buf[:, i0:i0 + n] += sig[:, :n] * gain


def filt(x, kind, f, order=2):
    if kind == 'bp':
        sos = butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], btype='band', output='sos')
    else:
        sos = butter(order, f / (SR / 2), btype=kind, output='sos')
    return sosfilt(sos, x, axis=-1)


def noise(d): return rng.standard_normal(int(d * SR))


def env_ad(n, a, d):
    t = tt(n); return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def tl(t0, t1):  # slice of the global time axis
    return slice(int(t0 * SR), int(t1 * SR))


T_ALL = tt(N)

# ------------------------------------------------------------ room tone / lamp hum / wind
hum = (np.sin(2 * np.pi * 60 * T_ALL) * .5 + np.sin(2 * np.pi * 120 * T_ALL) * .35 + np.sin(2 * np.pi * 180 * T_ALL) * .1)
hum_env = np.clip(T_ALL / .6, 0, 1) * (T_ALL < LAMP_DIE + .07)
dry += np.stack([hum, hum]) * hum_env * .012
air = filt(rng.standard_normal(N), 'lp', 900) * .02 * (T_ALL < BLACK)
dry += np.stack([air, np.roll(air, 377)])
wind = filt(rng.standard_normal(N), 'bp', (250, 900))
wl = (.5 + .5 * np.sin(2 * np.pi * .19 * T_ALL + 1)) * (.6 + .4 * np.sin(2 * np.pi * .07 * T_ALL))
wenv = np.clip(T_ALL / 1.0, 0, 1) * np.clip((BLACK - T_ALL) / .3, 0, 1)
dry += np.stack([wind * wl, np.roll(wind, 911) * wl]) * .035 * wenv

# ------------------------------------------------------------ clock ticks (stop at first thump)
def tick():
    n = int(.03 * SR); t = tt(n)
    return (filt(noise(.03), 'hp', 3000) * np.exp(-t / .004) + np.sin(2 * np.pi * 2600 * t) * np.exp(-t / .01) * .5)
for k in (0.15, 1.0, 2.0):
    place(dry, k, tick(), .12, .55); place(send, k, tick(), .05, .55)

# ------------------------------------------------------------ thumps
def thump(a):
    d = 2.2; n = int(d * SR); t = tt(n)
    f = 32 + 48 * np.exp(-t / .12)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (.35 + .4 * a))
    body = filt(noise(d), 'lp', 180) * np.exp(-t / .12) * 3
    click = filt(noise(d), 'bp', (600, 2500)) * np.exp(-t / .015) * .25
    x = np.tanh((sub * 1.1 + body + click) * (1 + a))
    return x
def rattle(t0, a, dens=10, dur=.45, band=(2500, 7000)):
    for k in range(int(dens * (.5 + a))):
        d = rng.uniform(0, dur) ** 1.4
        n = int(.012 * SR); t = tt(n)
        c = filt(rng.standard_normal(n), 'bp', band) * np.exp(-t / .0025)
        place(dry, t0 + d, c, .05 * a * rng.uniform(.4, 1), rng.uniform(-.7, .7))
for t0, a in TH:
    x = thump(a)
    place(dry, t0, x, .55 * a ** .9)
    place(send, t0, x, .25 * a)
    rattle(t0 + .02, a)
    if a > .5: rattle(t0 + .03, a, 6, .6, (900, 3000))   # glass / metal rattle

# lamp pop + glass tinkle at the big thump
pop = filt(noise(.05), 'hp', 1500) * np.exp(-tt(int(.05 * SR)) / .008)
place(dry, LAMP_DIE + .03, pop, .35, -.4); place(send, LAMP_DIE + .03, pop, .2, -.4)
for k in range(9):
    f = rng.uniform(3000, 7500); n = int(.5 * SR); t = tt(n)
    ping = np.sin(2 * np.pi * f * t) * np.exp(-t / rng.uniform(.05, .18))
    place(dry, LAMP_DIE + .06 + rng.uniform(0, .5), ping, .025, -.4 + rng.uniform(-.3, .3))
    place(send, LAMP_DIE + .06 + rng.uniform(0, .5), ping, .02)

# ------------------------------------------------------------ needle scratch (follows the seismic signal)
def chaos(t):
    s = lambda x: x * x * (3 - 2 * x)
    return s(np.clip((t - 8.7) / .9, 0, 1)) * (1 - s(np.clip((t - 11.7) / .7, 0, 1)))
def sig(t):
    s = .035 * np.sin(t * 29) + .025 * np.sin(t * 53.7 + 1.3)
    for t0, a in TH:
        d = t - t0; m = (d > 0) & (d < 4)
        s = s + np.where(m, a * 1.35 * np.exp(-np.clip(d, 0, 9) * 2.4) * np.sin(d * 2 * np.pi * 5.5), 0)
    s = s + chaos(t) * 1.5 * (.55 * np.sin(t * 71.3) + .45 * np.sin(t * 127.9 + 2.1) + .35 * np.sin(t * 43.1 + .7))
    return s
sl = tl(0, 12.6)
sg = sig(T_ALL[sl])
vel = np.abs(np.gradient(sg)) * SR
scr_env = np.clip(vel / 25, 0, 1.2)
scr_env = filt(scr_env, 'lp', 40)
scratch = filt(rng.standard_normal(sg.size), 'bp', (1800, 5200)) * scr_env * .05
dry[:, sl] += np.stack([scratch, scratch * .8])

# ------------------------------------------------------------ tension drone 5 → 13.55
def saw(f, t): return 2 * ((f * t) % 1) - 1
sl = tl(5.0, BLACK); t = T_ALL[sl] - 5.0
drone = sum(saw(f * (1 + .002 * np.sin(2 * np.pi * .3 * t + i)), t) for i, f in enumerate([55, 58.27, 82.41, 87.31]))
cut = np.clip(np.interp(t, [0, 3, 7, 8.55, 8.6], [0, .4, 1, 1, 0]), 0, 1)
dlp = np.zeros_like(drone)
for k0 in range(0, drone.size, SR // 4):   # piecewise sweeping lowpass
    seg = slice(k0, min(drone.size, k0 + SR // 4)); fc = 180 + 900 * np.clip(t[k0] / 7.5, 0, 1)
    dlp[seg] = filt(drone[seg], 'lp', fc)
dry[:, sl] += np.stack([dlp, np.roll(dlp, 240)]) * cut * .05
send[:, sl] += np.stack([dlp, dlp]) * cut * .02

# ------------------------------------------------------------ alarm 9.6 → 13.55 + power-down
t0 = ALARM
while t0 < ALARM_OFF:
    for f, d in ((960, .2), (720, .2)):
        if t0 >= ALARM_OFF: break
        n = int(d * SR); t = tt(n)
        b = np.sign(np.sin(2 * np.pi * f * t)) * np.minimum(1, t / .005) * np.minimum(1, (d - t) / .01)
        b = filt(b, 'lp', 3500)
        place(dry, t0, b, .055, -.45); place(send, t0, b, .03, -.45)
        t0 += d + .05
d = BLACK - ALARM_OFF + .05; n = int(d * SR); t = tt(n)
f = 420 * np.exp(-t / .12) + 30
pd = saw(1, 0) * 0 + np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - t / d)
place(dry, ALARM_OFF, filt(pd, 'lp', 1200), .12)
place(dry, BLACK - .03, filt(noise(.02), 'hp', 1000) * np.exp(-tt(int(.02 * SR)) / .004), .2)  # relay click

# ------------------------------------------------------------ Rocky reveal
# eyes: cold metallic shimmer
n = int(2.5 * SR); t = tt(n)
shing = (np.sin(2 * np.pi * 2217 * t) + .7 * np.sin(2 * np.pi * 3329 * t) + .4 * np.sin(2 * np.pi * 1108 * t)) * np.minimum(1, t / .02) * np.exp(-t / .7)
place(dry, EYES, shing, .03); place(send, EYES, shing, .05)
# ominous sub swell
sl = tl(EYES, CUT01); t = T_ALL[sl] - EYES
sub = (np.sin(2 * np.pi * 41 * t) + .5 * np.sin(2 * np.pi * 61.5 * t)) * np.clip(t / 2.5, 0, 1) * np.clip((20.4 - EYES - t) / .5, 0, 1)
dry[:, sl] += np.stack([sub, sub]) * .09
# logo hum-on
n = int(2.6 * SR); t = tt(n)
hm = sum(saw(f, t) for f in (110, 110.6, 165.2)) / 3
hm = filt(hm, 'lp', 900) * np.minimum(1, t / .25) * np.exp(-t / 1.6)
place(dry, LOGO, hm, .05); place(send, LOGO, hm, .04)
# stone cracking + fire whoosh
for k in range(140):
    u = rng.beta(2, 2); t0 = SEAMS + u * (SEAMS_END - SEAMS + .4)
    d = rng.uniform(.004, .03); n = int(d * SR) + 1; t = tt(n)
    c = filt(rng.standard_normal(n), 'bp', (rng.uniform(500, 1500), rng.uniform(2500, 6000))) * np.exp(-t / (d / 3))
    place(dry, t0, c, rng.uniform(.03, .12), rng.uniform(-.8, .8)); place(send, t0, c, .03)
d = 3.0; n = int(d * SR); t = tt(n)
wh = rng.standard_normal(n); wenv = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
whoosh = np.zeros(n)
for k0 in range(0, n, SR // 8):
    seg = slice(k0, min(n, k0 + SR // 8)); fc = 300 + 1600 * (k0 / n)
    whoosh[seg] = filt(wh[seg], 'bp', (fc * .6, fc * 1.6))
place(dry, SEAMS - .1, whoosh * wenv, .05); place(send, SEAMS - .1, whoosh * wenv, .05)
rum = filt(noise(3.2), 'lp', 90) * np.sin(np.pi * np.clip(tt(int(3.2 * SR)) / 3.2, 0, 1))
place(dry, SEAMS, rum * 3, .12)
# growl
d = 2.6; n = int(d * SR); t = tt(n)
f0 = 46 + 4 * np.sin(2 * np.pi * 1.3 * t)
g = saw(1, 0) * 0 + np.sin(2 * np.pi * np.cumsum(f0) / SR) + .6 * (2 * ((np.cumsum(f0) / SR) % 1) - 1)
grit = 1 + .7 * np.sin(2 * np.pi * 19 * t) * (.5 + .5 * np.sin(2 * np.pi * 2.3 * t))
gn = filt(rng.standard_normal(n), 'bp', (120, 700)) * .6
growl = np.tanh((g + gn) * grit * 1.5)
growl = filt(growl, 'bp', (60, 900)) * np.sin(np.pi * np.clip(t / d, 0, 1)) ** .6
place(dry, SEAMS + .35, growl, .2); place(send, SEAMS + .35, growl, .12)
# tilt whoosh
n = int(1.4 * SR); t = tt(n)
place(dry, 20.0, filt(noise(1.4), 'bp', (200, 1200)) * np.sin(np.pi * t / 1.4) ** 2, .012)

# ------------------------------------------------------------ voice: "Trick… or treat."
w = wave.open(os.path.join(os.path.dirname(__file__), 'assets', 'voice_raw.wav'))
vsr = w.getframerate(); v = np.frombuffer(w.readframes(w.getnframes()), np.int16) / 32768.0
def shift(x, fac):  # play back slower → lower + longer
    out_len = int(len(x) / vsr / fac * SR)
    src = np.arange(out_len) * (vsr / SR) * fac
    return np.interp(src, np.arange(len(x)), x)
def monster(x):
    a = shift(x, .74); b = shift(x, .6)
    m = np.zeros(max(a.size, b.size)); m[:a.size] += a; m[:b.size] += b * .55
    m = np.tanh(m * 2.2) * .8
    m = filt(m, 'lp', 3200) + filt(m, 'lp', 220) * .8
    return m
part1 = monster(v[: int(.55 * vsr)]); part2 = monster(v[int(.75 * vsr):])
place(dry, V1, part1, .55); place(send, V1, part1, .3)
place(dry, V2 - .11, part2, .55); place(send, V2 - .11, part2, .3)

# bucket shake (plastic + candy rattle) and the tiny "0.01" beep
rattle(SHAKE + .02, .9, 26, .6, (1500, 6000))
for k in range(4):
    n = int(.06 * SR); t = tt(n)
    place(dry, SHAKE + k * .14, filt(np.random.default_rng(k).standard_normal(n), 'bp', (400, 1600)) * np.exp(-t / .015), .05)
for k in range(2):
    n = int(.07 * SR); t = tt(n)
    b = np.sin(2 * np.pi * 1760 * t) * np.minimum(1, t / .003) * np.exp(-t / .03)
    place(dry, CUT01 - .12 + k * .14, b, .07, .3)

# ------------------------------------------------------------ reveal + end card music
def celesta(f, d=1.2):
    n = int(d * SR); t = tt(n)
    return (np.sin(2 * np.pi * f * t) + .35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / .15) + .15 * np.sin(2 * np.pi * 4.01 * f * t) * np.exp(-t / .05)) * np.minimum(1, t / .004) * np.exp(-t / .5)
mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
motif = [76, 81, 84, 83, 76, 81, 86, 84, 88]           # E5 A5 C6 B5 E5 A5 D6 C6 E6
for i, m in enumerate(motif):
    t0 = SHEET - .25 + i * .2
    place(dry, t0, celesta(mtof(m)), .05, (-1) ** i * .3); place(send, t0, celesta(mtof(m)), .06)
# riser
d = 1.9; n = int(d * SR); t = tt(n)
rs = rng.standard_normal(n); riser = np.zeros(n)
for k0 in range(0, n, SR // 10):
    seg = slice(k0, min(n, k0 + SR // 10)); fc = 400 + 5000 * (k0 / n) ** 2
    riser[seg] = filt(rs[seg], 'bp', (fc * .7, fc * 1.4))
place(dry, HIT - d, riser * (t / d) ** 2, .07); place(send, HIT - d, riser * (t / d) ** 2, .05)
# big hit at the logo reveal and at the end card
def hit(dur=3.0):
    n = int(dur * SR); t = tt(n)
    boom = np.sin(2 * np.pi * np.cumsum(30 + 60 * np.exp(-t / .08)) / SR) * np.exp(-t / .8)
    chord = sum(saw(mtof(m), t) for m in (33, 45, 52, 60)) / 4
    chord = filt(chord, 'lp', 700) * np.minimum(1, t / .01) * np.exp(-t / 1.1)
    return np.tanh(boom * 1.5) * .8 + chord * .5
place(dry, HIT, hit(), .38); place(send, HIT, hit(), .25)
place(dry, END + .05, hit(2.8), .3); place(send, END + .05, hit(2.8), .25)
# end-card motif reprise (quiet) and receding footsteps
for i, m in enumerate([76, 81, 84, 83, 81]):
    t0 = END + .7 + i * .24
    place(send, t0, celesta(mtof(m)), .05); place(dry, t0, celesta(mtof(m)), .03)
for t0, a in ((END + 1.1, .5), (END + 1.75, .3), (END + 2.3, .16)):
    place(dry, t0, thump(a), .5 * a); place(send, t0, thump(a), .2 * a)

# ------------------------------------------------------------ reverb + master
d = 2.4; n = int(d * SR); t = tt(n)
ir = np.stack([rng.standard_normal(n), rng.standard_normal(n)]) * np.exp(-t / .55)
ir = filt(ir, 'lp', 5000); ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
wet = np.stack([fftconvolve(send[i], ir[i])[:N] for i in range(2)]) * .55
mix = dry + wet
# hard silence for scene 6 (black), then gentle fades
gate = np.ones(N)
gate *= np.clip(1 - (T_ALL - (BLACK - .02)) / .06, 0, 1) + np.clip((T_ALL - 15.0) / .02, 0, 1)
gate = np.clip(gate, 0, 1)
mix *= gate
mix *= np.clip(T_ALL / .4, 0, 1) * np.clip((DUR - T_ALL) / .5, 0, 1)
mix = filt(mix, 'hp', 25)
peak = np.abs(mix).max(); mix = np.tanh(mix / peak * 1.3) / np.tanh(1.3) * .93
os.makedirs(os.path.join(os.path.dirname(__file__) or '.', 'out'), exist_ok=True)
with wave.open(os.path.join(os.path.dirname(__file__) or '.', 'out', 'audio.wav'), 'wb') as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
    f.writeframes((mix.T * 32767).astype(np.int16).tobytes())
print('wrote out/audio.wav', mix.shape, 'peak before norm', peak)
