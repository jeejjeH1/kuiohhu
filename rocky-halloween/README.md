# ROCKY Halloween: "MAGNITUDE 10.31"

A 32-second, 4:5 (1080×1350, 30 fps) Halloween short for #ROCKYHalloween.
On Halloween night, a seismic station picks up tremors that keep getting closer. They turn out to be Rocky's footsteps. After all the fear, he only came for candy.

**Final video:** `rocky_halloween_magnitude_1031.mp4` (H.264 + AAC, −14 LUFS, faststart, ready for X)
**Poster:** `poster.jpg` (Rocky lit up, plus the title)

## Storyboard
| Time | Shot | Camera | Sound |
|---|---|---|---|
| 0–2.3s | Macro on the seismograph pen, display `0.00` | Pull-back to the wide room | Clock ticks, lamp hum, wind |
| 2.3s / 4.5s / 6.3s | Thumps getting closer (`1.42` → `3.18` → `4.87`). The clock stops, candies hop, one falls off. | Slow push-in | Sub thumps, candy rattle |
| 7.7–9.6s | Needle goes wild (`7.62 STRONG EVENT`) | Close-up on the pen | Needle scratch, rising drone |
| 9.6–11s | Red alarm: `MAGNITUDE 10.31` / `DETECTED` | Close-up on the display | Alarm beeps |
| 11s | Biggest thump: the lamp bulb pops | Impact shake + chromatic aberration (wide) | Boom, glass |
| 12–14s | The paper spits out (only chaotic lines). The alarm powers down. | Tight on the paper | Power-down |
| 14–15s | Black | | **Total silence** |
| 15–20s | Rocky outside the door: eyes → Seismic mark on his chest → seams ignite like a jack-o'-lantern. Clouds part from the full moon. | Low angle, **dolly zoom** (moon 2.4×, trees 2×, door frame 1.35×) | Shimmer, stone cracking, growl |
| 20–23.9s | Tilt down to a tiny pumpkin bucket: "Trick… / …or treat." He shakes it. | Tilt down | **Near silence**, then the voice |
| 23.9–24.9s | `MAGNITUDE 0.01` / `CANDY DETECTED` | Close-up | Tiny beep (J-cut) |
| 24.9–27.9s | Pull back from the helicorder sheet: the tremor rows form the Seismic logo, and its seams glow | **Signature shot**: scale reveal, with the logo held 1.1s | Music box (J-cut), riser, hit |
| 27.9–32s | End card: logo, `MAGNITUDE 10.31`, `#ROCKYHalloween`, footsteps receding on a live trace | Held 4.1s | Hit, motif, fading thumps |

## Craft notes (from the referenced skills)
- **Motion Prompt:** #024 Impact shake is used once, on the biggest hit. #032 Dolly zoom is the reveal. #111 Chromatic aberration is a short hit on the two biggest impacts only. The attribution lines are in `motion.js`.
- **video-shotcraft rules:**
  - Whole-frame impacts are limited to 3.
  - Key info and the logo hold at least 1s.
  - The subtitle is over 56px tall.
  - Every visible action has its own foley.
- **Lemo-Opuscar director guide:**
  - Hook in the first 3s (macro pull-back, first thump at 2.3s).
  - Thumps accelerate.
  - Two real silences, the first sound after each one matters, and two J-cuts.
  - At least four camera moves, and one signature shot.
  - Subtitles held at least 1.8s, end card at least 4s, −14 LUFS.
- **Dioramas engine:** a volumetric lamp beam with drifting dust, plus a bloom/grain/vignette post stack.

## Rebuild
```bash
pip install numpy scipy
python3 audio.py                 # -> out/audio.wav
node render.js video 4           # -> out/video_noaudio.mp4 (Playwright + Chromium)
node render.js preview 8.5 18.2  # -> preview/t*.png stills
ffmpeg -i out/video_noaudio.mp4 -i out/audio.wav -c:v copy -af loudnorm=I=-14:TP=-1:LRA=11 -c:a aac -b:a 256k -ar 48000 \
  -shortest -movflags +faststart rocky_halloween_magnitude_1031.mp4
```
Every frame is deterministic: `motion.js` exposes `render(t)` (and `renderPoster()`) and draws the whole timeline as a function of time.

See `CREDITS` for fonts, the voice engine, and the ported motion formulas with their licences.
