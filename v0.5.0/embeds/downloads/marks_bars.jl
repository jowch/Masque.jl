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

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000009
md"""
Click any segment of a stack, and the last cell names it.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000002
begin
    quarter = [1, 1, 2, 2, 3, 3, 4, 4]
    product = [1, 2, 1, 2, 1, 2, 1, 2]
    sales = [2.0, 1.0, 3.0, 1.5, 1.5, 2.0, 2.5, 0.5]
    products = ["Hardware", "Services"]
    fig = Figure(size = (560, 360))
    ax = Axis(
        fig[1, 1];
        xlabel = "Quarter",
        ylabel = "Sales",
        xticks = (1:4, ["Q1", "Q2", "Q3", "Q4"]),
    )
    colors = [:steelblue, :darkorange]
    b = barplot!(ax, quarter, sales; stack = product, color = colors[product])
    nothing
end

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000003
@bind pick masque(fig; bind = b)

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000012
md"""
`pick.low` and `pick.high` place the segment within its bar, and `pick.index` is its position in your data.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000004
if isnothing(pick)
    "click a segment"
else
    "Q$(quarter[pick.index]) $(products[product[pick.index]]): $(pick.low) to $(pick.high)"
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1b2c3d4-0001-4000-8000-000000000001
# ╟─a1b2c3d4-0001-4000-8000-000000000009
# ╠═a1b2c3d4-0001-4000-8000-000000000002
# ╠═a1b2c3d4-0001-4000-8000-000000000003
# ╟─a1b2c3d4-0001-4000-8000-000000000012
# ╠═a1b2c3d4-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
