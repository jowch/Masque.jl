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

# ╔═╡ b18a0001-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ b18a0001-0001-4000-8000-000000000009
md"""
Move the pointer across the axis, and the tooltip follows it and shows the data coordinates `(x, y)`.
"""

# ╔═╡ b18a0001-0001-4000-8000-000000000010
md"""
Create the line plot the way you normally would, and add an `AxisInteractable` for its axis, because `masque(fig)` does not add one on its own.
"""

# ╔═╡ b18a0001-0001-4000-8000-000000000002
begin
    xs = range(0, 2π; length = 80)
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "sin(x)")
    lines!(ax, xs, sin.(xs); color = :steelblue)
    ints = AxisInteractable(ax)
    nothing
end

# ╔═╡ b18a0001-0001-4000-8000-000000000011
md"""
In your own notebook, `@bind pick` saves a click in `pick`, and `bind = ints` makes `pick` the readout's value, with its position in `pick.x` and `pick.y`. This page does not record clicks, so only the tooltip works here.
"""

# ╔═╡ b18a0001-0001-4000-8000-000000000003
@bind pick masque(fig, ints; auto = false, bind = ints)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b18a0001-0001-4000-8000-000000000001
# ╟─b18a0001-0001-4000-8000-000000000009
# ╟─b18a0001-0001-4000-8000-000000000010
# ╠═b18a0001-0001-4000-8000-000000000002
# ╟─b18a0001-0001-4000-8000-000000000011
# ╠═b18a0001-0001-4000-8000-000000000003
# ╟─00000000-0000-0000-0000-000000000001
