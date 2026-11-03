"""timeline.json + cues.json + voice/*.mp3 -> out/audio.wav

Procedural 118 BPM track (soft intro, drop at the logo reveal, sidechain pump),
sound effects at the cue times the page computes (render.js cues), and the
narration on top with the music ducked under it. numpy only.
"""
import json, subprocess, wave, pathlib
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
SR = 48000
TL = json.load(open(HERE / "timeline.json"))
CUES = json.load(open(HERE / "cues.json"))
DUR = TL["duration"]; N = int(DUR * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(11)
L = np.zeros(N); R = np.zeros(N)
scene = {s["id"]: s for s in TL["scenes"]}
DROP = scene["reveal"]["start"]

def add(sig, at, gain=1.0, pan=0.0):
    s = int(at * SR)
    if s >= N or s + len(sig) <= 0: return
    a, b = max(0, s), min(N, s + len(sig)); seg = sig[a - s:b - s] * gain
    L[a:b] += seg * np.sqrt(0.5 * (1 - pan)); R[a:b] += seg * np.sqrt(0.5 * (1 + pan))

def tt(d): return np.arange(int(d * SR)) / SR
def smooth(x, k):
    c = np.cumsum(np.concatenate([[0.0], x])); y = (c[k:] - c[:-k]) / k
    return np.concatenate([y, np.zeros(len(x) - len(y))])

BPM = 118; beat = 60 / BPM; bar = 4 * beat
note = lambda m: 440 * 2 ** ((m - 69) / 12)
roots = [57, 53, 48, 55]                               # Am F C G
chords = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]]

# ---------- music ----------
nb = int(DUR / beat) + 2
pump = np.ones(N)
for i in range(nb):
    s = int(i * beat * SR)
    if s >= N: break
    if i * beat >= DROP:
        x = tt(beat)[:N - s]; pump[s:s + len(x)] = 1 - 0.55 * np.exp(-x / 0.11)
energy = np.clip((t - (DROP - 0.05)) / 0.05, 0, 1)        # 0 before the drop, 1 after
outro = np.clip((DUR - t) / 2.2, 0, 1)

for b in range(int(DUR / bar) + 1):                    # pads
    s0 = b * bar
    if s0 >= DUR: break
    x = tt(bar + 0.4); env = np.minimum(1, x / 0.35) * np.exp(-np.maximum(0, x - bar) * 6)
    k = b % 4
    for iv in chords[k]:
        for det, pan in ((-0.15, -0.5), (0.15, 0.5)):
            ph = 2 * np.pi * note(roots[k] + 12 + iv) * (1 + det / 100) * x
            sig = env * (np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph))
            add(sig, s0, 0.020, pan)
    # sub bass, 8ths after the drop
    if s0 >= DROP - 0.01:
        for e in range(8):
            x = tt(beat / 2 * 0.95); envb = np.exp(-x * 5)
            add(np.sin(2 * np.pi * note(roots[k] - 12) * x) * envb + 0.3 * np.sin(4 * np.pi * note(roots[k] - 12) * x) * envb, s0 + e * beat / 2, 0.11)

for i in range(int(DUR / (beat / 4))):                 # 16th arp pluck
    at = i * beat / 4; k = int(at / bar) % 4
    pat = [0, 7, 12, 7, 3 if chords[k][1] == 3 else 4, 7, 12, 15 if chords[k][1] == 3 else 16]
    m = roots[k] + 12 + pat[i % 8]; x = tt(0.18)
    sig = np.sin(2 * np.pi * note(m) * x) * np.exp(-x * 22) + 0.3 * np.sin(4 * np.pi * note(m) * x) * np.exp(-x * 30)
    add(sig, at, 0.035 if at < DROP else 0.028, 0.35 * np.sin(i * 0.7))

for i in range(nb):                                    # drums
    at = i * beat
    if at >= DUR: break
    if at >= DROP - 0.01:
        x = tt(0.35); f = 45 + 110 * np.exp(-x * 28)
        add(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 9), at, 0.42)          # kick
        if i % 2 == 1:                                                                  # clap
            n = rng.standard_normal(int(0.16 * SR)); n = n - smooth(n, 6); x = tt(0.16)
            add(n * (np.exp(-x * 28) + 0.5 * np.exp(-np.maximum(0, x - 0.012) * 40) * (x > .012)), at, 0.10)
        n = rng.standard_normal(int(0.25 * SR)); n = n - smooth(n, 3); x = tt(0.25)      # open hat offbeat
        add(n * np.exp(-x * 14), at + beat / 2, 0.035, 0.3)
    for h in range(2):                                                                  # closed hats
        n = rng.standard_normal(int(0.05 * SR)); n = n - smooth(n, 3); x = tt(0.05)
        add(n * np.exp(-x * 90), at + h * beat / 2, 0.03 if at >= DROP else 0.018, -0.3)

