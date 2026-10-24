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

# ╔═╡ a1b2c3d4-0011-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ a1b2c3d4-0011-4000-8000-000000000009
md"""
Hover over a city to see its name and population. Click one and the last cell names it.
"""

# ╔═╡ a1b2c3d4-0011-4000-8000-000000000010
md"""
Scatter the cities the way you normally would. The tooltip template shows each point's `city` and `pop`, and the tooltip's border uses the marker's color.
"""

# ╔═╡ a1b2c3d4-0011-4000-8000-000000000002
begin
    cities = [
        (city = "Tokyo", pop = 37_400_000, x = 1.0, y = 1.0),
        (city = "Delhi", pop = 32_900_000, x = 2.0, y = 4.0),
        (city = "Shanghai", pop = 28_500_000, x = 3.0, y = 9.0),
        (city = "São Paulo", pop = 22_400_000, x = 4.0, y = 16.0),
    ]
    palette = ["#e6194b", "#3cb44b", "#4363d8", "#f58231"]
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
    s = scatter!(ax, [1.0, 2.0, 3.0, 4.0], [1.0, 4.0, 9.0, 16.0]; color = palette, markersize = 20)
    tips = interactables(
        s;
        payloads = cities,
        tooltip = masque"<b>$(city)</b><br>pop $(pop:,)",
    )
    nothing
end

# ╔═╡ a1b2c3d4-0011-4000-8000-000000000011
md"""
`bind = s` makes `pick` the clicked city itself. `@bind pick` saves a click in `pick`, while hovering only shows the tooltip and leaves `pick` as it was.
"""

# ╔═╡ a1b2c3d4-0011-4000-8000-000000000003
@bind pick masque(fig, tips; bind = s)

# ╔═╡ a1b2c3d4-0011-4000-8000-000000000012
md"""
`pick` starts as `nothing`, and this cell responds when you click a city.
"""

# ╔═╡ a1b2c3d4-0011-4000-8000-000000000004
if isnothing(pick)
    "hover a city, or click one"
else
    "$(pick.city) selected"
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1b2c3d4-0011-4000-8000-000000000001
# ╟─a1b2c3d4-0011-4000-8000-000000000009
# ╟─a1b2c3d4-0011-4000-8000-000000000010
# ╠═a1b2c3d4-0011-4000-8000-000000000002
# ╟─a1b2c3d4-0011-4000-8000-000000000011
# ╠═a1b2c3d4-0011-4000-8000-000000000003
# ╟─a1b2c3d4-0011-4000-8000-000000000012
# ╠═a1b2c3d4-0011-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
