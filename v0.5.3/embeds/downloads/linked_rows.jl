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

# ╔═╡ c0a10003-0001-4000-8000-000000000001
using CairoMakie, Masque

# ╔═╡ c0a10003-0001-4000-8000-000000000020
md"""
Click a point in either panel, and the same sample is selected in both. The last cell names it.
"""

# ╔═╡ c0a10003-0001-4000-8000-000000000002
begin
    xs = [1.0, 2.0, 3.0, 4.0]
    ys = [2.0, 1.5, 3.0, 2.2]
    zs = [0.8, 2.5, 1.2, 3.1]
    fig = Figure(size = (640, 300))
    p_xy = scatter!(Axis(fig[1, 1]; xlabel = "x", ylabel = "y", title = "xy"), xs, ys; markersize = 18)
    p_xz = scatter!(Axis(fig[1, 2]; xlabel = "x", ylabel = "z", title = "xz"), xs, zs; markersize = 18)
    nothing
end

# ╔═╡ c0a10003-0001-4000-8000-000000000003
@bind row masque(fig; bind = linked(p_xy, p_xz))

# ╔═╡ c0a10003-0001-4000-8000-000000000004
isnothing(row) ? "click a point" : "sample $(row): x = $(xs[row]), y = $(ys[row]), z = $(zs[row])"

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═c0a10003-0001-4000-8000-000000000001
# ╟─c0a10003-0001-4000-8000-000000000020
# ╠═c0a10003-0001-4000-8000-000000000002
# ╠═c0a10003-0001-4000-8000-000000000003
# ╠═c0a10003-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
