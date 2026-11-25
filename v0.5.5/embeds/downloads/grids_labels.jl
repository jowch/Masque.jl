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

# ╔═╡ c0a10006-0001-4000-8000-000000000001
using CairoMakie, Masque

# ╔═╡ c0a10006-0001-4000-8000-000000000020
md"""
Hover a cell to see the two names and the value, or click it.
"""

# ╔═╡ c0a10006-0001-4000-8000-000000000002
begin
    contacts = [1.0 0.31 0.08; 0.31 1.0 0.54; 0.08 0.54 1.0]
    fig = Figure(size = (420, 360))
    names = ["F17", "I24", "K31"]
    ax = Axis(fig[1, 1]; xticks = (1:3, names), yticks = (1:3, names))
    p = heatmap!(ax, 1:3, 1:3, contacts)
    labeled = interactables(
        p;
        payloads = (i, j) -> (; x = names[i], y = names[j]),
        tooltip = masque"($(x), $(y)) = $(value)",
    )
    nothing
end

# ╔═╡ c0a10006-0001-4000-8000-000000000003
@bind pick masque(fig, labeled; bind = p)

# ╔═╡ c0a10006-0001-4000-8000-000000000004
isnothing(pick) ? "click a cell" : "$(pick.x) and $(pick.y): $(pick.value)"

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═c0a10006-0001-4000-8000-000000000001
# ╟─c0a10006-0001-4000-8000-000000000020
# ╠═c0a10006-0001-4000-8000-000000000002
# ╠═c0a10006-0001-4000-8000-000000000003
# ╠═c0a10006-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
