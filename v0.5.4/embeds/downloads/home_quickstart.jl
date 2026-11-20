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

# ╔═╡ b0e1e001-0001-4000-8000-000000000001
using CairoMakie, Masque

# ╔═╡ b0e1e001-0001-4000-8000-000000000002
begin
    xs = [1.0, 2.0, 3.0, 4.0]
    ys = [2.0, 1.0, 4.0, 3.0]
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1])
    s = scatter!(ax, xs, ys; markersize = 16)
    points = [(name = "one",), (name = "two",), (name = "three",), (name = "four",)]
    pts = interactables(s; payloads = points)
    nothing
end

# ╔═╡ b0e1e001-0001-4000-8000-000000000009
md"""
Hover over a point to see its name, then click it, and the last cell names the point you clicked.
"""

# ╔═╡ b0e1e001-0001-4000-8000-000000000003
@bind sel masque(fig, pts)

# ╔═╡ b0e1e001-0001-4000-8000-000000000004
if isnothing(sel.scatter)
    "click a point"
else
    "$(sel.scatter.name) selected, y = $(sel.scatter.y)"
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b0e1e001-0001-4000-8000-000000000001
# ╠═b0e1e001-0001-4000-8000-000000000002
# ╟─b0e1e001-0001-4000-8000-000000000009
# ╠═b0e1e001-0001-4000-8000-000000000003
# ╠═b0e1e001-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
