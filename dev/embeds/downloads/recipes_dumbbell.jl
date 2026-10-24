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

# ╔═╡ c5d1e7a0-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ c5d1e7a0-0001-4000-8000-000000000009
md"""
Hover over a row to see its values, then click it. The last cell shows how much the row changed.
"""

# ╔═╡ c5d1e7a0-0001-4000-8000-000000000010
md"""
The recipe draws each row as a bar from `before` to `after`, with a dot at each end.
"""

# ╔═╡ c5d1e7a0-0001-4000-8000-000000000002
begin
    @recipe Dumbbell (before, after) begin
        color = :gray70
        linewidth = 6
        beforecolor = :steelblue
        aftercolor = :firebrick
        markersize = 14
    end

    function Makie.plot!(p::Dumbbell)
        map!(p.attributes, [:before, :after], [:bars, :starts, :ends]) do before, after
            starts = [Point2f(x, k) for (k, x) in enumerate(before)]
            ends = [Point2f(x, k) for (k, x) in enumerate(after)]
            bars = [q for k in eachindex(starts) for q in (starts[k], ends[k])]
            return (bars, starts, ends)
        end
        linesegments!(p, p.bars; color = p.color, linewidth = p.linewidth)
        scatter!(p, p.starts; color = p.beforecolor, markersize = p.markersize)
        scatter!(p, p.ends; color = p.aftercolor, markersize = p.markersize)
        return p
    end
end

# ╔═╡ c5d1e7a0-0001-4000-8000-000000000011
md"""
This method makes each row one mark. It passes the recipe's bars, `p.plots[1]`, so a row responds along its whole drawn width, and gives each row a payload with its values.
"""

# ╔═╡ c5d1e7a0-0001-4000-8000-000000000003
function Masque.interactables(ax, p::Dumbbell; payloads = nothing, kwargs...)
    before, after = p.before[], p.after[]
    rows = [
        (; row = k, before = before[k], after = after[k], change = after[k] - before[k])
            for k in eachindex(before)
    ]
    bars = p.plots[1]
    return interactables(ax, bars; payloads = something(payloads, rows), kwargs...)
end

# ╔═╡ c5d1e7a0-0001-4000-8000-000000000004
begin
    fig = Figure(size = (560, 300))
    ax = Axis(fig[1, 1]; xlabel = "score", yticks = (1:3, ["north", "east", "south"]))
    d = dumbbell!(ax, [3.0, 5.5, 2.0], [4.5, 4.0, 6.0])
    nothing
end

# ╔═╡ c5d1e7a0-0001-4000-8000-000000000012
md"""
`masque(fig)` uses the method for the `dumbbell!` plot, `bind = d` makes `pick` the clicked row itself, and `@bind pick` saves a click in `pick`.
"""

# ╔═╡ c5d1e7a0-0001-4000-8000-000000000005
@bind pick masque(fig; bind = d)

# ╔═╡ c5d1e7a0-0001-4000-8000-000000000013
md"""
`pick` starts as `nothing`. After a click, `pick.change` is the clicked row's change.
"""

# ╔═╡ c5d1e7a0-0001-4000-8000-000000000006
if isnothing(pick)
    "click a row"
else
    "row $(pick.row) changed by $(pick.change)"
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═c5d1e7a0-0001-4000-8000-000000000001
# ╟─c5d1e7a0-0001-4000-8000-000000000009
# ╟─c5d1e7a0-0001-4000-8000-000000000010
# ╠═c5d1e7a0-0001-4000-8000-000000000002
# ╟─c5d1e7a0-0001-4000-8000-000000000011
# ╠═c5d1e7a0-0001-4000-8000-000000000003
# ╠═c5d1e7a0-0001-4000-8000-000000000004
# ╟─c5d1e7a0-0001-4000-8000-000000000012
# ╠═c5d1e7a0-0001-4000-8000-000000000005
# ╟─c5d1e7a0-0001-4000-8000-000000000013
# ╠═c5d1e7a0-0001-4000-8000-000000000006
# ╟─00000000-0000-0000-0000-000000000001
