"""Procedural soundtrack for Molten Rocky (15 s loop, synced to index.html's timeline).

python3 audio.py  ->  out/audio.wav   (48 kHz stereo, needs numpy + scipy)
"""
import os
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR, DUR = 48000, 15.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'lowpass', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'highpass', fs=SR, output='sos'), x)


def ss(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def env(t0, a, d, shape=1.0):
    """attack/decay envelope starting at t0"""
    e = np.zeros(N)
    x = t - t0
    up = (x >= 0) & (x < a)
    e[up] = (x[up] / a) ** shape
    down = x >= a
    e[down] = np.exp(-(x[down] - a) / d)
    return e


def add(sig, gain=1.0, pan=0.0):
    global L, R
    L += sig * gain * np.sqrt((1 - pan) / 2)
    R += sig * gain * np.sqrt((1 + pan) / 2)


def saw(freq):
    ph = np.cumsum(freq / SR) if np.ndim(freq) else t * freq
    return 2 * (ph - np.floor(ph + 0.5))


def sine(freq):
    ph = np.cumsum(freq / SR) * 2 * np.pi if np.ndim(freq) else 2 * np.pi * freq * t
    return np.sin(ph)


noise = rng.standard_normal(N)
noise2 = rng.standard_normal(N)

# wind bed (quiet at both ends so the loop is seamless)
wind_env = 0.55 + 0.45 * np.sin(2 * np.pi * t / DUR * 2 + 1.3) ** 2
add(bp(noise, 260, 720) * wind_env * 0.22, pan=-0.3)
add(bp(noise2, 380, 950) * (1.1 - wind_env) * 0.16, pan=0.35)

# drone: A1 + E2 saws, swells with the ignition, fades before the loop point
drone_env = ss(1.4, 4.2, t) * (1 - ss(12.9, 14.6, t))
add(lp(saw(55.0) + saw(55.4) + 0.7 * saw(82.41), 210) * drone_env * 0.16)
add(sine(27.5) * drone_env * 0.18)
# minor pad
pad_env = ss(4.0, 6.5, t) * (1 - ss(12.4, 13.8, t)) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.22 * t))
pad = sum(lp(saw(f * (1 + d)), 1100) for f in (220.0, 261.63, 329.63) for d in (-0.003, 0.003))
add(pad * pad_env * 0.018, pan=0.15)

# eyes open (0.55 s): rising hum + shimmer
x = t - 0.55
glide = 180 * 2 ** np.clip(x / 0.5, 0, 1)
add(sine(glide) * env(0.55, 0.04, 0.55) * 0.14)
add((sine(1760.0) + 0.6 * sine(2637.0)) * env(0.58, 0.08, 0.6) * 0.035, pan=0.2)
add(sine(48.0 - 18 * np.clip(x, 0, 1)) * env(0.55, 0.01, 0.5) * 0.35)

# ignition 1.5-4.2 s: grinding stone, sub boom, roar
grind = lp(noise, 520) * (ss(1.5, 2.4, t) * (1 - ss(3.6, 4.8, t)))
crackle_mask = (rng.random(N) < 0.0009).astype(float)
crackle = hp(fftconvolve(crackle_mask, np.exp(-np.arange(400) / 60.0))[:N] * rng.standard_normal(N), 900)
add(grind * 0.42 + crackle * ss(1.6, 2.2, t) * (1 - ss(4.0, 5.0, t)) * 0.5)
add(sine(52.0 - 22 * np.clip((t - 1.55) / 0.6, 0, 1)) * env(1.55, 0.008, 0.7) * 0.75)
rx = np.clip((t - 2.0) / 1.9, 0, 1)
roar_f = 70 + 26 * np.sin(np.pi * rx) - 20 * rx
roar = np.tanh(3.2 * saw(roar_f)) + 0.6 * np.tanh(3 * saw(roar_f * 1.5))
roar_env = ss(2.0, 2.35, t) * (1 - ss(3.3, 4.1, t))
add(lp(roar, 650) * roar_env * 0.36)
add(bp(noise2, 180, 420) * roar_env * 0.4)

