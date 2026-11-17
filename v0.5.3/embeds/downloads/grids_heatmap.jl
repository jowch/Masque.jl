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

# ╔═╡ b15a0001-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ b15a0001-0001-4000-8000-000000000009
md"""
Click a cell, and the last cell shows its indices and value.
"""

# ╔═╡ b15a0001-0001-4000-8000-000000000002
begin
    z = [
        4.0 7.0 10.0
        5.0 8.0 11.0
        6.0 9.0 12.0
        7.0 10.0 13.0
    ]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "i", ylabel = "j")
    p = heatmap!(ax, 1:4, 1:3, z)
    nothing
end

# ╔═╡ b15a0001-0001-4000-8000-000000000003
@bind pick masque(fig; bind = p)

# ╔═╡ b15a0001-0001-4000-8000-000000000004
if isnothing(pick)
    "click a cell"
else
    "z[$(pick.i), $(pick.j)] = $(pick.value)"
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b15a0001-0001-4000-8000-000000000001
# ╟─b15a0001-0001-4000-8000-000000000009
# ╠═b15a0001-0001-4000-8000-000000000002
# ╠═b15a0001-0001-4000-8000-000000000003
# ╠═b15a0001-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
