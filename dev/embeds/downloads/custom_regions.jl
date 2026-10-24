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
Hover over a region to see its name, then click it. The last cell shows the name of the region you clicked.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000010
md"""
`regions` adds a circle, a rectangle, and a triangle on top of the image, and `payloads` gives each one a name.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000002
begin
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
    img = [Float32(sin(i / 12) * cos(j / 10)) for i in 1:100, j in 1:100]
    image!(ax, img)
    regions = [
        (:circle, (20.0, 20.0), 14.0),
        (:rect, (60.0, 60.0), 20.0, 14.0),
        (:polygon, [(30.0, 70.0), (50.0, 90.0), (20.0, 90.0)]),
    ]
    names = [(; name = "cell A"), (; name = "cell B"), (; name = "cell C")]
    hits = RegionInteractable(
        ax, regions; payloads = names, id = :cells,
        tooltip = masque"<b>$(name)</b>",
    )
    nothing
end

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000011
md"""
`auto = false` leaves out the image's own cells, so only the regions respond. `@bind sel` saves a click in `sel`, while hovering only shows the tooltip and leaves `sel` as it was.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000003
@bind sel masque(fig, hits; auto = false)

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000012
md"""
`sel.cells` has one part for each kind of shape: `sel.cells.circles` for the circle, `sel.cells.rects` for the rectangle, and `sel.cells.polygons` for the triangle. Each starts as `nothing`, and this cell responds when you click a region. After a click, the part's `name` is the region's name.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000004
begin
    chosen = String[]
    for region in sel.cells
        isnothing(region) || push!(chosen, region.name)
    end
    isempty(chosen) ? "click a region" : join(chosen, ", ") * " selected"
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
