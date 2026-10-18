"""Generate voiceover lines with Kokoro (local ONNX). Writes vo/<id>.wav and vo/durations.json."""
import soundfile as sf, json, sys, os
from kokoro_onnx import Kokoro
M = os.environ.get('KOKORO_DIR', '.')
k = Kokoro(f"{M}/kokoro-v1.0.onnx", f"{M}/voices-v1.0.bin")
voice = sys.argv[1] if len(sys.argv) > 1 else 'af_heart'
speed = float(sys.argv[2]) if len(sys.argv) > 2 else 0.92
here = os.path.dirname(os.path.abspath(__file__))
dur = {}
for line in open(f"{here}/lines.txt"):
    if not line.strip(): continue
    i, txt = line.strip().split('|', 1)
    s, sr = k.create(txt, voice=voice, speed=speed, lang='en-us')
    sf.write(f"{here}/{i}.wav", s, sr)
    dur[i] = round(len(s) / sr, 3)
    print(i, dur[i], flush=True)
json.dump(dur, open(f"{here}/durations.json", 'w'), indent=1)
print('total', sum(dur.values()))
