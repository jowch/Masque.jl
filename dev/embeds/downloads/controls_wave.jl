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

# ╔═╡ a1b2c3d4-0002-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ a1b2c3d4-0002-4000-8000-000000000002
begin
    xs = range(0, 2π; length = 200)
    fig = Figure(size = (560, 380))
    ax = Axis(fig[1, 1:2])
    wave = lines!(ax, xs, sin.(xs))
    freq = Slider(fig[2, 1]; range = 1:0.5:5, startvalue = 1)
    dots = Toggle(fig[2, 2]; active = false)
    nothing
end

# ╔═╡ a1b2c3d4-0002-4000-8000-000000000003
@bind w2 masque(
    fig, (freq = freq, dots = dots);
    onchange = state -> update!(wave, xs, sin.(state.freq .* xs); linestyle = state.dots ? :dot : :solid)
)

# ╔═╡ a1b2c3d4-0002-4000-8000-000000000004
w2.freq, w2.dots

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1b2c3d4-0002-4000-8000-000000000001
# ╠═a1b2c3d4-0002-4000-8000-000000000002
# ╠═a1b2c3d4-0002-4000-8000-000000000003
# ╠═a1b2c3d4-0002-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
