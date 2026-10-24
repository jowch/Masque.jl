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

# ╔═╡ a1b2c3d4-00b1-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ a1b2c3d4-00b1-4000-8000-000000000009
md"""
Hover over a legend entry, and every point in that series highlights on both axes.
"""

# ╔═╡ a1b2c3d4-00b1-4000-8000-000000000010
md"""
Label each scatter plot and put both in one `Legend`, so hovering over an entry highlights the series it names.
"""

# ╔═╡ a1b2c3d4-00b1-4000-8000-000000000002
begin
    xs = [1.0, 2.0, 3.0, 4.0]
    ys = [2.0, 1.5, 3.0, 2.2]
    zs = [0.8, 2.5, 1.2, 3.1]
    fig = Figure(size = (700, 280))
    ax_xy = Axis(fig[1, 1]; xlabel = "x", ylabel = "y", title = "xy")
    ax_xz = Axis(fig[1, 2]; xlabel = "x", ylabel = "z", title = "xz")
    p_xy = scatter!(ax_xy, xs, ys; label = "xy", markersize = 18)
    p_xz = scatter!(ax_xz, xs, zs; label = "xz", markersize = 18)
    Legend(fig[1, 3], [p_xy, p_xz], ["xy", "xz"])
    nothing
end

# ╔═╡ a1b2c3d4-00b1-4000-8000-000000000011
md"""
In your own notebook, `@bind pick` saves a click on an entry in `pick`, and `bind = :legend` makes `pick` the legend's value, but this page does not show it.
"""

# ╔═╡ a1b2c3d4-00b1-4000-8000-000000000003
@bind pick masque(fig; bind = :legend)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1b2c3d4-00b1-4000-8000-000000000001
# ╟─a1b2c3d4-00b1-4000-8000-000000000009
# ╟─a1b2c3d4-00b1-4000-8000-000000000010
# ╠═a1b2c3d4-00b1-4000-8000-000000000002
# ╟─a1b2c3d4-00b1-4000-8000-000000000011
# ╠═a1b2c3d4-00b1-4000-8000-000000000003
# ╟═e1be0000-0000-4000-8000-000000000001
# ╟═00000000-0000-0000-0000-000000000001
# ╟═00000000-0000-0000-0000-000000000002
