#!/usr/bin/env bash
# SessionStart hook for Claude Code on the web.
#
# Provisions the two halves of this repo's toolchain independently:
#
#   frontend/ (TypeScript)  — npm registry is in the proxy's no_proxy list. ~4s.
#   Julia                   — needs *.julialang.org to be allowed by the environment's
#                             network policy. The block below probes first, so if the
#                             policy is ever narrowed the hook degrades to a precise
#                             diagnostic instead of a wall of Pkg errors.
#
# Scope is deliberately LEAN, from measured costs on a cold container (4 cores):
#
#   juliaup + Pkg.instantiate() + precompile   6m22s   <- done here
#   @masque-dev (CairoMakie+WGLMakie+Pluto)    5m38s   <- NOT done here
#   first Pkg.test()                           9m37s   <- NOT done here
#   every Pkg.test() after the first           2m54s
#
# Two things are therefore left to pay for on demand, on purpose:
#
#   1. The first `Pkg.test()` in a fresh container costs 9m37s, because Pkg.test() builds
#      its own env from [targets] and precompile caches are keyed by the resolved
#      dependency set. Measured: warming a *different* env (@masque-dev, which also holds
#      Pluto and so resolves differently) does NOT warm it -- run 1 precompiled 285
#      packages, run 2 precompiled 0. Only Pkg.test() itself warms Pkg.test().
#   2. The live-verification sweep (docs/dev/live-interaction-checklist.md) needs Pluto
#      plus both backends in one env. Build it when a sweep is actually needed:
#
#        julia --project=@masque-dev -e 'using Pkg; Pkg.develop(path=pwd()); \
#          Pkg.add(["CairoMakie","WGLMakie","JSON3","Pluto"]); Pkg.precompile()'
#
# Also not done here: the PackageCompiler sysimage (a 20min+ build that saves ~20s per
# invocation once the depot is precompiled), and `npm run build` (CI is the sole author of
# assets/*.js, so building would leave the working tree dirty at session start). Both live
# in .cursor/cloud-agent-install.sh.
#
# Contract: idempotent, non-interactive, and never fatal. A component that cannot be
# provisioned warns and the hook still exits 0 — a failure in one half must not cost you
# the other half.
set -uo pipefail

# Local checkouts are already set up by their owner; only provision cloud sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Async: the session starts immediately and this keeps running in the background. At ~6.5
# minutes cold, blocking session start is not a reasonable trade. The cost is a race —
# anything that shells out to julia before this finishes will not find it — so the log
# lines below matter: they are how you tell whether provisioning has landed yet.
# Timeout is 20min, ~3x the measured cold run, to absorb a slow registry or a loaded host.
echo '{"async": true, "asyncTimeout": 1200000}'

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT"

log()  { printf '[masque-setup] %s\n' "$*"; }
warn() { printf '[masque-setup] WARNING: %s\n' "$*" >&2; }

# Persist an export for the rest of the session (no-op when unset, e.g. manual runs).
persist_env() {
  [ -n "${CLAUDE_ENV_FILE:-}" ] || return 0
  printf '%s\n' "$1" >> "$CLAUDE_ENV_FILE"
}

# --------------------------------------------------------------------------
# 1. Frontend (TypeScript)
# --------------------------------------------------------------------------
setup_frontend() {
  command -v npm >/dev/null 2>&1 || { warn "npm not found; skipping frontend/"; return 1; }
  log "installing frontend/ dependencies (npm install)"
  # `install`, not `ci`: it reuses an existing node_modules from the cached container
  # layer instead of deleting and refetching it on every session.
  ( cd "$ROOT/frontend" && npm install --no-audit --no-fund ) || {
    warn "npm install failed in frontend/"
    return 1
  }
  log "frontend/ ready — npm run lint | typecheck | test | build"
}

# --------------------------------------------------------------------------
# 2. Julia
# --------------------------------------------------------------------------
JULIA_CHANNEL="${MASQUE_JULIA_CHANNEL:-1.10}"   # matches the compat floor CI pins

julia_reachable() {
  curl -fsS -o /dev/null --max-time 15 https://install.julialang.org 2>/dev/null
}

ensure_julia_path() {
  export PATH="$HOME/.juliaup/bin:$PATH"
}

install_julia() {
  if command -v julia >/dev/null 2>&1; then
    log "julia already present: $(julia --version)"
    return 0
  fi
  log "installing juliaup + Julia ${JULIA_CHANNEL}"
  curl -fsSL https://install.julialang.org | sh -s -- --yes --default-channel "$JULIA_CHANNEL" || return 1
  ensure_julia_path
  command -v julia >/dev/null 2>&1
}

setup_julia_project() {
  # Resolves the package's own deps only. NOTE: this does NOT install CairoMakie or
  # WGLMakie — they are declared under [weakdeps]/[extras], so Pkg.instantiate() skips
  # them, which is exactly why `julia --project=. test/runtests.jl` fails with
  # "Package CairoMakie not found". Pkg.test() builds the [targets] env that has them.
  log "instantiating + precompiling the Masque project (Makie stack; ~6 min cold)"
  julia --project="$ROOT" -e '
    using Pkg
    Pkg.instantiate()
    Pkg.precompile()
  ' || return 1
}

setup_runic() {
  # CI enforces Runic over the WHOLE repo and tracks the latest Runic, so install the
  # current release rather than pinning (see CLAUDE.md).
  log "installing Runic (formatter, CI-enforced)"
  julia -e 'using Pkg; Pkg.add("Runic")' || return 1
}

setup_e2e() {
  # Playwright drivers for the live-verification sweep. Chromium is baked into the image
  # at $PLAYWRIGHT_BROWSERS_PATH, so only the npm packages are needed (seconds). The
  # sweep also needs the @masque-dev env — see the header for the on-demand command.
  command -v npm >/dev/null 2>&1 || return 0
  log "installing test/e2e Playwright drivers"
  ( cd "$ROOT/test/e2e" && npm install --no-audit --no-fund ) || {
    warn "npm install failed in test/e2e (live-verification drivers unavailable)"
    return 1
  }
}

setup_julia() {
  if ! julia_reachable; then
    warn "Julia toolchain NOT installed — this environment's network policy denies *.julialang.org (403 at CONNECT)."
    warn "Consequence: julia, Pkg, Pkg.test(), Runic formatting and the Pluto/Playwright"
    warn "live-verification sweep are all unavailable in this session."
    warn "Fix: allow *.julialang.org on the environment's network policy, then start a new session"
    warn "     (https://code.claude.com/docs/en/claude-code-on-the-web). This hook needs no edit."
    warn "The frontend (TypeScript) toolchain is unaffected and was set up above."
    return 1
  fi

  ensure_julia_path
  install_julia          || { warn "juliaup install failed"; return 1; }
  persist_env 'export PATH="$HOME/.juliaup/bin:$PATH"'
  setup_julia_project    || { warn "Pkg.instantiate/precompile failed"; return 1; }
  setup_runic            || warn "Runic install failed; 'julia -e \"using Runic\"' will not work"
  setup_e2e              || true
  log "julia ready. Tests:  GROUP=Core julia --project=. -e 'using Pkg; Pkg.test()'"
  log "  GROUP is Core|NoBackend|WebGL (default Core) and is inherited by the subprocess."
  log "  First call in a fresh container costs ~9.5 min (it precompiles its own env); ~3 min after."
  log "  NB: 'julia --project=. test/runtests.jl' does NOT work — CairoMakie is a weakdep."
}

# --------------------------------------------------------------------------
setup_frontend || true
setup_julia    || true

log "session setup complete"
exit 0
