#!/bin/bash
# Drives the real Concat window on :99 and records it.
export DISPLAY=:99
OUT=$1
S=/tmp/claude-0/-home-user-kuiohhu/2b5fae34-061e-5fed-9d9e-8d71812edf02/scratchpad
mv_click(){ xdotool mousemove --sync $1 $2; sleep 0.35; xdotool click 1; }
ffmpeg -v error -y -f x11grab -framerate 30 -draw_mouse 1 -video_size 1920x1080 -i :99 -c:v libx264 -preset ultrafast -crf 16 -pix_fmt yuv420p "$OUT" &
FF=$!
date +%s.%N > $S/tour_t0
mark(){ echo "$(date +%s.%N) $1" >> $S/tour_marks; }
: > $S/tour_marks
sleep 2; mark start
mv_click 1362 715; sleep 1.5; mark fit           # fit timeline
mv_click 1015 631; mark play; sleep 9            # play
mv_click 1015 631; mark pause; sleep 1
mv_click 340 1030; mark select_b; sleep 3         # select clip_b -> inspector
mv_click 226 65; mark transitions; sleep 2.5
mv_click 284 65; mark effects; sleep 2.5
mv_click 331 65; mark filters; sleep 2.5
mv_click 122 65; mark text; sleep 2.5
xdotool mousemove --sync 800 900; for i in $(seq 8); do xdotool click 4; sleep 0.1; done; mark scroll_up; sleep 1.5
mv_click 360 828; mark select_fa; sleep 3          # Persian title
mv_click 1734 16; mark export; sleep 4             # export dialog
xdotool key Escape; mark end; sleep 1.5
kill -INT $FF; wait $FF
