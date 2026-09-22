# Record a looping Axis3 orbit of a trefoil-knot tube.
#
# CairoMakie view frames cannot come from a harvested overlay player
# (`with_js_link` is dead on static export). Step `azimuth` and write
# PNG frames + timestamps.json for `docs/dev/readme-demo/assemble.sh`.
#
#   julia --project=docs docs/dev/home-gifs/record-orbit.jl [frames-dir]
using CairoMakie
using LinearAlgebra
using JSON3

const FRAMES_DIR = length(ARGS) ≥ 1 ? ARGS[1] : "/tmp/home-gifs/orbit"
const N_FRAMES = 48
const DURATION_MS = 8000
const TUBE_RADIUS = 0.38f0
const N_PATH = 180
const N_RING = 18

function trefoil(t::Float64)
    return Point3f(sin(t) + 2sin(2t), cos(t) - 2cos(2t), -sin(3t))
end

function trefoil_tube()
    θs = range(0, 2π; length = N_PATH)
    φs = range(0, 2π; length = N_RING)
    pts = [trefoil(θ) for θ in θs]
    tangents = Vector{Vec3f}(undef, N_PATH)
    for i in 1:N_PATH
        d = pts[mod1(i + 1, N_PATH)] - pts[mod1(i - 1, N_PATH)]
        tangents[i] = normalize(Vec3f(d))
    end
    normals = Vector{Vec3f}(undef, N_PATH)
    binormals = Vector{Vec3f}(undef, N_PATH)
    t1 = tangents[1]
    hint = abs(t1[3]) < 0.9f0 ? Vec3f(0, 0, 1) : Vec3f(0, 1, 0)
    normals[1] = normalize(t1 × hint)
    binormals[1] = tangents[1] × normals[1]
    for i in 2:N_PATH
        # Parallel-transport the normal (rotation-minimizing frame).
        t_prev = tangents[i - 1]
        t_cur = tangents[i]
        v = t_prev × t_cur
        n = normals[i - 1]
        if norm(v) > 1.0f-6
            v = normalize(v)
            c = t_prev ⋅ t_cur
            n = n * c + (v × n) * sqrt(max(0, 1 - c^2)) + v * (v ⋅ n) * (1 - c)
        end
        n = n - (n ⋅ t_cur) * t_cur
        normals[i] = normalize(Vec3f(n))
        binormals[i] = t_cur × normals[i]
    end
    xs = zeros(Float32, N_PATH, N_RING)
    ys = zeros(Float32, N_PATH, N_RING)
    zs = zeros(Float32, N_PATH, N_RING)
    cs = zeros(Float32, N_PATH, N_RING)
    for i in 1:N_PATH, j in 1:N_RING
        φ = φs[j]
        p = pts[i] + TUBE_RADIUS * (cos(φ) * normals[i] + sin(φ) * binormals[i])
        xs[i, j] = p[1]
        ys[i, j] = p[2]
        zs[i, j] = p[3]
        cs[i, j] = θs[i]
    end
    return xs, ys, zs, cs
end

function make_figure()
    xs, ys, zs, cs = trefoil_tube()
    fig = Figure(; size = (720, 480), backgroundcolor = :white, figure_padding = 8)
    ax = Axis3(
        fig[1, 1];
        aspect = :data,
        perspectiveness = 0.5,
        xlabel = "x",
        ylabel = "y",
        zlabel = "z",
        viewmode = :fit,
    )
    surface!(
        ax, xs, ys, zs;
        color = cs,
        colormap = :roma,
        shading = true,
        inspectable = false,
    )
    return fig, ax
end

function main()
    mkpath(FRAMES_DIR)
    fig, ax = make_figure()
    az0 = ax.azimuth[]
    el0 = ax.elevation[]
    stamps = NamedTuple{(:t, :file), Tuple{Int, String}}[]
    for i in 0:(N_FRAMES - 1)
        ax.azimuth[] = az0 + 2π * i / N_FRAMES
        ax.elevation[] = el0
        img = Makie.colorbuffer(fig; px_per_unit = 2)
        file = "frame_$(lpad(i, 3, '0')).png"
        save(joinpath(FRAMES_DIR, file), img)
        t = round(Int, DURATION_MS * i / N_FRAMES)
        push!(stamps, (; t, file))
        @info "orbit frame" i file
    end
    open(joinpath(FRAMES_DIR, "timestamps.json"), "w") do io
        JSON3.write(io, stamps)
    end
    println("wrote $(N_FRAMES) frames to $FRAMES_DIR")
    return
end

main()
