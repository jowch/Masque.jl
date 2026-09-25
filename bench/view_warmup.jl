# Deferred view warmup. `masque` renders the mount image and `show` writes it; the discarded
# gesture frames run after `show` returns. This times those three spans, then a drag.
#
# Same three scenes as bench/gesture_channel.jl. "cold" is the first widget of that scene in
# this process (first-call compile lands in whichever span actually calls the new method).
# "warm" is a second identical widget after that compile has happened.
#
# `published_to_js` is stubbed to `null`, same as test/core/gesture_channel_tests.jl. Pluto's
# real function stores the object and writes an id; it does not inline the bytes into the HTML.
# The Cairo PNG is already on the widget and is written into the `<img>` here.
#
# The masque-makie sysimage freezes Masque and will not see this branch:
#   JULIA_NOSYSIMAGE=1 julia --project="${MASQUE_DEV_ENV:-$HOME/.julia/environments/masque-dev}" bench/view_warmup.jl
#   JULIA_NOSYSIMAGE=1 julia --project="${MASQUE_DEV_ENV:-$HOME/.julia/environments/masque-dev}" bench/view_warmup.jl webgl

using Printf
import Masque

const WEBGL = !isempty(ARGS) && ARGS[1] == "webgl"
if WEBGL
    using WGLMakie
else
    using CairoMakie
end
using Masque

const TRIALS = 5

function display_io()
    buf = IOBuffer()
    io = IOContext(buf, :pluto_published_to_js => (io, x) -> print(io, "null"))
    return io, buf
end

p50(v) = sort(v)[cld(length(v), 2)]
ms_since(t0) = (time_ns() - t0) / 1.0e6

function camera(ax)
    if hasproperty(ax, :azimuth) && hasproperty(ax, :elevation)
        return (Float64(ax.azimuth[]), Float64(ax.elevation[]))
    end
    return ax.limits[]
end

function make_widget(fig, ints)
    WEBGL || return masque(fig, ints)
    ext = Base.get_extension(Masque, :MasqueWGLMakieExt)
    return masque(fig, ints; backend = ext.WebGLBackend())
end

function html_ok(html)
    if WEBGL
        return occursin("<canvas", html)
    end
    return occursin("data:image/png;base64,", html) && length(html) > 1000
end

function frame_ok(frame)
    haskey(frame, "manifest") || return false
    return WEBGL ? (haskey(frame, "scene") && !haskey(frame, "png")) : haskey(frame, "png")
end

# Time each discarded frame. Warmup calls `state.apply` directly.
function arm_frame_times!(render_frame)
    state = Masque._view_warmup_state(render_frame)
    state === nothing && error("no warmup state for this widget")
    inner = state.apply
    times = Float64[]
    state.apply = function (input)
        t0 = time_ns()
        out = inner(input)
        push!(times, ms_since(t0))
        return out
    end
    return state, inner, times
end

function bench_pass(name, pass, fig, ints, input)
    ax = ints[1].ax
    cam0 = camera(ax)
    t0 = time_ns()
    w = make_widget(fig, ints)
    masque_ms = ms_since(t0)
    w.render_frame === nothing && error("no ViewInteractable render_frame for $name")

    state, inner, frame_ms = arm_frame_times!(w.render_frame)
    io, buf = display_io()
    t0 = time_ns()
    show(io, MIME"text/html"(), w)
    show_ms = ms_since(t0)
    html = String(take!(buf))
    html_first = html_ok(html) && !Masque._view_warmup_finished(w.render_frame)

    t0 = time_ns()
    Masque._sync_view_warmup!(w.render_frame)
    warmup_ms = ms_since(t0)
    state.apply = inner
    restored = camera(ax) == cam0

    drag_ms = Float64[]
    settle_ms = Float64[]
    for _ in 1:TRIALS
        t0 = time_ns()
        r = w.render_frame(merge(input, Dict("settle" => false)))
        push!(drag_ms, ms_since(t0))
        frame_ok(r) || error("in-drag frame missing payload for $name")
    end
    for _ in 1:TRIALS
        t0 = time_ns()
        r = w.render_frame(merge(input, Dict("settle" => true)))
        push!(settle_ms, ms_since(t0))
        frame_ok(r) || error("settle frame missing payload for $name")
    end

    frames = join([@sprintf("%.1f", t) for t in frame_ms], "+")
    @printf(
        "%-24s %-5s  masque %8.1f  show %7.1f  html_first=%-5s  warmup %8.1f  [%s]  drag p50 %6.1f (%.1f–%.1f)  settle p50 %6.1f (%.1f–%.1f)  camera_restored=%s\n",
        name, pass, masque_ms, show_ms, string(html_first), warmup_ms, frames,
        p50(drag_ms), minimum(drag_ms), maximum(drag_ms),
        p50(settle_ms), minimum(settle_ms), maximum(settle_ms),
        string(restored),
    )
    flush(stdout)
    return (;
        name, pass, masque_ms, show_ms, html_first, warmup_ms, frame_ms,
        drag_p50 = p50(drag_ms), settle_p50 = p50(settle_ms), restored,
    )
