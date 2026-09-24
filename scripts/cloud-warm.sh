#!/usr/bin/env bash
# Lazily warm what a task needs, instead of paying for it at every session start.
# Idempotent: re-running `julia` on a warm machine takes ~10 s (npm ci always reinstalls).
#
#   scripts/cloud-warm.sh [julia] [frontend] [e2e]     (no args = julia)
#
#   julia     Shared dev env at $MASQUE_DEV_ENV: Masque (dev'd from this checkout)
#             + every [deps]/[extras] package in Project.toml + Pluto 0.20, precompiled
#             (~7 min cold). One env serves both the unit tests
#             (`julia --project="$MASQUE_DEV_ENV" test/runtests.jl`) and the kind-sweep
#             notebooks, which read MASQUE_DEV_ENV. Unlike CI's kind-sweep step (CairoMakie,
#             WGLMakie, JSON3 only), every dep is a direct dep here, because the test files
#             `using` [extras] and indirect deps (Makie, FileIO, …) that `using` can't see.
#   frontend  `npm ci` in frontend/.
#   e2e       `npm install` + the Chromium build matching test/e2e's pinned Playwright
#             (already preinstalled on the cloud image: no download, see CLAUDE.md).
#
# Start it in the background at the beginning of a task and read code meanwhile:
#   scripts/cloud-warm.sh julia > /tmp/masque-warm.log 2>&1 &
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_ENV="${MASQUE_DEV_ENV:-$HOME/.julia/environments/masque-dev}"
[ "$#" -gt 0 ] || set -- julia

for target in "$@"; do
    echo "== cloud-warm: $target"
    case "$target" in
        julia)
            mkdir -p "$DEV_ENV"
            # JULIA_NOSYSIMAGE=1: a sysimage wrapper (e.g. the Cursor image) would preload
            # CairoMakie + Masque; a no-op for stock julia. REPO goes in via ARGS, not
            # string interpolation, so any checkout path is safe.
            JULIA_NOSYSIMAGE=1 julia --project="$DEV_ENV" -e '
                using Pkg, TOML
                repo = ARGS[1]
                Pkg.develop(path = repo)
                # Tests import deps directly, so the env needs what Pkg.test() would give:
                # [deps] + [extras], read from Project.toml so it never drifts.
                p = TOML.parsefile(joinpath(repo, "Project.toml"))
                Pkg.add(sort!(collect(union(keys(p["deps"]), keys(get(p, "extras", Dict()))))))
                # Pluto pinned to the 0.20 series test/e2e/serve.jl installs, so that server
                # reuses this precompile cache whenever it resolves the same versions.
                Pkg.add(Pkg.PackageSpec(name = "Pluto", version = "0.20"))
                Pkg.precompile()
            ' "$REPO"
            echo "julia env ready: $DEV_ENV"
            ;;
        frontend)
            (cd "$REPO/frontend" && npm ci)
            ;;
        e2e)
            (cd "$REPO/test/e2e" && npm install)
            # The cloud image preinstalls one Chromium build under PLAYWRIGHT_BROWSERS_PATH, and
            # test/e2e pins the Playwright whose build matches it, so nothing is downloaded.
            # Check the match, and say which pin is stale before falling back to a download.
            browsers="${PLAYWRIGHT_BROWSERS_PATH:-}"
            if [ -n "$browsers" ] && [ -d "$browsers" ]; then
                rev="$(node -p 'require(process.argv[1]).browsers.find(b => b.name === "chromium").revision' \
                    "$REPO/test/e2e/node_modules/playwright-core/browsers.json" 2>/dev/null || true)"
                if [ -d "$browsers/chromium-$rev" ] && [ -d "$browsers/chromium_headless_shell-$rev" ]; then
                    echo "Chromium build $rev already in $browsers; skipping download"
                    continue
                fi
                echo "test/e2e's Playwright wants Chromium build ${rev:-?}; $browsers has:" \
                    "$(cd "$browsers" && ls -d chromium-* 2>/dev/null | tr '\n' ' ')" >&2
                echo "Pin test/e2e/package.json to the Playwright release matching that build" \
                    "(see CLAUDE.md, Cloud sessions). Trying a download anyway." >&2
            fi
            (cd "$REPO/test/e2e" && npx playwright install --with-deps chromium)
            ;;
        *)
            echo "unknown target: $target (expected julia, frontend, e2e)" >&2
            exit 2
            ;;
    esac
done
echo "== cloud-warm: done"
