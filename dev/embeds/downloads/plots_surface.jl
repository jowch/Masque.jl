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


# ╔═╡ b10f0020-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f0020-0001-4000-8000-000000000002
begin
    xs = range(-2, 2; length = 15)
    ys = range(-2, 2; length = 15)
    zs = [
        exp(-(x^2 + y^2)) + 0.5 * exp(-((x - 1)^2 + (y + 1)^2) * 2)
            for x in xs, y in ys
    ]

    fig = Figure(size = (520, 380))
    ax = Axis3(
        fig[1, 1];
        xlabel = "x (km)",
        ylabel = "y (km)",
        zlabel = "Height (km)",
    )
    sf = surface!(ax, xs, ys, zs; colormap = :viridis)
    nothing
end

# ╔═╡ b10f0020-0001-4000-8000-000000000003
masque(fig)

# ╔═╡ b10f0020-0001-4000-8000-000000000004
masque(
    fig,
    interactables(
        sf;
        tooltip = masque"<b>$(z:.2f) km</b> high at $(x:.1f), $(y:.1f)",
    ),
)

# ╔═╡ b10f0020-0001-4000-8000-000000000005
# The player needs a bound widget to record. No page shows this cell: a
# surface has cells under a screen pixel, so the players answer hover.
@bind pick masque(fig; bind = (;))

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f0020-0001-4000-8000-000000000001
# ╠═b10f0020-0001-4000-8000-000000000002
# ╠═b10f0020-0001-4000-8000-000000000003
# ╠═b10f0020-0001-4000-8000-000000000004
# ╠═b10f0020-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
