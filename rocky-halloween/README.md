# ROCKY Halloween: "MAGNITUDE 10.31"

A 30-second, 4:5 (1080×1350, 30 fps) Halloween short for #ROCKYHalloween.
On Halloween night, a seismic station picks up strange tremors. They turn out to be Rocky's footsteps. After all the fear, he only came for candy.

**Final video:** `rocky_halloween_magnitude_1031.mp4` (H.264 + AAC, faststart, ready to upload to X)

## Storyboard
| Time | Scene |
|---|---|
| 0–3.4s | Dark station, desk lamp, flat seismograph line, pumpkin candy bowl, sign `SEISMIC STATION — OCT 31`, clock at 23:58 |
| 3.4s | First thump: candies hop, small spike, display `2.14`. The wall clock stops. |
| 6.3–9.6s | Louder thumps: a candy falls, lamp flickers, dust falls, close-up of the needle going wild |
| 9.6–11s | Red alarm: `MAGNITUDE 10.31` / `DETECTED` |
| 11s | Biggest thump: the lamp bulb pops, only red light is left |
| 12–14s | The paper spits out. Close-up shows only chaotic tremor lines. The alarm powers down. |
| 14–15s | Black, total silence |
| 15–20s | Rocky in the doorway: white eyes, then the chest mark, then the seams between his stone plates ignite like a jack-o'-lantern (from feet to head), embers, growl |
| 20–23.6s | Tilt down to a tiny pumpkin bucket in his fist: "Trick… or treat." He shakes it. |
| 23.6–24.6s | Display: `MAGNITUDE 0.01` / `CANDY DETECTED` |
| 24.6–27.3s | Pull back from the helicorder sheet: the stacked tremor rows form the Seismic logo, and its seams glow |
| 27.3–30s | End card: logo with glowing seams, `MAGNITUDE 10.31`, `#ROCKYHalloween`, Rocky's footsteps receding on a live trace |

## Rebuild
```bash
pip install numpy scipy
python3 audio.py                 # -> out/audio.wav (procedural sound design + Rocky's voice)
node render.js video 4           # -> out/video_noaudio.mp4 (Playwright + Chromium)
node render.js preview 8.5 18.2  # -> preview/t*.png stills
ffmpeg -i out/video_noaudio.mp4 -i out/audio.wav -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart rocky_halloween_magnitude_1031.mp4
```
Every frame is deterministic: `motion.js` exposes `render(t)` and draws the whole timeline as a function of time.

## Assets
- `assets/fonts/`: Creepster, Special Elite, Oswald (Google Fonts, OFL/Apache licensed)
- `assets/voice_raw.wav`: "Trick, or treat." synthesized with Piper (en_US ryan high). `audio.py` pitches it down and layers it into Rocky's voice.
- `assets/seismic-logo-ref.png`: logo reference. The facet polygons in `motion.js` were extracted from it.
- Rocky is redrawn as vector stone plates, based on the community's Rocky design. No artist's image is embedded.
