#!/bin/bash
# Record every Home feature loop. Docs must already be served at BASE.
#
#   docs/dev/home-gifs/record-all.sh [base-url]
set -euo pipefail
ROOT="$(realpath "$(dirname "$0")/../../..")"
BASE="${1:-http://localhost:8765}"
E2E="$ROOT/test/e2e"
OUT="$ROOT/docs/src/assets/home"
ASSEMBLE="$ROOT/docs/dev/clips/assemble_webp.py"
mkdir -p "$OUT"
cd "$E2E"
for s in hover legend; do
  frames="/tmp/home-gifs/$s"
  rm -rf "$frames"
  node "$E2E/home_feature_gifs.mjs" "$BASE" "$s" "$frames"
  python3 "$ASSEMBLE" "$frames" "$OUT/$s.webp" --length-ms 8000
done
# Orbit is a live Pluto drag (ViewInteractable streams cairo frames).
# Requires a Pluto server: MASQUE_DEV_ENV=... julia test/e2e/serve.jl 1240
PLUTO="${MASQUE_ORBIT_PLUTO:-http://localhost:1240}"
frames="/tmp/home-gifs/orbit"
rm -rf "$frames"
node "$E2E/home_orbit_gif.mjs" "$PLUTO" \
  "$ROOT/docs/dev/home-gifs/orbit_notebook.jl" "$frames"
# The whole figure moves, so MP4 is a fraction of the size of lossless WebP.
"$ROOT/docs/dev/clips/assemble_mp4.sh" "$frames" "$OUT/orbit.mp4"
ls -la "$OUT"
