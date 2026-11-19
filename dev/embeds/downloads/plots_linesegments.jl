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


# ╔═╡ b10f0015-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f0015-0001-4000-8000-000000000002
begin
    tasks = ["Design", "Build", "Test", "Docs", "Release"]
    start = [1, 4, 9, 10, 14]
    finish = [5, 11, 13, 14, 15]

    fig = Figure(size = (520, 320))
    ax = Axis(
        fig[1, 1];
        xlabel = "Day",
        yticks = (1:5, tasks),
        yreversed = true,
    )
    ls = linesegments!(
        ax,
        [Point2f(p) for i in 1:5 for p in ((start[i], i), (finish[i], i))];
        linewidth = 12,
    )
    nothing
end

# ╔═╡ b10f0015-0001-4000-8000-000000000003
@bind pick masque(fig; bind = ls)

# ╔═╡ b10f0015-0001-4000-8000-000000000004
pick

# ╔═╡ b10f0015-0001-4000-8000-000000000005
masque(
    fig,
    interactables(
        ls;
        payloads = [
            (task = tasks[i], from = start[i], to = finish[i]) for i in 1:5
        ],
        tooltip = masque"<b>$(task)</b><br>day $(from) to day $(to)",
    ),
)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f0015-0001-4000-8000-000000000001
# ╠═b10f0015-0001-4000-8000-000000000002
# ╠═b10f0015-0001-4000-8000-000000000003
# ╠═b10f0015-0001-4000-8000-000000000004
# ╠═b10f0015-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
