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

# ╔═╡ c0a10007-0001-4000-8000-000000000001
using CairoMakie, Masque

# ╔═╡ c0a10007-0001-4000-8000-000000000020
md"""
Hover a cell to read its value, or click it.
"""

# ╔═╡ c0a10007-0001-4000-8000-000000000002
begin
    z = [i + 10j for i in 1:4, j in 1:3]
    fig = Figure(size = (480, 320))
    ax = Axis(fig[1, 1])
    image!(ax, 0.5 .. 4.5, 0.5 .. 3.5, get(cgrad(:viridis), z ./ maximum(z)); interpolate = false)
    nothing
end

# ╔═╡ c0a10007-0001-4000-8000-000000000003
cells = GridInteractable(ax, 0.5:1:4.5, 0.5:1:3.5, z; id = :cells);

# ╔═╡ c0a10007-0001-4000-8000-000000000004
@bind pick masque(fig, cells; bind = cells)

# ╔═╡ c0a10007-0001-4000-8000-000000000005
isnothing(pick) ? "click a cell" : "cell ($(pick.i), $(pick.j)) = $(pick.value)"

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═c0a10007-0001-4000-8000-000000000001
# ╟─c0a10007-0001-4000-8000-000000000020
# ╠═c0a10007-0001-4000-8000-000000000002
# ╠═c0a10007-0001-4000-8000-000000000003
# ╠═c0a10007-0001-4000-8000-000000000004
# ╠═c0a10007-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
