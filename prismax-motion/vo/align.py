"""Transcribe each VO line with faster-whisper to check it and get word timestamps -> vo/words.json"""
import json, os
from faster_whisper import WhisperModel
import soundfile as sf, numpy as np
from scipy.signal import resample_poly
here = os.path.dirname(os.path.abspath(__file__))
m = WhisperModel("base.en", device="cpu", compute_type="int8")
out = {}
for line in open(f"{here}/lines.txt"):
    if not line.strip(): continue
    i, txt = line.strip().split('|', 1)
    a, sr = sf.read(f"{here}/{i}.wav", dtype="float32")
    a = resample_poly(a, 16000, sr).astype(np.float32)
    segs, _ = m.transcribe(a, word_timestamps=True, language='en')
    ws = [dict(w=w.word.strip(), s=round(w.start, 3), e=round(w.end, 3)) for s in segs for w in s.words]
    out[i] = ws
    print(i, '|', ' '.join(w['w'] for w in ws))
json.dump(out, open(f"{here}/words.json", 'w'), indent=0)
