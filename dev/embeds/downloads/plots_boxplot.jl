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


# ╔═╡ b10f0002-0001-4000-8000-000000000001
using Masque, CairoMakie, Random, Statistics

# ╔═╡ b10f0002-0001-4000-8000-000000000002
begin
    rng = Xoshiro(2)
    route = repeat([1, 2, 3]; inner = 60)
    minutes = [randn(rng, 60) .+ 10; randn(rng, 60) .* 2 .+ 12; randn(rng, 60) .+ 9]
    minutes[[5, 70, 94, 150]] = [15.0, 20.0, 19.5, 4.0]

    fig = Figure(size = (520, 320))
    ax = Axis(
        fig[1, 1];
        xticks = (1:3, ["Route A", "Route B", "Route C"]),
        ylabel = "Minutes",
    )
    b = boxplot!(ax, route, minutes; show_outliers = true)
    nothing
end

# ╔═╡ b10f0002-0001-4000-8000-000000000003
@bind pick masque(fig; bind = b)

# ╔═╡ b10f0002-0001-4000-8000-000000000004
pick

# ╔═╡ b10f0002-0001-4000-8000-000000000005
routes = [
    (route = "Route A", stops = 12),
    (route = "Route B", stops = 18),
    (route = "Route C", stops = 9),
]

# ╔═╡ b10f0002-0001-4000-8000-000000000006
masque(
    fig,
    interactables(
        b;
        payloads = routes,
        tooltip = masque"<b>$(route)</b><br>$(stops) stops, median $(median:.1f) min",
    ),
)

# ╔═╡ b10f0002-0001-4000-8000-000000000007
begin
    outliers = Point2f[]
    trips = []
    for r in 1:3
        rows = findall(route .== r)
        q1, q3 = quantile(minutes[rows], [0.25, 0.75])
        reach = 1.5 * (q3 - q1)
        for i in rows
            if minutes[i] < q1 - reach || minutes[i] > q3 + reach
                push!(outliers, Point2f(r, minutes[i]))
                push!(trips, (trip = i,))
            end
        end
    end
    masque(
        fig,
        PointInteractable(
            ax, outliers;
            radius = 6,
            payloads = trips,
            id = :outliers,
        ),
    )
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f0002-0001-4000-8000-000000000001
# ╠═b10f0002-0001-4000-8000-000000000002
# ╠═b10f0002-0001-4000-8000-000000000003
# ╠═b10f0002-0001-4000-8000-000000000004
# ╠═b10f0002-0001-4000-8000-000000000005
# ╠═b10f0002-0001-4000-8000-000000000006
# ╠═b10f0002-0001-4000-8000-000000000007
# ╟─00000000-0000-0000-0000-000000000001
