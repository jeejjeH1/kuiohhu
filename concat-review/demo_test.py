import sys, json, os, shutil, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp import MCP
OUT = "/root/concat-demo"; M = OUT + "/media"
proj = OUT + "/Demo Reel"
if os.path.exists(proj): shutil.rmtree(proj)
os.makedirs(OUT + "/frames", exist_ok=True)
log = []
m = MCP(log)
J = lambda x: json.loads(x) if isinstance(x, str) and x.strip().startswith(("{","[")) else x
m.call("concat_version")
r = J(m.call("project_create", location=OUT, name="Demo Reel"))
ids = {}
for f in ["clip_a.mp4", "clip_b.mp4", "clip_c.mp4", "music.m4a"]:
    r = J(m.call("media_import", path=proj, file=f"{M}/{f}"))
    ids[f] = r.get("createdId") if isinstance(r, dict) else None
print("ids", ids)
m.call("media_probe", path=proj, file=f"{M}/clip_a.mp4") if False else None
r = J(m.call("clips_add_sequence", path=proj, mediaIds=[ids["clip_a.mp4"], ids["clip_b.mp4"], ids["clip_c.mp4"]], start=0))
tl = J(m.call("timeline_read", path=proj))
json.dump(tl, open(OUT + "/timeline_before.json", "w"), indent=1, ensure_ascii=False)
A, B, C = "c5", "c6", "c7"
# music on its own lane
r = J(m.call("clip_add", path=proj, mediaId=ids["music.m4a"], trackId="T4", start=0))
music = r["createdId"]
# cut: split the last clip at 14s and drop the tail
r = J(m.call("clips_split", path=proj, clipIds=[C], time=14.0))
tail = [c["id"] for c in r["timeline"]["clips"] if c["start"] >= 13.99 and c["kind"] == "video"]
m.call("clips_remove", path=proj, clipIds=tail)
m.call("clip_trim", path=proj, clipId=music, edge="end", delta=-2.0)
# transitions
m.call("clip_update", path=proj, clipId=B, patch={"transitionIn": {"id": "concat.dissolve", "duration": 0.8}})
m.call("clip_update", path=proj, clipId=C, patch={"transitionIn": {"id": "concat.glitch-transition", "duration": 0.6}})
# a look on clip B, fades on music
m.call("clip_update", path=proj, clipId=B, patch={"videoEffects": [{"id": "concat.neon", "params": {}}]})
m.call("clip_update", path=proj, clipId=music, patch={"fadeOut": 2.0, "fadeIn": 0.5})
# keyframes: slow zoom on A, rotation+scale on C
m.call("keyframe_set", path=proj, clipId=A, property="scale", at=0, value=1.0)
m.call("keyframe_set", path=proj, clipId=A, property="scale", at=1, value=1.35, ease=[0.4, 0, 0.2, 1])
m.call("keyframe_set", path=proj, clipId=C, property="scale", at=0, value=0.8)
m.call("keyframe_set", path=proj, clipId=C, property="scale", at=1, value=1.0, ease=[0.2, 0.8, 0.2, 1])
# effect layer over the end
m.call("effect_layer_add", path=proj, start=10.0, duration=4.0, effectId="concat.film-grain", name="Grain")
# titles: English + Persian (RTL test)
m.call("title_add", path=proj, start=0.3, duration=4.4, above=True,
       style={"content": "Concat", "fontSize": 0.16, "fontWeight": 800, "color": "#FFFFFF", "strokeWidth": 0.0})
m.call("title_add", path=proj, start=0.9, duration=3.8, above=True, offsetY=0.16,
       style={"content": "free · open-source · local", "fontSize": 0.045, "fontWeight": 500, "color": "#DDE6FF"})
m.call("title_add", path=proj, start=5.4, duration=4.3, above=True,
       style={"content": "ویرایشگر ویدیوی رایگان و متن‌باز", "fontSize": 0.08, "fontWeight": 700, "color": "#FFFFFF", "background": "#0568FDcc"})
m.call("captions_add", path=proj, captions=[
    {"start": 10.3, "end": 12.0, "text": "No watermark. No account."},
    {"start": 12.0, "end": 14.0, "text": "Rendered by Concat via MCP"}])
# undo / redo check
m.call("clip_speed", path=proj, clipId=B, speed=2.0)
m.call("edit_undo", path=proj)
tl = J(m.call("timeline_read", path=proj))
json.dump(tl, open(OUT + "/timeline_after.json", "w"), indent=1, ensure_ascii=False)
m.call("project_save", path=proj)
for t in [0.4, 2.5, 4.6, 5.3, 7.5, 10.2, 11.0, 13.0]:
    m.call("preview_frame", path=proj, time=t, output=f"{OUT}/frames/f_{t:05.2f}.png", width=1920, height=1080)
t0 = time.time()
r = J(m.call("export_start", path=proj, output=OUT + "/demo_reel.mp4"))
job = r.get("job") if isinstance(r, dict) else r
st = J(m.call("export_wait", job=job, timeoutSeconds=600))
print("EXPORT seconds", time.time() - t0)
m.close()
json.dump(log, open(OUT + "/mcp_log.json", "w"), indent=1, ensure_ascii=False)
