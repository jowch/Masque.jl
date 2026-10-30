# First use of each step in a fresh process: how much of it is compile, and what a second
# figure costs once compiled. Run once per backend, each in its own process:
#   julia --project="$MASQUE_DEV_ENV" bench/first_use.jl cairo
#   julia --project="$MASQUE_DEV_ENV" bench/first_use.jl webgl
# Results: docs/dev/perf-findings.md, "First use in a session".
const BK = Symbol(ARGS[1])
Base.cumulative_compile_timing(true)
ct() = Base.cumulative_compile_time_ns()[1] / 1.0e9
row(name, t, c) = println(rpad(name, 28), lpad(round(t; digits = 2), 8), " s   compile ", lpad(round(c; digits = 2), 7), " s")
macro step(name, ex)
    return quote
        c0 = ct(); t0 = time()
        local v = $(esc(ex))
        row($name, time() - t0, ct() - c0)
        v
    end
end
c0 = ct(); t0 = time()
using Masque
BK === :cairo ? (@eval using CairoMakie) : (@eval using WGLMakie)
row("load", time() - t0, ct() - c0)
import AbstractPlutoDingetjes as APD

function figs(seed)
    xs = collect(1.0:20.0) .+ seed; ys = sin.(xs)
    fig = Figure(; size = (600, 300))
    ax = Axis(fig[1, 1]); sc = scatter!(ax, xs, ys)
    ax3 = Axis3(fig[1, 2]); scatter!(ax3, xs, ys, cos.(xs))
    return fig, ax, sc, ax3, xs, ys
end

for (round_, seed) in (("cold", 0.0), ("warm", 1.0))
    println("--- ", round_)
    fig, ax, sc, ax3, xs, ys = figs(seed)
    # A plain pick widget, no view: the common case.
    w0 = @step "masque (pick only)" masque(fig, PointInteractable(ax, sc; id = :pts); backend = BK, auto = false)
    @step "show html (pick only)" repr(MIME"text/html"(), w0)
    env = Dict("pts" => Dict("layer" => "pts", "index" => 2, "payload" => nothing))
    @step "bond value (pick)" APD.Bonds.transform_value(w0, env)
    # Views on both axes: the deferred warm-up's work.
    fig, ax, sc, ax3, xs, ys = figs(seed)
    w = @step "masque (pan+orbit)" masque(fig, [PointInteractable(ax, sc; id = :pts), ViewInteractable(ax; id = :pan), ViewInteractable(ax3; id = :orbit)]; backend = BK, auto = false)
    @step "view warm-up (2 views)" Masque._sync_view_warmup!(w.render_frame)
    @step "pan frame after warm-up" w.render_frame(Dict{String, Any}("id" => "pan", "xmin" => 2.0, "xmax" => 15.0, "ymin" => -1.0, "ymax" => 1.0, "settle" => true))
    # onchange: the user's refit closure.
    fig, ax, sc, ax3, xs, ys = figs(seed)
    fit = lines!(ax, [1.0, 20.0], [0.0, 0.0])
    thr = ThresholdInteractable(ax; value = 0.0)
    wo = @step "masque (onchange)" masque(fig, (cutoff = thr,); backend = BK, auto = false, onchange = st -> update!(fit, [1.0, 20.0], fill(st.cutoff.value, 2)))
    @step "onchange warm-up" Masque._sync_view_warmup!(wo.render_frame)
    @step "onchange frame" wo.render_frame(Dict{String, Any}("onchange" => true, "settle" => true, "state" => Dict("cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => 0.5))))
end
