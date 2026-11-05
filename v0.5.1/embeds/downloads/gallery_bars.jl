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


# ╔═╡ a1410003-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ a1410003-0001-4000-8000-000000000009
md"""
Hover over a bar, a band, or a span in any panel, since one `masque` call covers them all.
"""

# ╔═╡ a1410003-0001-4000-8000-000000000010
md"""
Create the panels the way you normally would. You do not need an interactable for each recipe, because `masque` finds the bars and spans on its own.
"""

# ╔═╡ a1410003-0001-4000-8000-000000000002
begin
    rng = Xoshiro(1)
    bf = Figure(size = (760, 520))
    hist!(Axis(bf[1, 1]; title = "hist"), randn(rng, 300); bins = 12, color = :steelblue)
    waterfall!(Axis(bf[1, 2]; title = "waterfall"), 1:4, [3.0, -1.0, 2.0, -0.5])
    crossbar!(
        Axis(bf[2, 1]; title = "crossbar"),
        [1, 2, 3],
        [5.0, 6.0, 4.0],
        [3.0, 4.0, 2.0],
        [7.0, 8.0, 6.0],
    )
    a4 = Axis(bf[2, 2]; title = "bars + spans")
    barplot!(a4, 1:3, [2.0, 3.0, 1.0])
    hspan!(a4, [0.4], [0.8]; color = (:orange, 0.2))
    vspan!(a4, [1.6], [2.0]; color = (:green, 0.2))
    nothing
end

# ╔═╡ a1410003-0001-4000-8000-000000000003
@bind pick masque(bf)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1410003-0001-4000-8000-000000000001
# ╟─a1410003-0001-4000-8000-000000000009
# ╟─a1410003-0001-4000-8000-000000000010
# ╠═a1410003-0001-4000-8000-000000000002
# ╠═a1410003-0001-4000-8000-000000000003
# ╟─00000000-0000-0000-0000-000000000001
