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

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000001
using Masque, CairoMakie, Markdown

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000009
md"""
Drag the box over some stations, and the last cell lists the ones inside.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000002
begin
    samples = [
        (name = "North-1", x = 1.5, y = 8.0, group = "North"),
        (name = "North-2", x = 2.5, y = 7.2, group = "North"),
        (name = "North-3", x = 2.0, y = 9.0, group = "North"),
        (name = "Mid-1", x = 5.0, y = 5.0, group = "Mid"),
        (name = "Mid-2", x = 5.8, y = 4.2, group = "Mid"),
        (name = "Mid-3", x = 4.5, y = 5.8, group = "Mid"),
        (name = "South-1", x = 8.0, y = 1.5, group = "South"),
        (name = "South-2", x = 8.8, y = 2.4, group = "South"),
        (name = "South-3", x = 7.2, y = 2.0, group = "South"),
        (name = "East", x = 9.0, y = 6.5, group = "East"),
    ]
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y", limits = (0.5, 10.0, 0.5, 10.0))
    xs = [1.5, 2.5, 2.0, 5.0, 5.8, 4.5, 8.0, 8.8, 7.2, 9.0]
    ys = [8.0, 7.2, 9.0, 5.0, 4.2, 5.8, 1.5, 2.4, 2.0, 6.5]
    north, mid, south, east = "#4363d8", "#f58231", "#3cb44b", "#911eb4"
    colors = [north, north, north, mid, mid, mid, south, south, south, east]
    s = scatter!(ax, xs, ys; color = colors, markersize = 18)
    pts = interactables(s; payloads = samples)
    roi = ROIInteractable(ax; bounds = (4.0, 6.5, 3.8, 6.5), selects = s)
    nothing
end

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000003
@bind picks masque(fig, pts, roi; bind = s)

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000004
if isempty(picks)
    md"*No stations in the box.*"
else
    rows = samples[picks]
    md_rows = ["| Station | x | y | Group |", "|---|---:|---:|---|"]
    for r in rows
        push!(md_rows, "| $(r.name) | $(r.x) | $(r.y) | $(r.group) |")
    end
    Markdown.parse("**$(length(rows)) stations**\n\n" * join(md_rows, "\n"))
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1b2c3d4-0001-4000-8000-000000000001
# ╟─a1b2c3d4-0001-4000-8000-000000000009
# ╠═a1b2c3d4-0001-4000-8000-000000000002
# ╠═a1b2c3d4-0001-4000-8000-000000000003
# ╠═a1b2c3d4-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
