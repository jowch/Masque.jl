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


# ╔═╡ b10f001c-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f001c-0001-4000-8000-000000000002
begin
    xs = range(0, 10; length = 80)
    ys = range(0, 6; length = 50)
    height = [
        400 +
            300 * exp(-((x - 3)^2 + (y - 3)^2) / 4) +
            200 * exp(-((x - 7.5)^2 + (y - 2)^2) / 2)
            for x in xs, y in ys
    ]

    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; xlabel = "x (km)", ylabel = "y (km)")
    cf = contourf!(ax, xs, ys, height; levels = 400:50:700)
    Colorbar(fig[1, 2], cf; label = "Height (m)")
    nothing
end

# ╔═╡ b10f001c-0001-4000-8000-000000000003
@bind pick masque(fig; bind = cf)

# ╔═╡ b10f001c-0001-4000-8000-000000000004
pick

# ╔═╡ b10f001c-0001-4000-8000-000000000005
masque(
    fig,
    interactables(cf; tooltip = masque"<b>$(low:.0f) to $(high:.0f) m</b>"),
)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f001c-0001-4000-8000-000000000001
# ╠═b10f001c-0001-4000-8000-000000000002
# ╠═b10f001c-0001-4000-8000-000000000003
# ╠═b10f001c-0001-4000-8000-000000000004
# ╠═b10f001c-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
