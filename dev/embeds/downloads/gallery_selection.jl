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


# ╔═╡ a1410002-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ a1410002-0001-4000-8000-000000000009
md"""
Click a point on the left, and the plot on the right highlights the same sample, plotted against `z`.
"""

# ╔═╡ a1410002-0001-4000-8000-000000000010
md"""
Create the scatter and store the click with `@bind pick`. `bind = s_left` makes `pick` the clicked point itself.
"""

# ╔═╡ a1410002-0001-4000-8000-000000000002
begin
    xs = [1.0, 2.0, 3.0, 4.0, 5.0]
    ys = [1.0, 2.0, 1.5, 2.5, 1.2]
    zs = [3.2, 2.1, 2.8, 1.4, 2.6]
    fig_l = Figure(size = (420, 300))
    ax_l = Axis(fig_l[1, 1]; ylabel = "y", title = "click to select")
    s_left = scatter!(ax_l, xs, ys; color = :teal, markersize = 20)
    nothing
end

# ╔═╡ a1410002-0001-4000-8000-000000000003
@bind pick masque(fig_l; bind = s_left)

# ╔═╡ a1410002-0001-4000-8000-000000000011
md"""
This cell responds to the click, and so does the figure below, because it uses `pick` too.
"""

# ╔═╡ a1410002-0001-4000-8000-000000000004
if isnothing(pick)
    "click a point"
else
    "point $(pick.index) selected"
end

# ╔═╡ a1410002-0001-4000-8000-000000000012
md"""
Plot `z` for the same samples in the same order, so `selected` can highlight the one you clicked.
"""

# ╔═╡ a1410002-0001-4000-8000-000000000005
begin
    fig_r = Figure(size = (420, 300))
    ax_r = Axis(fig_r[1, 1]; ylabel = "z", title = "the same sample, against z")
    s_right = scatter!(ax_r, xs, zs; color = :teal, markersize = 20)
    held = isnothing(pick) ? Int[] : Int[pick.index]
    nothing
end

# ╔═╡ a1410002-0001-4000-8000-000000000006
@bind right_click masque(fig_r; selected = held)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1410002-0001-4000-8000-000000000001
# ╟─a1410002-0001-4000-8000-000000000009
# ╟─a1410002-0001-4000-8000-000000000010
# ╠═a1410002-0001-4000-8000-000000000002
# ╠═a1410002-0001-4000-8000-000000000003
# ╟─a1410002-0001-4000-8000-000000000011
# ╠═a1410002-0001-4000-8000-000000000004
# ╟─a1410002-0001-4000-8000-000000000012
# ╠═a1410002-0001-4000-8000-000000000005
# ╠═a1410002-0001-4000-8000-000000000006
# ╟─00000000-0000-0000-0000-000000000001
