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


# ╔═╡ b10f0004-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f0004-0001-4000-8000-000000000002
begin
    rng = Xoshiro(4)
    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; xlabel = "Height (cm)")
    d1 = density!(ax, randn(rng, 200) .* 7 .+ 165; color = (:steelblue, 0.5))
    d2 = density!(ax, randn(rng, 200) .* 7 .+ 178; color = (:orange, 0.5))
    nothing
end

# ╔═╡ b10f0004-0001-4000-8000-000000000003
@bind sel masque(fig)

# ╔═╡ b10f0004-0001-4000-8000-000000000004
sel

# ╔═╡ b10f0004-0001-4000-8000-000000000005
masque(
    fig,
    interactables(d1; payloads = [(group = "Women", n = 200)], tooltip = masque"<b>$(group)</b>, $(n) people"),
    interactables(d2; payloads = [(group = "Men", n = 200)], tooltip = masque"<b>$(group)</b>, $(n) people"),
)

# ╔═╡ b10f0004-0001-4000-8000-000000000006
masque(fig, AxisInteractable(ax); auto = false)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f0004-0001-4000-8000-000000000001
# ╠═b10f0004-0001-4000-8000-000000000002
# ╠═b10f0004-0001-4000-8000-000000000003
# ╠═b10f0004-0001-4000-8000-000000000004
# ╠═b10f0004-0001-4000-8000-000000000005
# ╠═b10f0004-0001-4000-8000-000000000006
# ╟─00000000-0000-0000-0000-000000000001
