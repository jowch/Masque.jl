#!/usr/bin/env bash
# Lazily warm what a task needs, instead of paying for it at every session start.
# Idempotent: re-running `julia` on a warm machine takes ~10 s (npm ci always reinstalls).
#
#   scripts/cloud-warm.sh [julia] [frontend] [e2e]     (no args = julia)
#
#   julia     Shared dev env at $MASQUE_DEV_ENV: Masque (dev'd from this checkout)
#             + every [deps]/[extras] package in Project.toml + Pluto, precompiled
#             (~7 min cold). One env serves both the unit tests
#             (`julia --project=$MASQUE_DEV_ENV test/runtests.jl`) and the kind-sweep
#             notebooks, which read MASQUE_DEV_ENV. Mirrors CI's kind-sweep step.
#   frontend  `npm ci` in frontend/.
#   e2e       `npm install` + the Chromium build matching test/e2e's pinned Playwright.
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
            julia --project="$DEV_ENV" -e "
                using Pkg, TOML
                Pkg.develop(path = \"$REPO\")
                # Tests import deps directly, so the env needs what Pkg.test() would give:
                # [deps] + [extras], read from Project.toml so it never drifts. Plus Pluto.
                p = TOML.parsefile(\"$REPO/Project.toml\")
                pkgs = union(keys(p[\"deps\"]), keys(get(p, \"extras\", Dict())), [\"Pluto\"])
                Pkg.add(sort!(collect(pkgs)))
                Pkg.precompile()
            "
            echo "julia env ready: $DEV_ENV (export MASQUE_DEV_ENV=$DEV_ENV if unset)"
            ;;
        frontend)
            (cd "$REPO/frontend" && npm ci)
            ;;
        e2e)
            (cd "$REPO/test/e2e" && npm install && npx playwright install chromium)
            ;;
        *)
            echo "unknown target: $target (expected julia, frontend, e2e)" >&2
            exit 2
            ;;
    esac
done
echo "== cloud-warm: done"
