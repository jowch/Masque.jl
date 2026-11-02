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
using Masque, CairoMakie

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000009
md"""
Click a legend entry, and the last cell names that series while its line stays highlighted. Click it again to clear it.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000002
begin
    xs = range(0, 2π; length = 80)
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
    lines!(ax, xs, sin.(xs); label = "a")
    lines!(ax, xs, cos.(xs); label = "b")
    axislegend(ax)
    nothing
end

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000003
@bind pick masque(fig; bind = :legend)

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000004
isnothing(pick) ? "click a legend entry" : "$(pick.label) selected"

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000005
begin
    focus = isnothing(pick) ? nothing : pick.label
    fig2 = Figure(size = (560, 360))
    ax2 = Axis(fig2[1, 1])
    for (label, f) in (("a", sin), ("b", cos))
        faded = !isnothing(focus) && label != focus
        lines!(ax2, xs, f.(xs); label, alpha = faded ? 0.2 : 1.0)
    end
    fig2
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
# ╠═a1b2c3d4-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
