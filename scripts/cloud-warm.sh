#!/usr/bin/env bash
# Lazily warm what a task needs, instead of paying for it at every session start.
# Idempotent: re-running `julia` on a warm machine takes ~10 s (npm ci always reinstalls).
#
#   scripts/cloud-warm.sh [julia] [julia-fetch] [frontend] [e2e]     (no args = julia)
#
#   julia     Shared dev env at $MASQUE_DEV_ENV: Masque (dev'd from this checkout)
#             + every [deps]/[extras] package in Project.toml + Pluto 0.20, precompiled
#             (~11 min cold, ~8.5 after the setup script's julia-fetch). One env serves both the
#             unit tests (`julia --project="$MASQUE_DEV_ENV" test/runtests.jl`) and the kind-sweep
#             notebooks, which read MASQUE_DEV_ENV. Unlike CI's kind-sweep step (CairoMakie,
#             WGLMakie, JSON3 only), every dep is a direct dep here, because the test files
#             `using` [extras] and indirect deps (Makie, FileIO, …) that `using` can't see.
#   julia-fetch  The same env resolved and downloaded, not precompiled (~2.5 min). The cloud
#             environment's setup script runs it, because the cloud snapshots the setup's
#             files for later sessions only when the whole script ends within ~5 min, and
#             precompiling takes longer. Its lines, after installing Julia, the registry, Runic:
#               git clone -q --depth 1 https://github.com/jowch/Masque.jl /tmp/masque-setup &&
#                   bash /tmp/masque-setup/scripts/cloud-warm.sh julia-fetch || true
#               rm -rf /tmp/masque-setup
#             The env then points at the deleted clone until a session runs `julia`.
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
        julia | julia-fetch)
            mkdir -p "$DEV_ENV"
            # JULIA_NOSYSIMAGE=1: a sysimage wrapper (e.g. the Cursor image) would preload
            # CairoMakie + Masque; a no-op for stock julia. JULIA_PKG_PRECOMPILE_AUTO=0: precompile
            # once, after the last add; per-add precompiles built Makie twice, since adding Pluto
            # downgrades HTTP and Bonito under it (~6 min lost). REPO goes in via ARGS, not
            # string interpolation, so any checkout path is safe.
            JULIA_NOSYSIMAGE=1 JULIA_PKG_PRECOMPILE_AUTO=0 julia --project="$DEV_ENV" -e '
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
                ARGS[2] == "julia" && Pkg.precompile()
            ' "$REPO" "$target"
            echo "$target env ready: $DEV_ENV"
            ;;
        frontend)
            (cd "$REPO/frontend" && npm ci)
            ;;
        e2e)
            (cd "$REPO/test/e2e" && npm install)
            # The cloud image preinstalls one Chromium build under PLAYWRIGHT_BROWSERS_PATH, and
            # test/e2e pins the Playwright whose build matches it, so nothing is downloaded.
            # Check the match, and say what is missing before falling back to a download.
            browsers="${PLAYWRIGHT_BROWSERS_PATH:-}"
            if [ -n "$browsers" ] && [ -d "$browsers" ]; then
                rev="$(node -p 'require(process.argv[1]).browsers.find(b => b.name === "chromium").revision' \
                    "$REPO/test/e2e/node_modules/playwright-core/browsers.json" 2>/dev/null || true)"
                if [ -d "$browsers/chromium-$rev" ] && [ -d "$browsers/chromium_headless_shell-$rev" ]; then
                    echo "Chromium build $rev already in $browsers; skipping download"
                    continue
                fi
                if [ -d "$browsers/chromium-$rev" ]; then
                    echo "$browsers has chromium-$rev but not chromium_headless_shell-$rev;" \
                        "downloading the missing build." >&2
                else
                    echo "test/e2e's Playwright wants Chromium build ${rev:-?}; $browsers has:" \
                        "$(cd "$browsers" && ls -d chromium-* chromium_headless_shell-* 2>/dev/null | tr '\n' ' ')" >&2
                    echo "Pin test/e2e/package.json to the Playwright release matching that build" \
                        "(see CLAUDE.md, Cloud sessions). Trying a download anyway." >&2
                fi
            fi
            (cd "$REPO/test/e2e" && npx playwright install --with-deps chromium)
            ;;
        *)
            echo "unknown target: $target (expected julia, julia-fetch, frontend, e2e)" >&2
            exit 2
            ;;
    esac
done
echo "== cloud-warm: done"
