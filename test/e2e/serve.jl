# Launch a headless Pluto server for the through-Pluto @bind E2E (bind_click.mjs drives it).
# Pluto runs from MASQUE_DEV_ENV when set, else its own temp env; the notebook activates
# MASQUE_DEV_ENV or its own temp env (dev Masque by path + add WGLMakie) when it runs. Blocks — run in the background, poll the port for readiness
# (curl localhost:PORT -> 200; do NOT grep the log, Pluto doesn't reliably flush its banner).
#
#   julia test/e2e/serve.jl [port]
#
# PLUTO_VERSION picks the Pluto series (default "1"); CI also runs the bind round-trip on "0.20".

import Pkg
# MASQUE_DEV_ENV already holds Pluto 1, precompiled (CI's setup job, scripts/cloud-warm.sh), so
# the default series runs from it. Another series gets its own temp env.
dev = get(ENV, "MASQUE_DEV_ENV", "")
if !isempty(dev) && !haskey(ENV, "PLUTO_VERSION")
    Pkg.activate(dev)
else
    Pkg.activate(; temp = true)
    Pkg.add(name = "Pluto", version = get(ENV, "PLUTO_VERSION", "1"))
end
using Pluto

# Julia's stdout/stderr redirection to a file (`> pluto.log 2>&1` in CI) is buffered and, observed
# in CI (PRs #57/#60), can sit unflushed until the process is killed — a failure's "Pluto server
# log" artifact then shows either nothing or startup output stamped with the kill time, not what
# was actually happening when the E2E timed out. Force a flush every second so the log is a live,
# trustworthy artifact instead of a post-mortem dump.
@async while true
    flush(stdout)
    flush(stderr)
    sleep(1)
end

port = length(ARGS) >= 1 ? parse(Int, ARGS[1]) : 1234
Pluto.run(;
    port,
    launch_browser = false,
    require_secret_for_open_links = false,
    require_secret_for_access = false,
    disable_writing_notebook_files = true,   # never mutate the committed notebook on open
)
