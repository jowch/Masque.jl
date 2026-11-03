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


# ╔═╡ a1410006-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ a1410006-0001-4000-8000-000000000009
md"""
Click a label, including the tilted one and the annotation, and the last cell names it.
"""

# ╔═╡ a1410006-0001-4000-8000-000000000010
md"""
Add `text!` and `annotation!` on the scatter you already have, and `masque` makes the labels clickable.
"""

# ╔═╡ a1410006-0001-4000-8000-000000000002
begin
    fig = Figure(size = (500, 350))
    ax = Axis(fig[1, 1]; title = "click a label")
    pts = [(1.0, 1.0), (2.0, 3.0), (3.0, 2.0)]
    scatter!(ax, first.(pts), last.(pts); markersize = 16)
    labels = text!(
        ax, first.(pts), last.(pts);
        text = ["Alpha", "Beta", "Gamma"], offset = (8, 8), fontsize = 18,
    )
    tilted = text!(ax, [2.2], [1.4]; text = ["Tilted"], rotation = 0.5, fontsize = 18)
    note = annotation!(ax, [3.3], [3.2]; text = ["Annotated"])
    nothing
end

# ╔═╡ a1410006-0001-4000-8000-000000000011
md"""
`@bind sel` stores the clicks, and `bind` names one field per plot: `sel.labels` for the three point labels, `sel.tilted` for the tilted one, and `sel.note` for the annotation.
"""

# ╔═╡ a1410006-0001-4000-8000-000000000003
@bind sel masque(fig; bind = (labels = labels, tilted = tilted, note = note))

# ╔═╡ a1410006-0001-4000-8000-000000000012
md"""
This cell responds to the click, and names each label that is selected.
"""

# ╔═╡ a1410006-0001-4000-8000-000000000004
begin
    picked = filter(!isnothing, [sel.labels, sel.tilted, sel.note])
    isempty(picked) ? "click a label" : join([l.text for l in picked], ", ") * " selected"
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1410006-0001-4000-8000-000000000001
# ╟─a1410006-0001-4000-8000-000000000009
# ╟─a1410006-0001-4000-8000-000000000010
# ╠═a1410006-0001-4000-8000-000000000002
# ╟─a1410006-0001-4000-8000-000000000011
# ╠═a1410006-0001-4000-8000-000000000003
# ╟─a1410006-0001-4000-8000-000000000012
# ╠═a1410006-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
