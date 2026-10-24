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
Click a bar, and the last cell reads its value.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000010
md"""
Create the bar plot the way you normally would, and end the cell with `nothing` so Pluto doesn't show the figure twice. `masque` makes each bar clickable.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000002
begin
    fig = Figure(size = (560, 360))
    ax = Axis(
        fig[1, 1];
        xlabel = "Quarter",
        ylabel = "Value",
        xticks = (1:4, ["Q1", "Q2", "Q3", "Q4"]),
    )
    b = barplot!(ax, 1:4, [2.0, 3.0, 1.5, 2.5])
    nothing
end

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000011
md"""
`bind = b` makes `pick` the clicked bar itself. `@bind pick` saves a click in `pick`, while hovering only highlights the bar and leaves `pick` as it was.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000003
@bind pick masque(fig; bind = b)

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000012
md"""
`pick` starts as `nothing`, and this cell responds when you click a bar. After a click, `pick.value` is the bar's height and `pick.index` is its position in your data.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000004
if isnothing(pick)
    "click a bar"
else
    "Q$(pick.index): value $(pick.value)"
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
# ╟─a1b2c3d4-0001-4000-8000-000000000010
# ╠═a1b2c3d4-0001-4000-8000-000000000002
# ╟─a1b2c3d4-0001-4000-8000-000000000011
# ╠═a1b2c3d4-0001-4000-8000-000000000003
# ╟─a1b2c3d4-0001-4000-8000-000000000012
# ╠═a1b2c3d4-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
