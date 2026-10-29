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


# ╔═╡ a1410008-0001-4000-8000-000000000001
using Masque, CairoMakie, Statistics

# ╔═╡ a1410008-0001-4000-8000-000000000009
md"""
Drag the box over the image, and the last cell reports the median color inside it.
"""

# ╔═╡ a1410008-0001-4000-8000-000000000010
md"""
Plot the image, and add a box that selects cells of the pixel grid.
"""

# ╔═╡ a1410008-0001-4000-8000-000000000002
begin
    nx, ny = 8, 6
    clamp01(v) = clamp(v, 0.0, 1.0)
    R = clamp01.([0.5 + 0.45 * sin(i / 1.4) * cos(j / 1.2) for i in 1:nx, j in 1:ny])
    G = clamp01.([0.5 + 0.4 * cos(i / 1.7) for i in 1:nx, j in 1:ny])
    B = clamp01.([0.5 + 0.45 * (j / ny) for i in 1:nx, j in 1:ny])
    rgb = RGBf.(R, G, B)
    fig = Figure(size = (560, 400))
    ax = Axis(fig[1, 1]; title = "drag the box to select a region")
    img = image!(ax, 0 .. nx, 0 .. ny, rgb)
    box = ROIInteractable(ax; bounds = (2.0, 5.0, 1.0, 4.0), selects = img)
    nothing
end

# ╔═╡ a1410008-0001-4000-8000-000000000011
md"""
`@bind region` stores the pixel ranges inside the box when you release it, and `bind = img` makes `region` the value of the image the box selects from.
"""

# ╔═╡ a1410008-0001-4000-8000-000000000003
@bind region masque(fig, box; bind = img)

# ╔═╡ a1410008-0001-4000-8000-000000000012
md"""
This cell responds when you release the box.
"""

# ╔═╡ a1410008-0001-4000-8000-000000000004
if isempty(R[region])
    "Drag the box over the image."
else
    q(A) = round(median(A[region]); digits = 3)
    "$(length(R[region])) pixels: median R $(q(R)), G $(q(G)), B $(q(B))"
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1410008-0001-4000-8000-000000000001
# ╟─a1410008-0001-4000-8000-000000000009
# ╟─a1410008-0001-4000-8000-000000000010
# ╠═a1410008-0001-4000-8000-000000000002
# ╟─a1410008-0001-4000-8000-000000000011
# ╠═a1410008-0001-4000-8000-000000000003
# ╟─a1410008-0001-4000-8000-000000000012
# ╠═a1410008-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
