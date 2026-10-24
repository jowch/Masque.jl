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

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000100
md"""
Click a line, and the last cell names the point you clicked.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000101
md"""
Plot both curves with one `series!` call, so each curve is one mark of the same plot.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000102
begin
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1])
    xs = 0:0.5:10
    sr = series!(ax, xs, [sin.(xs) cos.(xs)]'; labels = ["sine", "cosine"])
    nothing
end

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000103
md"""
A line only shows its tooltip until you name it in `bind`. `bind = sr` makes the curves clickable, and `@bind pick` saves the point you clicked in `pick`.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000104
@bind pick masque(fig; bind = sr)

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000105
md"""
`pick` starts as `nothing`, and this cell responds when you click a curve. A click picks the point nearest it: `pick.line` is `1` for the first curve and `2` for the second, `pick.index` is the point's position in `xs`, and `pick.x` and `pick.y` are the point.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000106
if isnothing(pick)
    "click a line"
else
    names = ["sine", "cosine"]
    "you clicked the $(names[pick.line]) line at x = $(pick.x)"
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1b2c3d4-0001-4000-8000-000000000001
# ╟─a1b2c3d4-0001-4000-8000-000000000100
# ╟─a1b2c3d4-0001-4000-8000-000000000101
# ╠═a1b2c3d4-0001-4000-8000-000000000102
# ╟─a1b2c3d4-0001-4000-8000-000000000103
# ╠═a1b2c3d4-0001-4000-8000-000000000104
# ╟─a1b2c3d4-0001-4000-8000-000000000105
# ╠═a1b2c3d4-0001-4000-8000-000000000106
# ╟─00000000-0000-0000-0000-000000000001
