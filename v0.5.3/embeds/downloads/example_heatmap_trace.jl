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


# ╔═╡ a1420002-0001-4000-8000-000000000001
using CairoMakie, Masque

# ╔═╡ a1420002-0001-4000-8000-000000000009
md"""
Click a cell, and the plot below shows that station's readings, hour by hour, on the day you clicked.
"""

# ╔═╡ a1420002-0001-4000-8000-000000000010
md"""
The heatmap shows one daily mean per station and day, and `temp` gives the hourly values behind each mean.
"""

# ╔═╡ a1420002-0001-4000-8000-000000000002
begin
    stations = ["North", "East", "South", "West"]
    hours = 0:23
    temp(d, s, h) = 12 + 4 * sin(2π * (h - 9) / 24) + 0.6 * d * (s == 3 ? 1 : 0.3) + 1.5 * cos(d / 2 + s)
    daily = [round(sum(temp(d, s, h) for h in hours) / 24; digits = 1) for d in 1:7, s in eachindex(stations)]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "day", yticks = (eachindex(stations), stations), title = "daily mean temperature: click a cell")
    hm = heatmap!(ax, 1:7, eachindex(stations), daily; colormap = :thermal)
    Colorbar(fig[1, 2], hm; label = "°C")
    nothing
end

# ╔═╡ a1420002-0001-4000-8000-000000000011
md"""
`@bind pick` stores the clicked cell: `pick.i` is the day (1 to 7), `pick.j` is the station's position in `stations`, and `pick.value` is the daily mean. `bind = hm` makes `pick` the clicked cell itself, and the colorbar still shows its tooltip but takes no clicks.
"""

# ╔═╡ a1420002-0001-4000-8000-000000000003
@bind pick masque(fig; bind = hm)

# ╔═╡ a1420002-0001-4000-8000-000000000012
md"""
This cell responds to the click: it plots that day's hourly readings, with the daily mean as a dashed line.
"""

# ╔═╡ a1420002-0001-4000-8000-000000000004
begin
    trace = Figure(size = (560, 240))
    if isnothing(pick)
        Axis(trace[1, 1]; xlabel = "hour", ylabel = "°C", title = "click a cell to see that day")
    else
        tax = Axis(
            trace[1, 1]; xlabel = "hour", ylabel = "°C",
            title = "$(stations[pick.j]), day $(pick.i): mean $(pick.value) °C"
        )
        lines!(tax, hours, [temp(pick.i, pick.j, h) for h in hours]; linewidth = 2)
        hlines!(tax, [pick.value]; linestyle = :dash, color = :gray)
    end
    trace
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1420002-0001-4000-8000-000000000001
# ╟─a1420002-0001-4000-8000-000000000009
# ╟─a1420002-0001-4000-8000-000000000010
# ╠═a1420002-0001-4000-8000-000000000002
# ╟─a1420002-0001-4000-8000-000000000011
# ╠═a1420002-0001-4000-8000-000000000003
# ╟─a1420002-0001-4000-8000-000000000012
# ╠═a1420002-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
