"""Persian narration with ElevenLabs: one mp3 per script line -> voice/lineNN.mp3

  export ELEVENLABS_API_KEY=...          # required
  export ELEVENLABS_VOICE_ID=...         # optional, any voice from your library
  export ELEVENLABS_MODEL=eleven_v4      # optional; v4 and v3 read Persian (fa)
  python3 tts_elevenlabs.py [--force]
Needs network access to api.elevenlabs.io.
"""
import json, os, sys, urllib.request, urllib.error, pathlib

HERE = pathlib.Path(__file__).resolve().parent
KEY = os.environ.get("ELEVENLABS_API_KEY")
VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "nPczCjzI2devNBz1zQrb")
MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_v4")
if not KEY:
    sys.exit("ELEVENLABS_API_KEY is not set")

lines = [l for s in json.load(open(HERE / "script.json"))["scenes"] for l in s["lines"]]
out = HERE / "voice"; out.mkdir(exist_ok=True)
for i, line in enumerate(lines):
    f = out / f"line{i:02d}.mp3"
    if f.exists() and "--force" not in sys.argv:
        continue
    body = {"text": line["tts"], "model_id": MODEL, "language_code": "fa",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "style": 0.2, "use_speaker_boost": True}}
    if MODEL.startswith("eleven_multilingual") or MODEL.startswith("eleven_turbo"):   # request stitching
        body["previous_text"] = lines[i - 1]["tts"] if i else None
        body["next_text"] = lines[i + 1]["tts"] if i + 1 < len(lines) else None
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128",
        data=json.dumps(body).encode(), method="POST",
        headers={"xi-api-key": KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            f.write_bytes(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"line {i}: HTTP {e.code} {e.read()[:400]!r}")
    print(f"line {i:02d} ok ({f.stat().st_size // 1024} KB)")
