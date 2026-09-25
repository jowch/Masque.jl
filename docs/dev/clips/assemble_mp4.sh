#!/bin/bash
# Assemble a docs clip (MP4, H.264) from the frames + timestamps.json that a recorder such as
# test/e2e/cluster_clip.mjs writes. Frames keep their captured pacing: a pause in the clip is
# Julia recomputing the cell, which is the point of showing a live notebook.
#
#   docs/dev/clips/assemble_mp4.sh <frames-dir> <out.mp4>
set -euo pipefail
FRAMES_DIR="$(realpath "$1")"
OUT="$2"
CONCAT="$FRAMES_DIR/concat.txt"

python3 - "$FRAMES_DIR" "$CONCAT" <<'PYEOF'
import json, sys, os
frames_dir, out_path = sys.argv[1], sys.argv[2]
ts = json.load(open(os.path.join(frames_dir, "timestamps.json")))
lines = []
for i, f in enumerate(ts):
    dur = (ts[i + 1]["t"] - f["t"]) if i + 1 < len(ts) else 1500
    lines.append(f"file '{os.path.join(frames_dir, f['file'])}'")
    lines.append(f"duration {max(dur, 20) / 1000:.4f}")
# The concat demuxer drops the last duration unless the final file is listed once more.
lines.append(f"file '{os.path.join(frames_dir, ts[-1]['file'])}'")
open(out_path, "w").write("\n".join(lines) + "\n")
print(f"{len(ts)} frames over {ts[-1]['t'] / 1000:.1f}s")
PYEOF

ffmpeg -y -loglevel error -f concat -safe 0 -i "$CONCAT" \
  -vf "fps=30,scale=720:-2:flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset slow -crf 24 -movflags +faststart -an "$OUT"
ls -la "$OUT"
