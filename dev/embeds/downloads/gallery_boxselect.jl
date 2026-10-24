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


# ╔═╡ a1410007-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ a1410007-0001-4000-8000-000000000009
md"""
Drag the box, and the last cell counts the points inside it by group.
"""

# ╔═╡ a1410007-0001-4000-8000-000000000010
md"""
Plot the points with each point's group in its payload, and add a box that selects them.
"""

# ╔═╡ a1410007-0001-4000-8000-000000000002
begin
    npts = 12
    xs = [2 + 6 * (i / npts) + 0.6 * sin(i) for i in 1:npts]
    ys = [3 + 3 * cos(i / 2) + 0.5 * (i % 3) for i in 1:npts]
    grp = [iseven(i) ? "A" : "B" for i in 1:npts]
    fig = Figure(size = (560, 380))
    ax = Axis(fig[1, 1]; title = "drag the box")
    s = scatter!(ax, xs, ys; color = map(g -> g == "A" ? :steelblue : :darkorange, grp), markersize = 14)
    pts = interactables(
        s;
        id = :pts,
        payloads = [(; group = grp[i], x = xs[i], y = ys[i]) for i in eachindex(xs)],
    )
    roi = ROIInteractable(ax; bounds = (3.0, 6.0, 1.5, 5.5), selects = :pts)
    nothing
end

# ╔═╡ a1410007-0001-4000-8000-000000000011
md"""
`bind = s` makes `picks` the scatter's value, which the box fills, and `@bind picks` stores the points inside the box when you release it.
"""

# ╔═╡ a1410007-0001-4000-8000-000000000003
@bind picks masque(fig, pts, roi; bind = s)

# ╔═╡ a1410007-0001-4000-8000-000000000012
md"""
This cell responds when you release the box.
"""

# ╔═╡ a1410007-0001-4000-8000-000000000004
if isempty(picks)
    "Adjust the box to select points."
else
    n = length(picks)
    na = count(e -> e.group == "A", picks)
    mx = round(sum(xs[picks]) / n; digits = 2)
    my = round(sum(ys[picks]) / n; digits = 2)
    "$(n) points: group A $(na), group B $(n - na); mean ($(mx), $(my))"
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1410007-0001-4000-8000-000000000001
# ╟─a1410007-0001-4000-8000-000000000009
# ╟─a1410007-0001-4000-8000-000000000010
# ╠═a1410007-0001-4000-8000-000000000002
# ╟─a1410007-0001-4000-8000-000000000011
# ╠═a1410007-0001-4000-8000-000000000003
# ╟─a1410007-0001-4000-8000-000000000012
# ╠═a1410007-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
