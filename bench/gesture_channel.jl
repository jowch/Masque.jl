# Gesture channel (#102) — measures the SHIPPED `Masque._view_render_frame` closure directly
# (not the pre-implementation spike issue #102 cites), so perf-findings.md's numbers reflect the
# actual production code path: mutate the axis camera, rebuild the manifest at the mount ppu,
# re-render at ppu=1 (in-gesture) or the mount ppu (settle), and return {png, manifest}.
#
# Run: julia --project="${MASQUE_DEV_ENV:-$HOME/.julia/environments/masque-dev}" bench/gesture_channel.jl

using Masque, CairoMakie, Printf, Random
Random.seed!(0)

function bench_scene(name, fig, ints; azimuth_input, trials = 20)
    w = masque(fig, ints)
    @assert w.render_frame !== nothing "no ViewInteractable render_frame built for $name"
    # warmup (JIT + first-frame outliers), discarded — same discipline as issue #102's spike.
    w.render_frame(merge(azimuth_input, Dict("settle" => false)))
    w.render_frame(merge(azimuth_input, Dict("settle" => true)))

    gesture_ms = Float64[]
    for _ in 1:trials
        t0 = time_ns()
        r = w.render_frame(merge(azimuth_input, Dict("settle" => false)))
        push!(gesture_ms, (time_ns() - t0) / 1.0e6)
        @assert haskey(r, "png") && haskey(r, "manifest")
    end
    settle_ms = Float64[]
    for _ in 1:trials
        t0 = time_ns()
        r = w.render_frame(merge(azimuth_input, Dict("settle" => true)))
        push!(settle_ms, (time_ns() - t0) / 1.0e6)
        @assert haskey(r, "png") && haskey(r, "manifest")
    end

    p50(v) = sort(v)[cld(length(v), 2)]
    r_gesture = w.render_frame(merge(azimuth_input, Dict("settle" => false)))
    r_settle = w.render_frame(merge(azimuth_input, Dict("settle" => true)))
    png_gesture_kb = length(r_gesture["png"]) / 1024
    png_settle_kb = length(r_settle["png"]) / 1024

    @printf(
        "%-22s gesture(ppu=1) p50=%.1fms (n=%d)  settle(mount ppu) p50=%.1fms (n=%d)  png %.1fKB -> %.1fKB\n",
        name, p50(gesture_ms), trials, p50(settle_ms), trials, png_gesture_kb, png_settle_kb,
    )
    return (; gesture_ms, settle_ms, png_gesture_kb, png_settle_kb)
end

println("Gesture channel (#102) — shipped `Masque._view_render_frame`, best-of-$(20) per phase, warmup discarded")
println()

# Light scene — same shape as issue #102's spike (Axis3, 240-pt helix + 12-marker scatter,
# figure 480×360) so these numbers are directly comparable to the issue's own table.
let
    fig = Figure(size = (480, 360))
    ax = Axis3(fig[1, 1])
    t = range(0, 6π; length = 240)
    lines!(ax, cos.(t), sin.(t), t ./ 6π; color = :steelblue)
    pts = [Point3f(cos(a), sin(a), a / 6π) for a in range(0, 2π; length = 12)]
    scatter!(ax, pts; color = :crimson, markersize = 10)
    ints = [ViewInteractable(ax), PointInteractable(ax, pts)]
    bench_scene("light (helix+12pts)", fig, ints; azimuth_input = Dict("id" => "view", "azimuth" => 0.5, "elevation" => 0.4))
end

# Heavy scene — same shape as issue #102's spike (+ 80×80 surface!).
let
    fig = Figure(size = (480, 360))
    ax = Axis3(fig[1, 1])
    t = range(0, 6π; length = 240)
    lines!(ax, cos.(t), sin.(t), t ./ 6π; color = :steelblue)
    pts = [Point3f(cos(a), sin(a), a / 6π) for a in range(0, 2π; length = 12)]
    scatter!(ax, pts; color = :crimson, markersize = 10)
    xs = range(-2, 2; length = 80); ys = range(-2, 2; length = 80)
    zs = [sin(x) * cos(y) for x in xs, y in ys]
    surface!(ax, xs, ys, zs)
    ints = [ViewInteractable(ax), PointInteractable(ax, pts)]
    bench_scene("heavy (+80x80 surface)", fig, ints; azimuth_input = Dict("id" => "view", "azimuth" => 0.5, "elevation" => 0.4))
end

# 2D pan — light scatter, the case kind_sweep.mjs's view/drag-bind live-verifies.
let
    fig = Figure(size = (500, 320))
    ax = Axis(fig[1, 1]; limits = (0, 8, 0, 40))
    pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0), (4.0, 16.0), (5.0, 25.0), (6.0, 36.0)]
    scatter!(ax, first.(pts), last.(pts); markersize = 18)
    ints = [ViewInteractable(ax), PointInteractable(ax, pts)]
    bench_scene("2D pan (scatter-6)", fig, ints; azimuth_input = Dict("id" => "view", "xmin" => -1.0, "xmax" => 7.0, "ymin" => 0.0, "ymax" => 40.0))
end
