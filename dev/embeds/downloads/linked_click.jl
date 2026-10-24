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

# ╔═╡ a1b2c3d4-00a1-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ a1b2c3d4-00a1-4000-8000-000000000009
md"""
Click a point in the xy plot, and the same sample is selected in the xz plot. Hover stays on the plot under the pointer.
"""

# ╔═╡ a1b2c3d4-00a1-4000-8000-000000000010
md"""
Plot the same samples, in the same order, in two figures. The xy figure stores the click in `pick`, and `bind = s_xy` makes `pick` the clicked point itself.
"""

# ╔═╡ a1b2c3d4-00a1-4000-8000-000000000002
begin
    xs = [1.0, 2.0, 3.0, 4.0]
    ys = [2.0, 1.5, 3.0, 2.2]
    zs = [0.8, 2.5, 1.2, 3.1]
    fig_xy = Figure(size = (420, 280))
    ax_xy = Axis(fig_xy[1, 1]; xlabel = "x", ylabel = "y", title = "xy")
    s_xy = scatter!(ax_xy, xs, ys; markersize = 18)
    nothing
end

# ╔═╡ a1b2c3d4-00a1-4000-8000-000000000003
@bind pick masque(fig_xy; bind = s_xy)

# ╔═╡ a1b2c3d4-00a1-4000-8000-000000000011
md"""
This cell uses `pick` and passes the clicked index as `selected`, so the xz plot highlights the sample you clicked.
"""

# ╔═╡ a1b2c3d4-00a1-4000-8000-000000000004
begin
    fig_xz = Figure(size = (420, 280))
    ax_xz = Axis(fig_xz[1, 1]; xlabel = "x", ylabel = "z", title = "xz")
    scatter!(ax_xz, xs, zs; markersize = 18)
    masque(fig_xz; selected = isnothing(pick) ? Int[] : [pick.index])
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1b2c3d4-00a1-4000-8000-000000000001
# ╟─a1b2c3d4-00a1-4000-8000-000000000009
# ╟─a1b2c3d4-00a1-4000-8000-000000000010
# ╠═a1b2c3d4-00a1-4000-8000-000000000002
# ╠═a1b2c3d4-00a1-4000-8000-000000000003
# ╟─a1b2c3d4-00a1-4000-8000-000000000011
# ╠═a1b2c3d4-00a1-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
