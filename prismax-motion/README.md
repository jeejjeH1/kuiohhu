# PrismaX — "More data ≠ better learning" (cinematic motion piece)

An 88-second, 16:9 (1920×1080, 30 fps) cinematic motion graphic with voiceover, score and sound design, made for an X/Twitter post about PrismaX and the quality of robotics training data.

**Final video:** `prismax_motion_16x9.mp4` (H.264 High + AAC 48 kHz, faststart, ready to upload to X)

## Storyboard
| Time | Chapter | What happens |
|---|---|---|
| 0–9s | (01) The question | Millions of data points stream into a cloud. "Does collecting more data always lead to smarter AI?" Hard cut and hit: "Not necessarily." The cloud collapses, and a slit of gold light opens into 3D. |
| 9–25s | (02) Quantity | A 3D robot arm repeats a pick-and-place, sped up like a time-lapse (episode counter to 4,812). Bronze ghost arms show incorrect movements, a grasp fails and the cube drops, then the camera cranes up over 77 identical cells. "More data ≠ better learning", with a data-vs-learning chart. |
| 25–35s | (03) Quality | A cream studio. "Accurate. Diverse. Relevant.": a precise placement on target (0.4 mm), diverse objects and planned trajectories, skill chips, then an unseen object (a torus knot) grasped successfully. |
| 35–47s | (04) The physical world | Letterboxed and dark: a macro grasp, a push with force vectors, a 6-DoF pose tracker, and a montage of six changing environments that builds into a riser. |
| 47–57s | (05) PrismaX | A white beam hits a prism and splits into the brand colours, which converge into the wordmark. Then the pipeline: Collect → Evaluate (scored episode cards, rejects drop away) → Train (Physical AI) → real world. |
| 57–71s | (06) Balance | "Quality alone isn't enough": one card becomes a grid (quantity), the grid diversifies, skills appear, and everything collapses into the Quality / Quantity / Diversity triangle with a balance point. |
| 71–81s | (07) The future | A neural lattice grows ("larger models") and then collapses into one gold point ("the quality of the experiences"). |
| 81–88s | End card | The gold point becomes the dot of the "i" and the wordmark is revealed around it. "Quality data for Physical AI." and prismax.ai. |

## Brand
Colours are from the PrismaX brand kit: Cream `#DFD8D0`, White `#FFFFFF`, Black `#202020`, Gold `#B9986A`, Bronze `#B56654`, Brown `#7A6B5A`. Gold means good data and bronze means bad data throughout.

The wordmark (`assets/wordmark.svg`) was vectorised from the brand-kit screenshots. Two samples were averaged and traced with potrace, and the small "(x)" was redrawn by hand.

The brand faces (Editorial New, Catalogue) are commercially licensed, so the piece uses close open substitutes: **Instrument Serif** for headlines, **Instrument Sans** for UI and **IBM Plex Mono** for labels (`assets/fonts`). Swap in the licensed fonts in `assets/fonts.css` if you have them.

## Voice
The narration is generated locally with Kokoro TTS (voice `af_heart`, speed 0.92) from `vo/lines.txt`. Word timestamps from faster-whisper (`vo/words.json`) drive the kinetic typography, so each word appears as it is spoken. The final mix was transcribed back with whisper to check that the voice stays intelligible over the score.

## Rebuild
```bash
pip install kokoro-onnx soundfile scipy faster-whisper
KOKORO_DIR=/path/to/kokoro python3 vo/tts.py af_heart 0.92   # -> vo/*.wav (needs kokoro-v1.0.onnx + voices-v1.0.bin)
python3 vo/align.py                                           # -> vo/words.json
python3 audio.py                                              # -> out/audio.wav (score + SFX + VO, ducked & mastered)
npm install && node render.js video 4                         # -> out/video_noaudio.mp4 (Playwright + Chromium/SwiftShader WebGL)
node render.js preview 12 48.5 84                             # -> preview/t*.png stills
ffmpeg -i out/video_noaudio.mp4 -i out/audio.wav -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart prismax_motion_16x9.mp4
```
Every frame is deterministic. `js/motion.js` exposes `render(t)` and draws the DOM/2D layers, and `js/scene3d.js` poses the three.js scene (robot-arm IK, pick-and-place cycles, the grid, the lattice) as a pure function of time. `timeline.json` holds the VO start times shared by the visuals and the audio.
