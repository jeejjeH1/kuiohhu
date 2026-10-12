# KAST — "Bridging crypto and the real world" (motion graphic)

A 70-second, 16:9 (1920×1080, 30 fps) motion graphic with a synced soundtrack, made for an X/Twitter post about @KASTxyz.

**Final video:** `kast_motion_16x9.mp4` (H.264 High + AAC, faststart, ready to upload to X)

## Storyboard
| Time | Scene |
|---|---|
| 0–7s | Hook: "How do we bridge the gap between crypto and the real world?" |
| 7–13s | Two worlds (on-chain vs. real world) and a bridge that breaks |
| 13–22s | The everyday friction: wallets, swaps, fees, spending → "make digital assets useful" |
| 22–28s | "This is where KAST comes in": logo reveal with the drop |
| 28–50s | 4 pillars: payments (card tap → approved), stablecoins (stable vs. volatile), global (globe + routes), simplicity (complexity → one "Pay" tap) |
| 50–58s | The bigger picture: card lineup, then two worlds bridged by KAST |
| 58–70s | Closing message + end card (logo, @KASTxyz, disclaimer) |

## Brand
Colors from the KAST brand page: Black `#0C0C0E`, White `#FFFFFF`, Greys `#CFCFCF` / `#C5C7CA` / `#AFAFB2`, Mint `#1EB997`.
The K mark is redrawn as a vector; the card art and the mint glow texture are in `assets/`.

## Rebuild
```bash
python3 audio.py                 # -> out/audio.wav (procedural score + SFX, needs numpy + scipy)
node render.js video 4           # -> out/video_noaudio.mp4 (Playwright + Chromium, 4 workers)
node render.js preview 25.1 47.7 # -> preview/t*.png stills for checking frames
node render.js range 750 870 out/seg.mp4  # re-render a frame range only
ffmpeg -i out/video_noaudio.mp4 -i out/audio.wav -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart kast_motion_16x9.mp4
```
Every frame is deterministic: `motion.js` exposes `render(t)` and draws the whole timeline as a function of time.
