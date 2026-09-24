### A Pluto.jl notebook ###
# v0.20.28

using Markdown
using InteractiveUtils

# This Pluto notebook uses @bind for interactivity. When running this notebook outside of Pluto, the following 'mock version' of @bind gives bound variables a default value (instead of an error).
macro bind(def, element)
    #! format: off
    return quote
        local iv = try Base.loaded_modules[Base.PkgId(Base.UUID("6e696c72-6542-2067-7265-42206c756150"), "AbstractPlutoDingetjes")].Bonds.initial_value catch; b -> missing; end
        local el = $(esc(element))
        global $(esc(def)) = Core.applicable(Base.get, el) ? Base.get(el) : iv(el)
        el
    end
    #! format: on
end

# ╔═╡ a1000000-0000-0000-0000-000000000001
begin
    import Pkg
    dev = get(ENV, "MASQUE_DEV_ENV", "")
    if !isempty(dev)
        Pkg.activate(dev)
    else
        Pkg.activate(; temp = true)
        Pkg.develop(path = joinpath(@__DIR__, "..", "..", ".."))
        Pkg.add("CairoMakie")
        Pkg.instantiate()
    end
    using Masque
    using CairoMakie
    using LinearAlgebra
end

# ╔═╡ a1000000-0000-0000-0000-000000000002
begin
    function trefoil(t)
        return Point3f(sin(t) + 2sin(2t), cos(t) - 2cos(2t), -sin(3t))
    end
    n_path, n_ring = 180, 18
    tube_r = 0.38f0
    θs = range(0, 2π; length = n_path)
    φs = range(0, 2π; length = n_ring)
    pts = [trefoil(θ) for θ in θs]
    tangents = Vector{Vec3f}(undef, n_path)
    for i in 1:n_path
        d = pts[mod1(i + 1, n_path)] - pts[mod1(i - 1, n_path)]
        tangents[i] = normalize(Vec3f(d))
    end
    normals = Vector{Vec3f}(undef, n_path)
    binormals = Vector{Vec3f}(undef, n_path)
    t1 = tangents[1]
    hint = abs(t1[3]) < 0.9f0 ? Vec3f(0, 0, 1) : Vec3f(0, 1, 0)
    normals[1] = normalize(t1 × hint)
    binormals[1] = tangents[1] × normals[1]
    for i in 2:n_path
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
    xs = zeros(Float32, n_path, n_ring)
    ys = zeros(Float32, n_path, n_ring)
    zs = zeros(Float32, n_path, n_ring)
    cs = zeros(Float32, n_path, n_ring)
    for i in 1:n_path, j in 1:n_ring
        φ = φs[j]
        p = pts[i] + tube_r * (cos(φ) * normals[i] + sin(φ) * binormals[i])
        xs[i, j] = p[1]
        ys[i, j] = p[2]
        zs[i, j] = p[3]
        cs[i, j] = θs[i]
    end
    fig = Figure(; size = (560, 360), backgroundcolor = :white, figure_padding = 8)
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
    v = ViewInteractable(ax)
    nothing
end

# ╔═╡ a1000000-0000-0000-0000-000000000003
masque(fig, v)

# ╔═╡ Cell order:
# ╟─a1000000-0000-0000-0000-000000000001
# ╟─a1000000-0000-0000-0000-000000000002
# ╠═a1000000-0000-0000-0000-000000000003
