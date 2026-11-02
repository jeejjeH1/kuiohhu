"""timeline.json + voice/*.mp3 -> out/audio.wav : narration over a ducked procedural music bed (numpy only)."""
import json, subprocess, wave, pathlib
import numpy as np
HERE = pathlib.Path(__file__).resolve().parent
SR = 48000
TL = json.load(open(HERE / "timeline.json"))
N = int(TL["duration"] * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)


BPM = 96; beat = 60 / BPM; bar = 4 * beat
roots = [57, 53, 48, 55]                      # A3 F3 C3 G3  (Am F C G)
qual = [[0, 3, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12], [0, 4, 7, 11]]
f = lambda m: 440 * 2 ** ((m - 69) / 12)
music = np.zeros(N)
# pads: detuned triangles, slow attack per bar
for b in range(int(TL["duration"] / bar) + 1):
    s0, s1 = int(b * bar * SR), min(N, int((b + 1) * bar * SR) + SR // 2)
    if s0 >= N: break
    tt = np.arange(s1 - s0) / SR
    env = np.minimum(1, tt / 0.9) * np.exp(-np.maximum(0, tt - bar) * 3)
    k = b % 4
    for iv in qual[k]:
        for det in (-0.12, 0.12):
            ph = 2 * np.pi * f(roots[k] + iv) * (1 + det / 100) * tt
            music[s0:s1] += 0.022 * env * (2 / np.pi) * np.arcsin(np.sin(ph))
    music[s0:s1] += 0.05 * env * np.sin(2 * np.pi * f(roots[k] - 12) * tt)       # sub bass
# soft kick + hats
for i in range(int(TL["duration"] / beat)):
    s = int(i * beat * SR)
    if s >= N: break
    L = min(N - s, int(0.25 * SR)); tt = np.arange(L) / SR
    if i % 2 == 0:
        music[s:s + L] += 0.16 * np.sin(2 * np.pi * (48 + 70 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 14)
    h = int((i + 0.5) * beat * SR); Lh = min(N - h, int(0.06 * SR))
    if Lh > 0:
        n = rng.standard_normal(Lh); n = np.diff(n, prepend=0)
        music[h:h + Lh] += 0.012 * n * np.exp(-np.arange(Lh) / SR * 70)
# whooshes at scene starts
for sc in TL["scenes"][1:]:
    s = int((sc["start"] - 0.45) * SR); L = int(0.9 * SR)
    if s < 0 or s + L > N: continue
    n = rng.standard_normal(L); tt = np.arange(L) / L
    k = np.exp(-((tt - 0.5) ** 2) / 0.03)
    sm = np.convolve(n, np.ones(9) / 9, mode="same") * (0.3 + 0.7 * tt)
    music[s:s + L] += 0.10 * k * sm

# voice
voice = np.zeros(N)
for ln in TL["lines"]:
    p = HERE / "voice" / f"line{ln['i']:02d}.mp3"
    if not p.exists(): continue
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    v = np.frombuffer(raw, dtype=np.float32).astype(float)
    s = int(ln["start"] * SR); e = min(N, s + len(v)); voice[s:e] += v[:e - s]

# ducking envelope from speech spans
duck = np.ones(N)
for ln in TL["lines"]:
    s, e = int((ln["start"] - 0.25) * SR), int((ln["end"] + 0.35) * SR)
    duck[max(0, s):min(N, e)] = 0.32
k = int(0.25 * SR)   # moving-average smoothing via cumsum (np.convolve with a 12k kernel is far too slow)
c = np.cumsum(np.concatenate([[0.0], np.full(k // 2, 1.0), duck, np.full(k - k // 2, duck[-1])]))
duck = (c[k:] - c[:-k])[:N] / k
fade = np.minimum(1, t / 1.5) * np.minimum(1, (TL["duration"] - t) / 2.5)
mix = voice * 1.0 + music * duck * fade * 0.9
mix /= max(1e-9, np.abs(mix).max()) / 0.89
st = np.stack([mix, mix], 1)
(HERE / "out").mkdir(exist_ok=True)
with wave.open(str(HERE / "out" / "audio_raw.wav"), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(st, -1, 1) * 32767).astype(np.int16).tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(HERE / "out" / "audio_raw.wav"),
                "-af", "loudnorm=I=-15:TP=-1.5:LRA=9", "-ar", str(SR), str(HERE / "out" / "audio.wav")], check=True)
print("audio.wav", TL["duration"], "s")