music_L, music_R = L.copy(), R.copy(); L[:] = 0; R[:] = 0

# ---------- sound effects ----------
def whoosh():
    d = 0.6; x = tt(d); n = rng.standard_normal(len(x)); env = np.sin(np.pi * x / d) ** 2
    lo = smooth(n, 30); hi = n - smooth(n, 4); mix = lo * (1 - x / d) + hi * 0.25 * (x / d)
    return mix * env
def riser():
    d = 1.0; x = tt(d); n = rng.standard_normal(len(x)) ; n = n - smooth(n, 5)
    f = 220 * (6 ** (x / d)); sw = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return (0.6 * n + 0.5 * sw) * (x / d) ** 2.2
def impact():
    x = tt(1.2); f = 38 + 70 * np.exp(-x * 7)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 3.2)
    n = rng.standard_normal(len(x)) * np.exp(-x * 22)
    return boom + 0.45 * smooth(n, 4)
def key():
    x = tt(0.03); n = rng.standard_normal(len(x)); n = n - smooth(n, 2)
    return n * np.exp(-x * 160) + 0.4 * np.sin(2 * np.pi * 1800 * x) * np.exp(-x * 200)
def pop():
    x = tt(0.12); f = 950 - 450 * (x / 0.12)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 30)
def tap():
    x = tt(0.12); n = rng.standard_normal(len(x)); n = n - smooth(n, 2)
    return 0.5 * n * np.exp(-x * 200) + np.sin(2 * np.pi * 190 * x) * np.exp(-x * 40)
def scan():
    d = 0.9; x = tt(d); f = 400 * (4 ** (x / d))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * x / d) * (0.7 + 0.3 * np.sin(2 * np.pi * 18 * x))
def stamp():
    x = tt(0.4); f = 95 * np.exp(-x * 4) + 40
    th = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 11)
    n = rng.standard_normal(len(x)) * np.exp(-x * 45)
    return th + 0.6 * smooth(n, 3)
def ding():
    x = tt(0.8); e = np.exp(-x * 6)
    return (np.sin(2 * np.pi * 1318.5 * x) + 0.6 * np.sin(2 * np.pi * 1975.5 * x) + 0.2 * np.sin(2 * np.pi * 2637 * x)) * e

FX = {"whoosh": (whoosh, 0.30), "riser": (riser, 0.22), "impact": (impact, 0.55), "key": (key, 0.10),
      "pop": (pop, 0.16), "tap": (tap, 0.32), "scan": (scan, 0.06), "stamp": (stamp, 0.50), "ding": (ding, 0.07)}
for i, c in enumerate(CUES):
    fn, g = FX[c["k"]]
    pan = (-0.6 + 1.2 * (i % 2)) if c["k"] == "whoosh" else 0.0
    add(fn(), c["t"], g, pan)
fx_L, fx_R = L.copy(), R.copy(); L[:] = 0; R[:] = 0

# ---------- narration ----------
voice = np.zeros(N)
for ln in TL["lines"]:
    p = HERE / "voice" / f"line{ln['i']:02d}.mp3"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    v = np.frombuffer(raw, dtype=np.float32).astype(float)
    s = int(ln["start"] * SR); e = min(N, s + len(v)); voice[s:e] += v[:e - s]

duck = np.ones(N)
for ln in TL["lines"]:
    duck[max(0, int((ln["start"] - 0.2) * SR)):min(N, int((ln["end"] + 0.3) * SR))] = 0.38
duck = smooth(np.concatenate([np.ones(6000), duck, np.ones(6000)]), 12000)[6000:6000 + N]
fadein = np.clip(t / 0.6, 0, 1)
mg = duck * pump * fadein * outro * (0.75 + 0.25 * energy)
outL = music_L * mg + fx_L + voice * 1.15
outR = music_R * mg + fx_R + voice * 1.15
peak = max(np.abs(outL).max(), np.abs(outR).max()); outL /= peak / 0.9; outR /= peak / 0.9
st = np.stack([outL, outR], 1)
(HERE / "out").mkdir(exist_ok=True)
with wave.open(str(HERE / "out" / "audio_raw.wav"), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(st, -1, 1) * 32767).astype(np.int16).tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(HERE / "out" / "audio_raw.wav"),
                "-af", "loudnorm=I=-14:TP=-1.2:LRA=9", "-ar", str(SR), str(HERE / "out" / "audio.wav")], check=True)
print("audio.wav", DUR, "s,", len(CUES), "cues")
