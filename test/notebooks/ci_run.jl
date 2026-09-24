# Headlessly run every Pluto notebook in this directory and fail if any cell errors.
# Gallery demos are docs embed notebooks, harvested by docs/export_embeds.jl.
# This gate keeps the API fixtures honest (point/segment/rect/polygon/axis, the
# WebGL kitchen sink, view sliders and drag, polar points on WGLMakie).
#
# Run locally:  julia test/notebooks/ci_run.jl
# Each notebook manages its own env (Pkg.develop the package + add whichever Makie
# backend it needs), so this runner only needs Pluto itself.
#
# Pluto captures a cell's stdout until that cell finishes, and `SessionActions.open`
# blocks until the notebook settles. A cold CairoMakie or WGLMakie precompile is
# therefore a multi-minute gap with no log line (observed ~7 min, then ~6 min),
# which reads as a hung job. Heartbeats flush elapsed time and the busy cell while
# `open` blocks. `MASQUE_NOTEBOOK_TIMEOUT_S` (default 1200) fails that notebook
# instead of waiting for the job's timeout-minutes.

# Wait until `done()` or `timeout_s`. Calls `on_heartbeat(elapsed)` every
# `heartbeat_s`. Returns :ok or :timeout. `sleep_s` is the poll interval.
function poll_until_done(
        done::Function;
        timeout_s::Real,
        heartbeat_s::Real,
        on_heartbeat::Function,
        sleep_s::Real = 1.0,
    )
    t0 = time()
    next_beat = t0 + heartbeat_s
    while !done()
        now = time()
        elapsed = now - t0
        if elapsed >= timeout_s
            return :timeout
        end
        if now >= next_beat
            on_heartbeat(elapsed)
            next_beat += heartbeat_s
        end
        remaining = timeout_s - (time() - t0)
        remaining <= 0 && return :timeout
        sleep(min(sleep_s, remaining))
    end
    return :ok
end

function notebook_timeout_s()
    raw = get(ENV, "MASQUE_NOTEBOOK_TIMEOUT_S", "1200")
    t = tryparse(Float64, raw)
    if t === nothing || t <= 0
        error("MASQUE_NOTEBOOK_TIMEOUT_S must be a positive number of seconds, got $(repr(raw))")
    end
    return t
end

function say(msg)
    println(stderr, msg)
    flush(stdout)
    return flush(stderr)
end

function cell_hint(cell)
    line = first(split(strip(string(cell.code)), '\n'; limit = 2))
    return length(line) > 72 ? first(line, 72) * "…" : line
end

function notebook_status(session)
    nbs = collect(values(session.notebooks))
    isempty(nbs) && return "notebook not open yet"
    length(nbs) == 1 || return "$(length(nbs)) notebooks in the session"
    nb = only(nbs)
    busy = filter(c -> c.running || c.queued, nb.cells)
    isempty(busy) && return "process=$(nb.process_status), no cell running"
    shown = join(cell_hint.(collect(Iterators.take(busy, 2))), " | ")
    extra = length(busy) > 2 ? " (+$(length(busy) - 2) more)" : ""
    return "process=$(nb.process_status), $(length(busy)) busy: $(shown)$(extra)"
end

# A status read must not take down the wait. The notebook dict is mutated by the
# task that is running `open`.
function safe_status(session)
    return try
        notebook_status(session)
    catch err
        "status unavailable ($(typeof(err)))"
    end
end

# `open(; run_async=false)` does not return until the notebook settles, so the wait
# runs on another task and this task prints heartbeats. `nothing` means the deadline
# fired and the caller should exit.
function open_and_wait(session, path; timeout_s::Real, heartbeat_s::Real = 15.0)
    name = basename(path)
    task = @async begin
        try
            Pluto.SessionActions.open(session, path; run_async = false)
        catch err
            (err, catch_backtrace())
        end
    end
    outcome = poll_until_done(
        () -> istaskdone(task);
        timeout_s,
        heartbeat_s,
        on_heartbeat = elapsed -> say(
            "… $name still running ($(round(Int, elapsed))s) — $(safe_status(session))",
        ),
    )
    if outcome === :timeout
        say("ERROR: $name exceeded $(round(Int, timeout_s))s — $(safe_status(session))")
        # throwto fails if the task already finished between the deadline check and here.
        try
            Base.throwto(task, InterruptException())
        catch
        end
        timedwait(() -> istaskdone(task), 10)
        if istaskdone(task)
            result = fetch(task)
            if result isa Tuple && length(result) == 2 && result[1] isa Exception
                showerror(stderr, result[1], result[2])
                println(stderr)
            end
        end
        flush(stdout)
        flush(stderr)
        return nothing
    end
    result = fetch(task)
    if result isa Tuple && length(result) == 2 && result[1] isa Exception
        err, bt = result
        throw(CapturedException(err, bt))
    end
    return result
end

if abspath(PROGRAM_FILE) == @__FILE__
    import Pkg
    Pkg.activate(; temp = true)
    Pkg.add(name = "Pluto", version = "0.20")   # pin major; the notebooks declare v0.20.x
    using Pluto

    # Julia's stdout is block-buffered when CI redirects it (see test/e2e/serve.jl).
    # Flush on a timer so a heartbeat is visible before the next cell finishes.
    @async while true
        flush(stdout)
        flush(stderr)
        sleep(1)
    end

    const HEADER = "### A Pluto.jl notebook ###"
    is_notebook(p) = isfile(p) && endswith(p, ".jl") && startswith(readline(p), HEADER)

    dirs = [@__DIR__]
    notebooks = String[]
    for d in dirs
        isdir(d) || continue
        append!(notebooks, filter(is_notebook, readdir(d; join = true)))
    end
    notebooks = sort(notebooks)
    isempty(notebooks) && error("no Pluto notebooks found in $(join(dirs, ", "))")
    @info "Found $(length(notebooks)) notebook(s)" names = basename.(notebooks)
    timeout_s = notebook_timeout_s()
    @info "Per-notebook deadline is $(round(Int, timeout_s))s"

    failed = String[]
    for path in notebooks
        name = basename(path)
        @info "▶ running $name"
        flush(stdout)
        flush(stderr)
        session = Pluto.ServerSession()
        session.options.server.disable_writing_notebook_files = true   # never mutate the committed file
        nb = open_and_wait(session, path; timeout_s)
        nb === nothing && exit(1)
        errored = [c for c in nb.cells if c.errored]
        for c in errored
            firstline = first(split(strip(string(c.code)), '\n'))
            @error "cell errored in $name" code = firstline output = string(c.output.body)
        end
        Pluto.SessionActions.shutdown(session, nb)
        isempty(errored) ? (@info "✓ $name ran clean") : push!(failed, name)
        flush(stdout)
        flush(stderr)
    end

    isempty(failed) ||
        error("fixture notebook(s) with errored cells: $(join(failed, ", "))")
    @info "All fixture notebooks ran clean ✓"
end
