# Gesture channel (#133) — measures the SHIPPED `Masque._view_render_frame` closure on
# `:webgl` directly (no browser, no Pluto). Same three scenes as `bench/gesture_channel.jl`
# so the two backends can be compared. `:webgl` returns `{scene, width, height, pxPerUnit,
# manifest}` — there is no PNG. `pxPerUnit` is the framebuffer scale the browser applies;
# `scene_payload` itself does not resample, so in-drag and settle scene bytes match.
#
# WIRE bytes: the binary length of every typed numeric vector in the frame (scene + manifest),
# the dominant term Pluto's MsgPack puts on the wire. Same definition as
# `bench/webgl_payload_size.jl`. JSON3 length is an upper-bound proxy only.
#
# Run: julia --project=. bench/gesture_channel_webgl.jl

using Masque, WGLMakie, Printf, Random
import JSON3
import Makie
Random.seed!(0)

const _WGLExt = Base.get_extension(Masque, :MasqueWGLMakieExt)

function wire_bytes(x)
    n = 0
    if x isa AbstractDict
        for v in values(x)
            n += wire_bytes(v)
        end
    elseif x isa AbstractArray
        T = eltype(x)
        # A concrete bitstype vector is what MsgPack ships as a binary blob. An abstract
        # eltype (Vector{Real} in a manifest) is a list of scalars, not a blob.
        if isconcretetype(T) && isbitstype(T) && T <: Number
            n += sizeof(T) * length(x)
        else
            for v in x
                n += wire_bytes(v)
            end
        end
    end
    return n
end

function bench_scene(name, fig, ints; input, trials = 20)
    w = masque(fig, ints; backend = _WGLExt.WebGLBackend())
    @assert w.render_frame !== nothing "no ViewInteractable render_frame built for $name"
    w.render_frame(merge(input, Dict("settle" => false)))
    w.render_frame(merge(input, Dict("settle" => true)))

    gesture_ms = Float64[]
    for _ in 1:trials
        t0 = time_ns()
        r = w.render_frame(merge(input, Dict("settle" => false)))
        push!(gesture_ms, (time_ns() - t0) / 1.0e6)
        @assert haskey(r, "scene") && haskey(r, "manifest") && !haskey(r, "png")
        @assert r["pxPerUnit"] == 1.0
    end
    settle_ms = Float64[]
    for _ in 1:trials
        t0 = time_ns()
        r = w.render_frame(merge(input, Dict("settle" => true)))
        push!(settle_ms, (time_ns() - t0) / 1.0e6)
        @assert r["pxPerUnit"] == w.px_per_unit
    end

    p50(v) = sort(v)[cld(length(v), 2)]
    r_gesture = w.render_frame(merge(input, Dict("settle" => false)))
    r_settle = w.render_frame(merge(input, Dict("settle" => true)))
    @printf(
        "%-26s gesture(ppu=1) p50=%.1fms (n=%d)  settle(mount ppu) p50=%.1fms (n=%d)  scene-wire %.1fKB -> %.1fKB  frame-wire %.1fKB -> %.1fKB  scene-json %.1fKB\n",
        name,
        p50(gesture_ms), trials, p50(settle_ms), trials,
        wire_bytes(r_gesture["scene"]) / 1024, wire_bytes(r_settle["scene"]) / 1024,
        wire_bytes(r_gesture) / 1024, wire_bytes(r_settle) / 1024,
        length(JSON3.write(r_gesture["scene"])) / 1024,
    )
    return (; gesture_ms, settle_ms)
end

println("Gesture channel (#133) — shipped webgl `Masque._view_render_frame`, best-of-20 per phase, warmup discarded")
println()

let
    fig = Figure(size = (480, 360))
    ax = Axis3(fig[1, 1])
    t = range(0, 6π; length = 240)
    lines!(ax, cos.(t), sin.(t), t ./ 6π; color = :steelblue)
    pts = [Point3f(cos(a), sin(a), a / 6π) for a in range(0, 2π; length = 12)]
    scatter!(ax, pts; color = :crimson, markersize = 10)
    ints = [ViewInteractable(ax), PointInteractable(ax, pts)]
    bench_scene(
        "light (helix+12pts)", fig, ints;
        input = Dict("id" => "view", "azimuth" => 0.5, "elevation" => 0.4),
    )
end

let
    fig = Figure(size = (480, 360))
    ax = Axis3(fig[1, 1])
    t = range(0, 6π; length = 240)
    lines!(ax, cos.(t), sin.(t), t ./ 6π; color = :steelblue)
    pts = [Point3f(cos(a), sin(a), a / 6π) for a in range(0, 2π; length = 12)]
    scatter!(ax, pts; color = :crimson, markersize = 10)
    xs = range(-2, 2; length = 80)
    ys = range(-2, 2; length = 80)
    zs = [sin(x) * cos(y) for x in xs, y in ys]
    surface!(ax, xs, ys, zs)
    ints = [ViewInteractable(ax), PointInteractable(ax, pts)]
    bench_scene(
        "heavy (+80x80 surface)", fig, ints;
        input = Dict("id" => "view", "azimuth" => 0.5, "elevation" => 0.4),
    )
end

let
    fig = Figure(size = (500, 320))
    ax = Axis(fig[1, 1]; limits = (0, 8, 0, 40))
    pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0), (4.0, 16.0), (5.0, 25.0), (6.0, 36.0)]
    scatter!(ax, first.(pts), last.(pts); markersize = 18)
    ints = [ViewInteractable(ax), PointInteractable(ax, pts)]
    bench_scene(
        "2D pan (scatter-6)", fig, ints;
        input = Dict("id" => "view", "xmin" => -1.0, "xmax" => 7.0, "ymin" => 0.0, "ymax" => 40.0),
    )
end
