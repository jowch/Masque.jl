#!/bin/bash
# Record every Home feature GIF. Docs must already be served at BASE.
#
#   docs/dev/home-gifs/record-all.sh [base-url]
set -euo pipefail
ROOT="$(realpath "$(dirname "$0")/../../..")"
BASE="${1:-http://localhost:8765}"
E2E="$ROOT/test/e2e"
OUT="$ROOT/docs/src/assets/home"
mkdir -p "$OUT"
cd "$E2E"
for s in hover click brush legend; do
  frames="/tmp/home-gifs/$s"
  rm -rf "$frames"
  node "$E2E/home_feature_gifs.mjs" "$BASE" "$s" "$frames"
  "$ROOT/docs/dev/readme-demo/assemble.sh" "$frames" "$OUT/$s.gif"
done
# Orbit is a live Pluto drag (ViewInteractable streams cairo frames).
# Requires a Pluto server: MASQUE_DEV_ENV=... julia test/e2e/serve.jl 1240
PLUTO="${MASQUE_ORBIT_PLUTO:-http://localhost:1240}"
frames="/tmp/home-gifs/orbit"
rm -rf "$frames"
node "$E2E/home_orbit_gif.mjs" "$PLUTO" \
  "$ROOT/docs/dev/home-gifs/orbit_notebook.jl" "$frames"
"$ROOT/docs/dev/readme-demo/assemble.sh" "$frames" "$OUT/orbit.gif"
ls -la "$OUT"