# ember crackles while he burns
burn = ss(2.2, 3.5, t) * (1 - ss(12.8, 14.0, t))
pops = (rng.random(N) < 0.00035).astype(float)
pop = hp(fftconvolve(pops, np.exp(-np.arange(240) / 30.0))[:N] * rng.standard_normal(N), 2500)
add(pop * burn * 0.55, pan=0.25)
add(lp(noise2, 900) * burn * 0.03, pan=-0.2)

# heartbeat 4.2-12.4 s
for b in np.arange(4.25, 12.4, 0.83):
    for off, g in ((0.0, 0.5), (0.22, 0.32)):
        add(sine(60.0 - 24 * np.clip((t - b - off) / 0.25, 0, 1)) * env(b + off, 0.006, 0.16) * g)

# eerie bells
def bell(t0, f, g):
    s = (sine(f) + 0.35 * sine(f * 2.76) + 0.2 * sine(f * 5.4)) * env(t0, 0.004, 1.6)
    add(s * g, pan=0.3)
    add(np.roll(s, int(SR * 0.37)) * g * 0.45, pan=-0.4)
bell(5.2, 1318.5, 0.05)
bell(6.95, 1046.5, 0.045)
bell(10.6, 987.8, 0.04)

# thunder at 8.5 s
add(hp(noise, 2400) * env(8.5, 0.003, 0.18) * 0.55)
th = lp(noise2, 1400) * env(8.52, 0.03, 0.5) + lp(noise, 260) * env(8.55, 0.15, 1.6)
add(th * 0.9)
add(sine(34.0) * env(8.55, 0.1, 1.4) * 0.35)

# riser into the title + impact at 12.6 s
rise = ss(11.6, 12.58, t) * (t < 12.6)
add(bp(noise, 400, 4000) * rise ** 2 * 0.22)
add(sine(110 * 2 ** (2 * np.clip((t - 11.6) / 1.0, 0, 1))) * rise ** 2 * 0.06)
add(sine(58.0 - 30 * np.clip((t - 12.6) / 0.8, 0, 1)) * env(12.6, 0.005, 0.9) * 0.9)
add(lp(noise2, 800) * env(12.6, 0.004, 0.35) * 0.5)
add((sine(196.0) + 0.5 * sine(293.7) + 0.3 * sine(392.0)) * env(12.6, 0.01, 1.4) * 0.07, pan=0.1)

# reverb: exponentially decaying stereo noise impulse
ir_n = int(SR * 2.6)
ir_t = np.arange(ir_n) / SR
irL = rng.standard_normal(ir_n) * np.exp(-ir_t / 0.55)
irR = rng.standard_normal(ir_n) * np.exp(-ir_t / 0.55)
irL, irR = lp(irL, 5000), lp(irR, 5000)
irL /= np.sqrt((irL ** 2).sum()); irR /= np.sqrt((irR ** 2).sum())
wetL = fftconvolve(L, irL)[:N]
wetR = fftconvolve(R, irR)[:N]
# wrap the reverb tail to the start so the loop stays seamless
tailL = fftconvolve(L, irL)[N:N + ir_n]
tailR = fftconvolve(R, irR)[N:N + ir_n]
wetL[:len(tailL)] += tailL[:N]; wetR[:len(tailR)] += tailR[:N]
outL = L + wetL * 0.32
outR = R + wetR * 0.32

# gentle fades at the loop edges, soft clip, normalize to -1 dBFS
edge = ss(0, 0.05, t) * (1 - ss(DUR - 0.05, DUR, t))
mix = np.stack([outL, outR], axis=1) * edge[:, None]
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
os.makedirs(os.path.join(os.path.dirname(__file__) or '.', 'out'), exist_ok=True)
wavfile.write(os.path.join(os.path.dirname(__file__) or '.', 'out', 'audio.wav'), SR, (mix * 32767).astype(np.int16))
print('done: out/audio.wav', mix.shape)
