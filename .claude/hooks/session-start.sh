#!/usr/bin/env bash
# SessionStart hook for Claude Code on the web.
#
# Provisions the halves of this repo's toolchain independently, because in a cloud
# session they are not equally reachable:
#
#   frontend/ (TypeScript)  — npm registry is in the proxy's no_proxy list, so
#                             `npm install` works and lint/typecheck/test all run.
#   Julia                   — needs *.julialang.org, which the default cloud network
#                             policy denies (403 at CONNECT). The Julia block below
#                             probes first and provisions only if the policy allows it,
#                             so widening the policy is the only change required to get
#                             `julia --project=. test/runtests.jl` and Runic working.
#
# Deliberately NOT done here (see .cursor/cloud-agent-install.sh for the heavier setup):
#   - PackageCompiler sysimage: a 20min+ build, far too slow for a synchronous hook.
#   - @masque-dev env with Pluto: that is the live-verification rig, not the test rig.
#   - `npm run build`: CI is the sole author of assets/*.js; building here would leave
#     the working tree dirty at session start.
#
# Contract: idempotent, non-interactive, and never fatal. A component that cannot be
# provisioned warns and the hook still exits 0 — a blocked Julia must not cost you the
# frontend toolchain that did install.
set -uo pipefail

# Local checkouts are already set up by their owner; only provision cloud sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

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
# 1. Frontend (TypeScript) — always available.
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
# 2. Julia — gated on the network policy actually permitting it.
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
  # Resolves the package plus its test target (CairoMakie, WGLMakie, JSON3, Statistics),
  # then precompiles so the first `julia --project=. test/runtests.jl` is not also paying
  # for the whole Makie stack.
  log "instantiating + precompiling the Masque project (Makie stack; several minutes)"
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
  # at $PLAYWRIGHT_BROWSERS_PATH, so only the npm packages are needed.
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
    warn "Consequence: julia, Pkg, the test suite (test/runtests.jl), Runic formatting and the"
    warn "Pluto/Playwright live-verification sweep are all unavailable in this session."
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
  log "julia ready — julia --project=. test/runtests.jl  (GROUP=Core|NoBackend|WebGL)"
}

# --------------------------------------------------------------------------
setup_frontend || true
setup_julia    || true

log "session setup complete"
exit 0
