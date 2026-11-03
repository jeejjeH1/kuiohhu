"""script.json (+ voice/*.mp3 if present) -> timeline.json with absolute times."""
import json, os, pathlib, subprocess
HERE = pathlib.Path(__file__).resolve().parent
SCRIPT = os.environ.get("SCRIPT", "script.json"); VOICE_DIR = os.environ.get("VOICE_DIR", "voice")
OUT = os.environ.get("TIMELINE", "timeline")
script = json.load(open(HERE / SCRIPT))
REEL = True
GAP, HEAD, TAIL = (0.22, 0.35, 0.55) if REEL else (0.35, 0.7, 0.9)
MIN_SCENE = {"hook": 6.0, "reveal": 5.5, "abilities": 4.6, "noinstall": 4.6, "demo": 10.5, "platforms": 5.0, "setup": 5.0, "cta": 5.4} if REEL else {"intro": 9.0, "gui": 30.0, "result": 15.5, "cta": 7.5}

def dur(i, text):
    f = HERE / VOICE_DIR / f"line{i:02d}.mp3"
    if f.exists():
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                             capture_output=True, text=True).stdout
        return float(out), True
    return len(text) / 13.5 + 0.3, False   # rough Persian speaking rate

t, i, scenes, lines, voiced = 0.0, 0, [], [], 0
for s in script["scenes"]:
    s0 = t; t += HEAD
    for l in s["lines"]:
        d, v = dur(i, l["tts"]); voiced += v
        lines.append({"i": i, "scene": s["id"], "start": round(t, 3), "end": round(t + d, 3), "text": l["text"], "voice": v})
        t += d + GAP; i += 1
    t = max(t - GAP + TAIL, s0 + MIN_SCENE.get(s["id"], 0))
    scenes.append({"id": s["id"], "start": round(s0, 3), "end": round(t, 3)})
total = round(t + 0.5, 3)
json.dump({"duration": total, "fps": 30, "scenes": scenes, "lines": lines}, open(HERE / f"{OUT}.json", "w"), ensure_ascii=False, indent=1)
print(f"{len(lines)} lines ({voiced} voiced), {total:.1f}s")
for s in scenes: print(f"  {s['id']:8s} {s['start']:6.1f} -> {s['end']:6.1f}")
open(HERE / f"{OUT}.js", "w").write("window.TL = " + json.dumps({"duration": total, "fps": 30, "scenes": scenes, "lines": lines}, ensure_ascii=False) + ";\n")