end

# A drag that arrives after `show` and before the discarded frames finish. Methods are already
# compiled when this runs after `bench_pass`, so this is the wait without first-call compile.
function bench_join(name, fig, ints, input)
    w = make_widget(fig, ints)
    _, _, frame_ms = arm_frame_times!(w.render_frame)
    io, _ = display_io()
    show(io, MIME"text/html"(), w)
    html_first = !Masque._view_warmup_finished(w.render_frame)
    t0 = time_ns()
    r = w.render_frame(merge(input, Dict("settle" => false)))
    join_ms = ms_since(t0)
    frame_ok(r) || error("join frame missing payload for $name")
    frames = join([@sprintf("%.1f", t) for t in frame_ms], "+")
    @printf(
        "%-24s join   html_first=%-5s  drag_waits %8.1f  [%s]\n",
        name, string(html_first), join_ms, frames,
    )
    flush(stdout)
    return (; name, html_first, join_ms, frame_ms)
end

function light_orbit()
    fig = Figure(size = (480, 360))
    ax = Axis3(fig[1, 1])
    t = range(0, 6π; length = 240)
    lines!(ax, cos.(t), sin.(t), t ./ 6π; color = :steelblue)
    pts = [Point3f(cos(a), sin(a), a / 6π) for a in range(0, 2π; length = 12)]
    scatter!(ax, pts; color = :crimson, markersize = 10)
    ints = [ViewInteractable(ax), PointInteractable(ax, pts)]
    input = Dict("id" => "view", "azimuth" => 0.5, "elevation" => 0.4)
    return fig, ints, input
end

function heavy_orbit()
    fig, ints, input = light_orbit()
    ax = ints[1].ax
    xs = range(-2, 2; length = 80)
    ys = range(-2, 2; length = 80)
    zs = [sin(x) * cos(y) for x in xs, y in ys]
    surface!(ax, xs, ys, zs)
    return fig, ints, input
end

function pan_scatter()
    fig = Figure(size = (500, 320))
    ax = Axis(fig[1, 1]; limits = (0, 8, 0, 40))
    pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0), (4.0, 16.0), (5.0, 25.0), (6.0, 36.0)]
    scatter!(ax, first.(pts), last.(pts); markersize = 18)
    ints = [ViewInteractable(ax), PointInteractable(ax, pts)]
    input = Dict("id" => "view", "xmin" => -1.0, "xmax" => 7.0, "ymin" => 0.0, "ymax" => 40.0)
    return fig, ints, input
end

println("View warmup — show writes the mount HTML, then the discarded frames run")
println("backend=$(WEBGL ? "webgl" : "cairo")  julia=$(VERSION)  masque=$(pathof(Masque))")
println("spans are ms. frame list is each discarded call, in order. drag/settle are p50 of $TRIALS after warmup.")
println("a join row's frame list is those discarded calls plus the in-drag frame that waited for them.")
println()
flush(stdout)

let
    fig, ints, input = light_orbit()
    bench_pass("light (helix+12pts)", "cold", fig, ints, input)
    fig, ints, input = light_orbit()
    bench_pass("light (helix+12pts)", "warm", fig, ints, input)
    for _ in 1:3
        fig, ints, input = light_orbit()
        bench_join("light (helix+12pts)", fig, ints, input)
    end
end
let
    fig, ints, input = heavy_orbit()
    bench_pass("heavy (+80x80 surface)", "cold", fig, ints, input)
    fig, ints, input = heavy_orbit()
    bench_pass("heavy (+80x80 surface)", "warm", fig, ints, input)
    fig, ints, input = heavy_orbit()
    bench_join("heavy (+80x80 surface)", fig, ints, input)
end
let
    fig, ints, input = pan_scatter()
    bench_pass("2D pan (scatter-6)", "cold", fig, ints, input)
    fig, ints, input = pan_scatter()
    bench_pass("2D pan (scatter-6)", "warm", fig, ints, input)
end
