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


# ╔═╡ a1410004-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ a1410004-0001-4000-8000-000000000009
md"""
Hover over a band, a density, a filled contour, a violin, a Voronoi cell, or a box.
"""

# ╔═╡ a1410004-0001-4000-8000-000000000010
md"""
Create the panels the way you normally would, and `masque` makes each filled shape clickable.
"""

# ╔═╡ a1410004-0001-4000-8000-000000000002
begin
    rng = Xoshiro(1)
    pf = Figure(size = (900, 520))
    band!(Axis(pf[1, 1]; title = "band"), 1:10, (1:10) .- 0.5, (1:10) .+ 1.5)
    density!(Axis(pf[1, 2]; title = "density"), randn(rng, 400))
    contourf!(
        Axis(pf[1, 3]; title = "contourf"),
        1:20,
        1:20,
        [sin(i / 3) * cos(j / 3) for i in 1:20, j in 1:20];
        levels = 6,
    )
    violin!(Axis(pf[2, 1]; title = "violin"), repeat([1, 2, 3], inner = 100), randn(rng, 300))
    voronoiplot!(Axis(pf[2, 2]; title = "voronoi"), rand(rng, 15), rand(rng, 15))
    boxplot!(Axis(pf[2, 3]; title = "boxplot"), repeat([1, 2], inner = 120), randn(rng, 240))
    nothing
end

# ╔═╡ a1410004-0001-4000-8000-000000000003
@bind pick masque(pf)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1410004-0001-4000-8000-000000000001
# ╟─a1410004-0001-4000-8000-000000000009
# ╟─a1410004-0001-4000-8000-000000000010
# ╠═a1410004-0001-4000-8000-000000000002
# ╠═a1410004-0001-4000-8000-000000000003
# ╟─00000000-0000-0000-0000-000000000001
