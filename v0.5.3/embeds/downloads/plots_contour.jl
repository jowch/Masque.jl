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


# ╔═╡ b10f0010-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f0010-0001-4000-8000-000000000002
begin
    xs = range(-3, 3; length = 60)
    ys = range(-2, 2; length = 40)
    height = [exp(-(x^2 + 2y^2) / 3) * 100 for x in xs, y in ys]

    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; xlabel = "East (km)", ylabel = "North (km)")
    c = contour!(ax, xs, ys, height; levels = 10:20:90)
    nothing
end

# ╔═╡ b10f0010-0001-4000-8000-000000000003
@bind pick masque(fig; bind = c)

# ╔═╡ b10f0010-0001-4000-8000-000000000004
pick

# ╔═╡ b10f0010-0001-4000-8000-000000000005
begin
    fig2 = Figure(size = (520, 320))
    ax2 = Axis(fig2[1, 1]; xlabel = "East (km)", ylabel = "North (km)")
    contour!(ax2, xs, ys, height; levels = 10:20:90, labels = true)
    masque(fig2)
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f0010-0001-4000-8000-000000000001
# ╠═b10f0010-0001-4000-8000-000000000002
# ╠═b10f0010-0001-4000-8000-000000000003
# ╠═b10f0010-0001-4000-8000-000000000004
# ╠═b10f0010-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
