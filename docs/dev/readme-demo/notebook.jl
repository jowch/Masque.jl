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

# ╔═╡ c1d50012-0001-4000-8000-000000000001
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

# ╔═╡ c1d50012-0001-4000-8000-000000000002
begin
    data = [
        ("Tokyo", 139.7, 35.7, 37.4, "Asia"), ("Delhi", 77.2, 28.6, 32.9, "Asia"),
        ("Shanghai", 121.5, 31.2, 29.2, "Asia"), ("Mumbai", 72.9, 19.1, 21.3, "Asia"),
        ("Beijing", 116.4, 39.9, 21.8, "Asia"), ("Jakarta", 106.8, -6.2, 11.2, "Asia"),
        ("Manila", 121.0, 14.6, 14.7, "Asia"), ("Sydney", 151.2, -33.9, 5.3, "Oceania"),
        ("Cairo", 31.2, 30.0, 22.2, "Africa"), ("Lagos", 3.4, 6.5, 15.9, "Africa"),
        ("Kinshasa", 15.3, -4.3, 16.3, "Africa"), ("Johannesburg", 28.0, -26.2, 6.2, "Africa"),
        ("London", -0.1, 51.5, 9.6, "Europe"), ("Paris", 2.4, 48.9, 11.1, "Europe"),
        ("Madrid", -3.7, 40.4, 6.8, "Europe"), ("Berlin", 13.4, 52.5, 3.6, "Europe"),
        ("Rome", 12.5, 41.9, 4.3, "Europe"), ("Moscow", 37.6, 55.8, 12.7, "Europe"),
        ("Istanbul", 29.0, 41.0, 15.8, "Europe"), ("New York", -74.0, 40.7, 18.9, "Americas"),
        ("Los Angeles", -118.2, 34.1, 12.5, "Americas"), ("Mexico City", -99.1, 19.4, 22.3, "Americas"),
        ("Lima", -77.0, -12.0, 11.0, "Americas"), ("São Paulo", -46.6, -23.5, 22.6, "Americas"),
        ("Buenos Aires", -58.4, -34.6, 15.5, "Americas"),
    ]
    rows = [(; city, pop) for (city, _, _, pop, _) in data]
    regions = ["Asia", "Oceania", "Africa", "Europe", "Americas"]
    colors = [Makie.wong_colors()[findfirst(==(r), regions)] for (_, _, _, _, r) in data]

    fig = Figure(size = (600, 330))
    ax = Axis(fig[1, 1]; xlabel = "Longitude", ylabel = "Latitude")
    s = scatter!(
        ax, [d[2] for d in data], [d[3] for d in data];
        color = colors, markersize = [8 + 2.2sqrt(d[4]) for d in data],
    )
    limits!(ax, -135, 165, -45, 65)
    cities = interactables(
        s; id = :cities, payloads = rows, select = :many,
        tooltip = masque"<b>$(city)</b><br>$(pop) million people",
    )
    nothing
end

# ╔═╡ c1d50012-0001-4000-8000-000000000003
@bind sel masque(fig, cities)

# ╔═╡ c1d50012-0001-4000-8000-000000000004
if isempty(sel.cities)
    md"*Hover over a city, click a few, or drag a box.*"
else
    n = length(sel.cities)
    names = [c.city for c in sel.cities]
    picked = n <= 3 ? join(names, ", ") : join(names[1:3], ", ") * " and $(n - 3) more"
    total = round(sum(c.pop for c in sel.cities); digits = 1)
    count = n == 1 ? "1 city" : "$(n) cities"
    md"**$(count)**, $(total) million people: $(picked)"
end

# ╔═╡ c1d50012-0001-4000-8000-000000000005
let wid = masque(fig, cities)
    HTML(
        "<span id=\"clip_manifest\" style=\"display:none\">" *
            JSON3.write((; width = wid.manifest["width"], height = wid.manifest["height"], layers = wid.manifest["layers"], transforms = wid.manifest["transforms"])) *
            "</span>"
    )
end

# ╔═╡ Cell order:
# ╟─c1d50012-0001-4000-8000-000000000001
# ╟─c1d50012-0001-4000-8000-000000000002
# ╠═c1d50012-0001-4000-8000-000000000003
# ╟─c1d50012-0001-4000-8000-000000000004
# ╟─c1d50012-0001-4000-8000-000000000005
