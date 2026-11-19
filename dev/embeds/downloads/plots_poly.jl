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


# ╔═╡ b10f0025-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f0025-0001-4000-8000-000000000002
begin
    fields = [
        Point2f[(0, 0), (4, 0), (4, 3), (0, 3)],
        Point2f[(4, 0), (9, 0), (9, 2), (6, 4), (4, 3)],
        Point2f[(0, 3), (4, 3), (6, 4), (5, 7), (0, 6)],
        Point2f[(6, 4), (9, 2), (10, 6), (5, 7)],
    ]
    crop = ["Wheat", "Barley", "Oats", "Fallow"]

    fig = Figure(size = (520, 320))
    ax = Axis(
        fig[1, 1];
        aspect = DataAspect(),
        xlabel = "East (km)",
        ylabel = "North (km)",
    )
    pl = poly!(
        ax, fields;
        color = 1:4,
        colormap = :Set2_4,
        strokecolor = :white,
        strokewidth = 2,
    )
    nothing
end

# ╔═╡ b10f0025-0001-4000-8000-000000000003
@bind pick masque(fig; bind = pl)

# ╔═╡ b10f0025-0001-4000-8000-000000000004
pick

# ╔═╡ b10f0025-0001-4000-8000-000000000005
masque(
    fig,
    interactables(
        pl;
        payloads = [(crop = c,) for c in crop],
        tooltip = masque"<b>$(crop)</b>",
    ),
)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f0025-0001-4000-8000-000000000001
# ╠═b10f0025-0001-4000-8000-000000000002
# ╠═b10f0025-0001-4000-8000-000000000003
# ╠═b10f0025-0001-4000-8000-000000000004
# ╠═b10f0025-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
