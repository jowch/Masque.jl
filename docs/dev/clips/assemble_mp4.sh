#!/bin/bash
# Assemble a docs clip (MP4, H.264) from the frames + timestamps.json that a recorder such as
# test/e2e/cluster_clip.mjs writes. Frames keep their captured pacing: a pause in the clip is
# Julia recomputing the cell, which is the point of showing a live notebook. The clip keeps the
# recorder's 2x width, so a Retina screen shows the UI text sharp; -tune animation suits the
# flat colors and still frames of a screen recording.
#
#   docs/dev/clips/assemble_mp4.sh <frames-dir> <out.mp4> [last-frame-ms]
#
# The last frame holds 1500 ms by default; a short loop that ends where it starts passes 40.
set -euo pipefail
FRAMES_DIR="$(realpath "$1")"
OUT="$2"
HOLD_MS="${3:-1500}"
CONCAT="$FRAMES_DIR/concat.txt"

python3 - "$FRAMES_DIR" "$CONCAT" "$HOLD_MS" <<'PYEOF'
import json, sys, os
frames_dir, out_path, hold = sys.argv[1], sys.argv[2], float(sys.argv[3])
ts = json.load(open(os.path.join(frames_dir, "timestamps.json")))
lines = []
for i, f in enumerate(ts):
    dur = (ts[i + 1]["t"] - f["t"]) if i + 1 < len(ts) else hold
    lines.append(f"file '{os.path.join(frames_dir, f['file'])}'")
    lines.append(f"duration {max(dur, 20) / 1000:.4f}")
# The concat demuxer drops the last duration unless the final file is listed once more.
lines.append(f"file '{os.path.join(frames_dir, ts[-1]['file'])}'")
open(out_path, "w").write("\n".join(lines) + "\n")
print(f"{len(ts)} frames over {ts[-1]['t'] / 1000:.1f}s")
PYEOF

ffmpeg -y -loglevel error -f concat -safe 0 -i "$CONCAT" \
  -vf "fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0,format=yuv420p" \
  -c:v libx264 -preset slow -tune animation -crf 22 -movflags +faststart -an "$OUT"
ls -la "$OUT"
