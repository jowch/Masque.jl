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

# ╔═╡ c1d50015-0001-4000-8000-000000000001
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

# ╔═╡ c1d50015-0001-4000-8000-000000000002
begin
    using Random
    Random.seed!(11)
    origins = ["USA", "Europe", "Japan"]
    origin = [rand() < 0.45 ? "USA" : rand(["Europe", "Japan"]) for _ in 1:90]
    base = Dict("USA" => 3500, "Europe" => 2600, "Japan" => 2300)
    weight = [base[o] + 450 * randn() for o in origin]
    hp = 0.04 .* weight .+ 12 .* randn(90)
    mpg = 48 .- 0.0085 .* weight .+ 2.5 .* randn(90)
    accel = 24 .- 0.06 .* hp .+ 1.2 .* randn(90)
    cars = [
        (id = i, origin = origin[i], mpg = round(mpg[i]; digits = 1), hp = round(Int, hp[i]), weight = round(Int, weight[i]))
            for i in 1:90
    ]
    colors = Dict("USA" => :steelblue, "Europe" => :darkorange, "Japan" => :seagreen)

    fig = Figure(size = (760, 340))
    ax1 = Axis(fig[1, 1]; xlabel = "weight (lb)", ylabel = "mpg", title = "drag a box, or click a legend entry")
    parts = map(origins) do o
        rows = findall(==(o), origin)
        p = scatter!(ax1, weight[rows], mpg[rows]; color = colors[o], label = o, markersize = 9)
        interactables(p; payloads = cars[rows])
    end
    axislegend(ax1; position = :rt)
    ax2 = Axis(fig[1, 2]; xlabel = "horsepower", ylabel = "seconds to 60 mph", title = "the same cars")
    s2 = scatter!(ax2, hp, accel; color = [colors[o] for o in origin], markersize = 9)
    wid = masque(
        fig, parts..., interactables(s2; payloads = cars),
        (picked = linked(ax1, ax2; key = :id, select = :many),); bind = :picked,
    )
end;

# ╔═╡ c1d50015-0001-4000-8000-000000000003
@bind picked wid

# ╔═╡ c1d50015-0001-4000-8000-000000000004
let
    chosen = [c for c in cars if c.id in picked]
    if isempty(chosen)
        Base.Text("no cars picked")
    else
        mean(f) = round(sum(f, chosen) / length(chosen); digits = 1)
        counts = join(("$(count(c -> c.origin == o, chosen)) $o" for o in origins), ", ")
        Base.Text("$(length(chosen)) cars picked ($counts)\nmean $(mean(c -> c.mpg)) mpg, $(mean(c -> c.hp)) hp")
    end
end

# ╔═╡ c1d50015-0001-4000-8000-000000000005
HTML(
    "<span id=\"clip_manifest\" style=\"display:none\">" *
        JSON3.write((; width = wid.manifest["width"], height = wid.manifest["height"], layers = [(; id = l["id"], axis = l["axis"], geometry = l["geometry"]) for l in wid.manifest["layers"]], transforms = wid.manifest["transforms"])) *
        "</span>"
)

# ╔═╡ Cell order:
# ╠═c1d50015-0001-4000-8000-000000000001
# ╠═c1d50015-0001-4000-8000-000000000002
# ╠═c1d50015-0001-4000-8000-000000000003
# ╠═c1d50015-0001-4000-8000-000000000004
# ╠═c1d50015-0001-4000-8000-000000000005
