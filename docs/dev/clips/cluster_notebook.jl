### A Pluto.jl notebook ###
# v1.0.3

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


# ╔═╡ a1420001-0001-4000-8000-000000000001
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
end

# ╔═╡ a1420001-0001-4000-8000-000000000002
begin
    using Random
    Random.seed!(3)   # the same samples every time the notebook runs

    # 80 samples in one cluster, then 70 in another
    xs = [3.0 .+ 0.9 .* randn(80); 7.0 .+ 0.9 .* randn(70)]
    ys = [3.0 .+ 0.9 .* randn(80); 6.0 .+ 0.8 .* randn(70)]
    zs = [1.2 .+ 0.3 .* randn(80); 2.8 .+ 0.35 .* randn(70)]

    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y", title = "drag the box over a cluster")
    s = scatter!(ax, xs, ys; color = zs, colormap = :viridis, markersize = 9)

    samples = [(sample = i, x = xs[i], y = ys[i], z = zs[i]) for i in 1:150]
    pts = PointInteractable(
        ax, s;
        id = :pts,
        payloads = samples,
        tooltip = masque"sample $(sample)<br>x $(x:.2f), y $(y:.2f), z $(z:.2f)",
    )
    roi = ROIInteractable(ax; bounds = (5.2, 9.2, 4.4, 7.8), selects = :pts)
    nothing
end

# ╔═╡ a1420001-0001-4000-8000-000000000003
@bind picks masque(fig, [pts, roi])

# ╔═╡ a1420001-0001-4000-8000-000000000004
begin
    edges = range(minimum(zs), maximum(zs); length = 21)
    inside = isnothing(picks) ? Float64[] : zs[picks]
    cmp = Figure(size = (560, 260))
    cax = Axis(
        cmp[1, 1]; xlabel = "z", ylabel = "samples",
        title = isempty(inside) ? "all samples" : "$(length(inside)) samples in the box, against all $(length(zs))"
    )
    hist!(cax, zs; bins = edges, color = (:gray, 0.45), label = "all")
    if !isempty(inside)
        hist!(cax, inside; bins = edges, color = (:darkorange, 0.85), label = "in the box")
    end
    axislegend(cax; position = :rt)
    cmp
end

# ╔═╡ Cell order:
# ╠═a1420001-0001-4000-8000-000000000001
# ╠═a1420001-0001-4000-8000-000000000002
# ╠═a1420001-0001-4000-8000-000000000003
# ╠═a1420001-0001-4000-8000-000000000004
