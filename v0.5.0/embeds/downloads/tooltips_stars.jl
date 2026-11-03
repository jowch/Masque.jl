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


# ╔═╡ c0e1a001-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ c0e1a001-0001-4000-8000-000000000020
md"""
Hover over a star to see its name, type and distance. Click one and the last cell names it.
"""

# ╔═╡ c0e1a001-0001-4000-8000-000000000005
begin
    fig2, sc2 = hr_diagram()
    tips = interactables(sc2; payloads = info, tooltip = masque"<b>$(name)</b><br>$(type)<br>$(dist) light years")
    nothing
end

# ╔═╡ c0e1a001-0001-4000-8000-000000000006
@bind pick masque(fig2, tips; bind = sc2)

# ╔═╡ c0e1a001-0001-4000-8000-000000000007
isnothing(pick) ? "click a star" : "$(pick.name) is a $(pick.type) star"

# ╔═╡ c0e1a001-0001-4000-8000-000000000002
begin
    stars = [
        (name = "Sirius", type = "A1V", teff = 9940, lum = 25.4, dist = 8.6),
        (name = "Canopus", type = "A9II", teff = 7280, lum = 10700.0, dist = 310.0),
        (name = "Arcturus", type = "K1.5III", teff = 4286, lum = 170.0, dist = 36.7),
        (name = "Vega", type = "A0V", teff = 9602, lum = 40.0, dist = 25.0),
        (name = "Capella", type = "G8III", teff = 4970, lum = 78.7, dist = 42.9),
        (name = "Rigel", type = "B8Ia", teff = 12100, lum = 1.2e5, dist = 860.0),
        (name = "Procyon", type = "F5IV", teff = 6530, lum = 6.9, dist = 11.5),
        (name = "Betelgeuse", type = "M1Ia", teff = 3600, lum = 9.0e4, dist = 548.0),
        (name = "Altair", type = "A7V", teff = 7765, lum = 10.6, dist = 16.7),
        (name = "Aldebaran", type = "K5III", teff = 3910, lum = 439.0, dist = 65.3),
        (name = "Spica", type = "B1V", teff = 22400, lum = 12100.0, dist = 250.0),
        (name = "Pollux", type = "K0III", teff = 4666, lum = 32.7, dist = 33.8),
    ]
    spectral = Dict(
        'B' => "#6baed6", 'A' => "#9ecae1", 'F' => "#e6c84f",
        'G' => "#f2b134", 'K' => "#f08a3c", 'M' => "#d94801",
    )
    info = [(; name = s.name, type = s.type, dist = s.dist) for s in stars]
    nothing
end

# ╔═╡ c0e1a001-0001-4000-8000-000000000003
function hr_diagram()
    fig = Figure(size = (560, 360))
    ax = Axis(
        fig[1, 1]; xreversed = true, xticks = 4000:4000:20000, xtickformat = "{:.0f}",
        xlabel = "surface temperature (K)", ylabel = "log₁₀ luminosity (Sun = 0)",
    )
    sc = scatter!(
        ax, [s.teff for s in stars], log10.([s.lum for s in stars]);
        color = [spectral[s.type[1]] for s in stars], markersize = 16,
    )
    return fig, sc
end;

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═c0e1a001-0001-4000-8000-000000000001
# ╟─c0e1a001-0001-4000-8000-000000000020
# ╠═c0e1a001-0001-4000-8000-000000000005
# ╠═c0e1a001-0001-4000-8000-000000000006
# ╠═c0e1a001-0001-4000-8000-000000000007
# ╠═c0e1a001-0001-4000-8000-000000000002
# ╠═c0e1a001-0001-4000-8000-000000000003
# ╟─00000000-0000-0000-0000-000000000001
