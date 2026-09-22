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
for s in hover click brush legend export; do
  frames="/tmp/home-gifs/$s"
  rm -rf "$frames"
  node "$E2E/home_feature_gifs.mjs" "$BASE" "$s" "$frames"
  "$ROOT/docs/dev/readme-demo/assemble.sh" "$frames" "$OUT/$s.gif"
done
ls -la "$OUT"
