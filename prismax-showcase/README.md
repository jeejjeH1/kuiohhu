# PrismaX Community Website Showcase (motion graphic)

A 77-second, 16:9 (1920×1080, 30 fps) motion graphic with a synced soundtrack, made for the X/Twitter post announcing the PrismaX Community Website Showcase: 15 community-built websites.

**Final video:** `prismax_showcase_16x9.mp4` (H.264 High + AAC, faststart, ready to upload to X)

## Storyboard
| Time | Scene |
|---|---|
| 0–6s | 3D P(x) tile flies in from depth → "Gprisma everyone · PrismaX Community Website Showcase · Live now" |
| 6–10s | "15 websites. All built by the community." A 3D ring of all 15 sites rises and spins |
| 10–65.5s | 4 category cards plus 15 site scenes. The ring unfolds into a 3D phone track. Each site gets its name, its creator and a one-line description, with a 15-step progress bar |
| 65.5–72.5s | The phones fold back into the ring: "What stands out is the range…" |
| 72.5–77s | End card: Prisma(x) wordmark, "Community Website Showcase" |

Order and credits, as in the post:
Tools & Utilities: PrismaX Web (RomRom), Content Maker (Ayush), PX Compass (0xAetherion).
Robotics & Learning: RoboLens (Feurimas), Robot Arm Simulator (DON), Knowledge Center (Jahid), Inside Teleoperation (ADELKHATER).
Games & Interactive: PrismaX Live Quiz (Hellish), RUN Franklin's RUN (MiKE), Baby Franklin Games (Dazai).
Community & Creative: Identify Top Contributors (Byakuya), Ambassador Hall (tunct; plays the screen recording), 3D Community Showcase (Jason), Nexus Hub (SYNTH), Atlas (Arnab).

## Brand
Colors from the PrismaX brand page: Cream `#DFD8D0`, White `#FFFFFF`, Black `#202020`, Gold `#B9986A`, Bronze `#B56654`, Brown `#7A6B5A`. Cream and near-black carry the brand; gold and bronze are accents only.
Type: a serif for headlines (Instrument Serif), a sans for everything else (Inter), with JetBrains Mono for small labels.
The Prisma(x) wordmark and the P(x) mark are traced to vectors from the supplied assets (`assets/logos.js`).

## Rebuild
```bash
python3 prep_assets.py <uploads_dir>   # -> assets/shots, assets/clip, assets/logos.js (crops + logo tracing)
python3 audio.py                       # -> out/audio.wav (procedural score + SFX, needs numpy + scipy)
node render.js video 4                 # -> out/video_noaudio.mp4 (Playwright + Chromium, 4 workers)
node render.js preview 12.5 40         # -> preview/t*.png stills for checking frames
ffmpeg -i out/video_noaudio.mp4 -i out/audio.wav -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart prismax_showcase_16x9.mp4
```
Every frame is deterministic: `motion.js` exposes `render(t)` and draws the whole timeline as a function of time. The timeline (intro 10s, category cards 1.5s, sites 3.3s each) is mirrored in `audio.py`.
