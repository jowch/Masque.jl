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


# ╔═╡ b10f001e-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f001e-0001-4000-8000-000000000002
begin
    rng = Xoshiro(12)
    n = 40_000
    t = 2pi .* rand(rng, n)
    r = 1 .+ 0.15 .* randn(rng, n)
    pts = Point2f.(
        r .* cos.(t) .+ 0.3 .* randn(rng, n) .* (rand(rng, n) .< 0.2),
        r .* sin.(t),
    )

    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; aspect = DataAspect())
    ds = datashader!(ax, pts; colormap = :magma)
    nothing
end

# ╔═╡ b10f001e-0001-4000-8000-000000000003
masque(fig)

# ╔═╡ b10f001e-0001-4000-8000-000000000004
masque(
    fig,
    interactables(ds; tooltip = masque"<b>$(value) points</b> in this pixel"),
)

# ╔═╡ b10f001e-0001-4000-8000-000000000005
# The player needs a bound widget to record. No page shows this cell: a
# click on every pixel is too many states, so the players answer hover.
@bind pick masque(fig; bind = (;))

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f001e-0001-4000-8000-000000000001
# ╠═b10f001e-0001-4000-8000-000000000002
# ╠═b10f001e-0001-4000-8000-000000000003
# ╠═b10f001e-0001-4000-8000-000000000004
# ╠═b10f001e-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
