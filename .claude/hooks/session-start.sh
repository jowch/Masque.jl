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
#   - PackageCompiler sysimage: a 20min+ build, far too slow for a synchronous hook, and
#     it only buys ~20s per invocation once the depot is precompiled.
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
  # Resolves the package's own deps only. NOTE: this does NOT install CairoMakie or
  # WGLMakie -- they are declared under [weakdeps]/[extras], so Pkg.instantiate() skips
  # them, and every file in test/ loads one or both. Pkg.test() builds the [targets] env
  # that does have them; setup_test_env below precompiles that stack so it is not slow.
  log "instantiating + precompiling the Masque project (Makie stack; several minutes)"
  julia --project="$ROOT" -e '
    using Pkg
    Pkg.instantiate()
    Pkg.precompile()
  ' || return 1
}

setup_test_env() {
  # @masque-dev: Masque developed from this checkout, plus the backends and the packages
  # test/ and test/e2e/ load. It is NOT a second way to run the suite -- Pkg.test() is the
  # single sanctioned command (CLAUDE.md), because it is what all four CI jobs run, so the
  # command run here is the command that gates the PR. This env exists to:
  #   1. Warm the depot. Precompile caches are keyed by package version, not by
  #      environment, so precompiling the Makie stack here is what makes Pkg.test()'s
  #      throwaway env start in seconds instead of rebuilding it on first call.
  #   2. Host the live-verification sweep (docs/dev/live-interaction-checklist.md,
  #      test/e2e/serve.jl), which needs Pluto plus both backends in one env -- the same
  #      set CI's kind-sweep job assembles. CLAUDE.md treats that sweep as mandatory for
  #      user-facing changes, so an env without Pluto strands an agent mid-task.
  # masque() defaults to Cairo when both backends are loaded; the dual-backend caveat in
  # .cursor/ is about the sysimage, not about an env like this one.
  log "provisioning @masque-dev (depot warm-up + live-verification env)"
  MASQUE_ROOT="$ROOT" julia --project=@masque-dev -e '
    using Pkg
    Pkg.develop(path=ENV["MASQUE_ROOT"])
    Pkg.add(["CairoMakie", "WGLMakie", "JSON3", "Pluto"])
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
  setup_test_env         || warn "@masque-dev provisioning failed; Pkg.test() will be slow on first call and the live-verification sweep will not run"
  setup_runic            || warn "Runic install failed; 'julia -e \"using Runic\"' will not work"
  setup_e2e              || true
  persist_env 'export MASQUE_DEV_ENV="$HOME/.julia/environments/masque-dev"'
  log "julia ready. Tests:  GROUP=Core julia --project=. -e 'using Pkg; Pkg.test()'"
  log "  GROUP is Core|NoBackend|WebGL (default Core) and is inherited by the subprocess."
  log "  NB: 'julia --project=. test/runtests.jl' does NOT work -- CairoMakie is a weakdep."
}

# --------------------------------------------------------------------------
setup_frontend || true
setup_julia    || true

log "session setup complete"
exit 0
