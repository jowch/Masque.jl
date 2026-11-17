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


# ╔═╡ b10f0001-0001-4000-8000-000000000001
using Masque, CairoMakie, Random, Statistics

# ╔═╡ b10f0001-0001-4000-8000-000000000002
begin
    rng = Xoshiro(1)
    groups = repeat([1, 2, 3]; inner = 100)
    weights = [randn(rng, 100) .+ 4; randn(rng, 100) .+ 5; randn(rng, 100) .+ 4.5]

    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; xticks = (1:3, ["Adelie", "Chinstrap", "Gentoo"]), ylabel = "Weight (kg)")
    v = violin!(ax, groups, weights)
    nothing
end

# ╔═╡ b10f0001-0001-4000-8000-000000000003
@bind pick masque(fig; bind = v)

# ╔═╡ b10f0001-0001-4000-8000-000000000004
pick

# ╔═╡ b10f0001-0001-4000-8000-000000000005
summary = [
    (species = "Adelie", n = 100, median = round(median(weights[groups .== 1]); digits = 1)),
    (species = "Chinstrap", n = 100, median = round(median(weights[groups .== 2]); digits = 1)),
    (species = "Gentoo", n = 100, median = round(median(weights[groups .== 3]); digits = 1)),
]

# ╔═╡ b10f0001-0001-4000-8000-000000000006
masque(fig, interactables(v; payloads = summary, tooltip = masque"<b>$(species)</b><br>$(n) birds, median $(median) kg"))

# ╔═╡ b10f0001-0001-4000-8000-000000000007
masque(fig, interactables(v; select = :many))

# ╔═╡ b10f0001-0001-4000-8000-000000000008
masque(fig, AxisInteractable(ax); auto = false)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f0001-0001-4000-8000-000000000001
# ╠═b10f0001-0001-4000-8000-000000000002
# ╠═b10f0001-0001-4000-8000-000000000003
# ╠═b10f0001-0001-4000-8000-000000000004
# ╠═b10f0001-0001-4000-8000-000000000005
# ╠═b10f0001-0001-4000-8000-000000000006
# ╠═b10f0001-0001-4000-8000-000000000007
# ╠═b10f0001-0001-4000-8000-000000000008
# ╟─00000000-0000-0000-0000-000000000001
