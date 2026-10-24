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
Click a legend entry, and the second figure fades the other line.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000101
md"""
Create two labeled lines and an `axislegend` the way you normally would, and end the cell with `nothing` so Pluto doesn't show the figure twice.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000102
begin
    xs = range(0, 2π; length = 80)
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
    lines!(ax, xs, sin.(xs); label = "a")
    lines!(ax, xs, cos.(xs); label = "b")
    axislegend(ax)
    nothing
end

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000103
md"""
`bind = :legend` makes `pick` the legend's value, and `@bind pick` saves a legend click in `pick`.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000104
@bind pick masque(fig; bind = :legend)

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000105
md"""
This cell creates a second figure from `pick`, so when you click a legend entry, the other line fades.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000106
begin
    focus = pick isa LegendEvent ? pick.label : nothing
    fig2 = Figure(size = (560, 360))
    ax2 = Axis(fig2[1, 1])
    for (label, f) in (("a", sin), ("b", cos))
        faded = !isnothing(focus) && label != focus
        lines!(ax2, xs, f.(xs); label, alpha = faded ? 0.2 : 1.0)
    end
    fig2
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
