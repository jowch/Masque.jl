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

# ╔═╡ a1b2c3d4-0012-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ a1b2c3d4-0012-4000-8000-000000000009
md"""
Hover over a point, and the tooltip is dark because the figure is. Click a point, and the last cell names it.
"""

# ╔═╡ a1b2c3d4-0012-4000-8000-000000000010
md"""
Create the scatter on a dark figure, and pass the scatter to `interactables`. The tooltip takes its theme from the figure's background and its border color from the marker.
"""

# ╔═╡ a1b2c3d4-0012-4000-8000-000000000002
begin
    points = [
        (label = "alpha", x = 1.0, y = 1.0),
        (label = "beta", x = 2.0, y = 2.0),
        (label = "gamma", x = 3.0, y = 1.2),
    ]
    fig = Figure(size = (560, 360); backgroundcolor = :gray12)
    ax = Axis(
        fig[1, 1];
        backgroundcolor = :gray20,
        xtickcolor = :gray80,
        ytickcolor = :gray80,
        xticklabelcolor = :gray80,
        yticklabelcolor = :gray80,
        xlabelcolor = :gray80,
        ylabelcolor = :gray80,
        bottomspinecolor = :gray70,
        leftspinecolor = :gray70,
        rightspinecolor = :gray70,
        topspinecolor = :gray70,
    )
    s = scatter!(
        ax, [p.x for p in points], [p.y for p in points];
        color = ["#e6194b", "#3cb44b", "#4363d8"],
        markersize = 22,
    )
    pts = interactables(s; payloads = points)
    nothing
end

# ╔═╡ a1b2c3d4-0012-4000-8000-000000000011
md"""
`bind = s` makes `pick` the clicked point itself. `@bind pick` saves a click in `pick`, while hovering only shows the tooltip and leaves `pick` as it was.
"""

# ╔═╡ a1b2c3d4-0012-4000-8000-000000000003
@bind pick masque(fig, pts; bind = s)

# ╔═╡ a1b2c3d4-0012-4000-8000-000000000012
md"""
`pick` starts as `nothing`, and this cell responds when you click a point. After a click, `pick.label` is the point's name.
"""

# ╔═╡ a1b2c3d4-0012-4000-8000-000000000004
if isnothing(pick)
    "hover a point, or click one"
else
    "$(pick.label) selected"
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1b2c3d4-0012-4000-8000-000000000001
# ╟─a1b2c3d4-0012-4000-8000-000000000009
# ╟─a1b2c3d4-0012-4000-8000-000000000010
# ╠═a1b2c3d4-0012-4000-8000-000000000002
# ╟─a1b2c3d4-0012-4000-8000-000000000011
# ╠═a1b2c3d4-0012-4000-8000-000000000003
# ╟─a1b2c3d4-0012-4000-8000-000000000012
# ╠═a1b2c3d4-0012-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
