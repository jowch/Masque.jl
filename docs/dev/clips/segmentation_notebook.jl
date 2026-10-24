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

# ╔═╡ c1d50014-0001-4000-8000-000000000001
begin
    import Pkg
    dev = get(ENV, "MASQUE_DEV_ENV", "")
    if !isempty(dev)
        Pkg.activate(dev)
    else
        Pkg.activate(; temp = true)
        Pkg.add(["CairoMakie", "JSON3"])
        Pkg.develop(path = joinpath(@__DIR__, "..", "..", ".."))
        Pkg.instantiate()
    end
    using Masque
    using CairoMakie
    import JSON3
end

# ╔═╡ c1d50014-0001-4000-8000-000000000002
begin
    using Random
    Random.seed!(7)
    img = [0.15 + 0.1 * (i / 160) + 0.02 * randn() for i in 1:160, j in 1:100]
    for _ in 1:18
        ci, cj, r = rand(8:152), rand(8:92), rand(3.0:0.5:6.0)
        b = 0.45 + 0.4 * rand()
        img .+= [b * exp(-((i - ci)^2 + (j - cj)^2) / (2r^2)) for i in 1:160, j in 1:100]
    end

    # Number each patch of touching pixels above 0.5; the background stays 0.
    function label_objects(mask)
        labels = zeros(Int, size(mask))
        n = 0
        for start in CartesianIndices(mask)
            (mask[start] && labels[start] == 0) || continue
            n += 1
            labels[start] = n
            todo = [start]
            while !isempty(todo)
                p = pop!(todo)
                for d in CartesianIndex.(((1, 0), (-1, 0), (0, 1), (0, -1)))
                    q = p + d
                    if checkbounds(Bool, mask, q) && mask[q] && labels[q] == 0
                        labels[q] = n
                        push!(todo, q)
                    end
                end
            end
        end
        return labels, n
    end
    labels, n = label_objects(img .> 0.5)
    areas = [count(==(k), labels) for k in 1:n]

    fig = Figure(size = (560, 380))
    ax = Axis(fig[1, 1]; aspect = DataAspect(), title = "click the objects to leave out")
    hidedecorations!(ax)
    hm = heatmap!(ax, img; colormap = :grays)
    wid = masque(fig, (objects = interactables(hm; select = :many, regions = labels),))
end;

# ╔═╡ c1d50014-0001-4000-8000-000000000003
@bind sel wid

# ╔═╡ c1d50014-0001-4000-8000-000000000004
let
    out = sort(sel.objects.regions)
    kept = setdiff(1:n, out)
    Base.Text(
        "left out: $(isempty(out) ? "none" : join(out, ", "))\n" *
            (isempty(kept) ? "no objects kept" : "$(length(kept)) of $n objects kept, mean area $(round(Int, sum(areas[kept]) / length(kept))) pixels")
    )
end

# ╔═╡ c1d50014-0001-4000-8000-000000000005
begin
    # For the recorder: one pixel of each object, the one nearest its middle.
    spots = map(1:n) do k
        ps = findall(==(k), labels)
        m = sum(Tuple.(ps) .|> collect) ./ length(ps)
        Tuple(ps[argmin([sum(abs2, collect(Tuple(p)) .- m) for p in ps])])
    end
    HTML(
        "<span id=\"clip_manifest\" style=\"display:none\">" *
            JSON3.write((; width = wid.manifest["width"], height = wid.manifest["height"], layers = [(; id = l["id"], axis = l["axis"], geometry = (; xedges = l["geometry"]["xedges"], yedges = l["geometry"]["yedges"])) for l in wid.manifest["layers"] if string(l["id"]) == "objects"], transforms = wid.manifest["transforms"], spots = spots)) *
            "</span>"
    )
end

# ╔═╡ Cell order:
# ╠═c1d50014-0001-4000-8000-000000000001
# ╠═c1d50014-0001-4000-8000-000000000002
# ╠═c1d50014-0001-4000-8000-000000000003
# ╠═c1d50014-0001-4000-8000-000000000004
# ╠═c1d50014-0001-4000-8000-000000000005
