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


# ╔═╡ b3d00001-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ b3d00001-0001-4000-8000-000000000020
md"""
Hover the surface to read its height, or a station to see its name, then click a station.
"""

# ╔═╡ b3d00001-0001-4000-8000-000000000002
begin
    hill(x, y) = 900 + 600 * exp(-((x - 1)^2 + (y - 0.5)^2)) + 400 * exp(-((x + 1.2)^2 + (y + 1)^2) / 0.8)
    xs = range(-3, 3; length = 25)
    ys = range(-3, 3; length = 25)
    stations = [
        (; name = "Ridge", x = 1.0, y = 0.5),
        (; name = "Saddle", x = 0.0, y = -0.3),
        (; name = "East peak", x = -1.2, y = -1.0),
        (; name = "Valley", x = -2.2, y = 2.0),
        (; name = "Plateau", x = 2.4, y = -2.0),
    ]
    elevation = [round(Int, hill(s.x, s.y)) for s in stations]
    nothing
end

# ╔═╡ b3d00001-0001-4000-8000-000000000003
begin
    fig = Figure(size = (560, 460))
    ax = Axis3(fig[1, 1]; azimuth = 0.9, elevation = 0.45, xlabel = "east (km)", ylabel = "north (km)", zlabel = "height (m)")
    surface!(ax, xs, ys, [hill(x, y) for x in xs, y in ys]; colormap = :terrain, alpha = 0.9)
    sc = scatter!(
        ax, [s.x for s in stations], [s.y for s in stations], elevation;
        color = :black, markersize = 14,
    )
    sites = interactables(sc; payloads = [(; name = s.name, height = h) for (s, h) in zip(stations, elevation)])
    nothing
end

# ╔═╡ b3d00001-0001-4000-8000-000000000004
@bind pick masque(fig, sites; bind = sc)

# ╔═╡ b3d00001-0001-4000-8000-000000000005
isnothing(pick) ? "click a station" : "$(pick.name): $(pick.height) m"

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b3d00001-0001-4000-8000-000000000001
# ╟─b3d00001-0001-4000-8000-000000000020
# ╠═b3d00001-0001-4000-8000-000000000002
# ╠═b3d00001-0001-4000-8000-000000000003
# ╠═b3d00001-0001-4000-8000-000000000004
# ╠═b3d00001-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
