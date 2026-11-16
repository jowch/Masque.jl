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


# ╔═╡ b10f0013-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ b10f0013-0001-4000-8000-000000000002
begin
    cities = ["Lisbon", "Madrid", "Paris", "Berlin", "Rome", "Vienna"]
    lon = [-9.1, -3.7, 2.4, 13.4, 12.5, 16.4]
    lat = [38.7, 40.4, 48.9, 52.5, 41.9, 48.2]

    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; xlabel = "Longitude", ylabel = "Latitude", limits = (-14, 21, 36, 56))
    scatter!(ax, lon, lat; color = :gray60, markersize = 6)
    t = text!(ax, lon, lat; text = cities, align = (:center, :bottom), offset = (0, 4))
    nothing
end

# ╔═╡ b10f0013-0001-4000-8000-000000000003
@bind pick masque(fig; bind = t)

# ╔═╡ b10f0013-0001-4000-8000-000000000004
pick

# ╔═╡ b10f0013-0001-4000-8000-000000000005
masque(fig, interactables(t; payloads = [(people = p,) for p in [0.5, 3.3, 2.1, 3.7, 2.8, 2.0]], tooltip = masque"<b>$(text)</b><br>$(people) million people"))

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f0013-0001-4000-8000-000000000001
# ╠═b10f0013-0001-4000-8000-000000000002
# ╠═b10f0013-0001-4000-8000-000000000003
# ╠═b10f0013-0001-4000-8000-000000000004
# ╠═b10f0013-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
