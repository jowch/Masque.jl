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

# ╔═╡ c0a10002-0001-4000-8000-000000000001
using CairoMakie, Masque

# ╔═╡ c0a10002-0001-4000-8000-000000000002
begin
    cities = [
        (id = "tok", name = "Tokyo", lon = 139.7, lat = 35.7),
        (id = "del", name = "Delhi", lon = 77.2, lat = 28.6),
        (id = "sha", name = "Shanghai", lon = 121.5, lat = 31.2),
    ]
    series = Dict(
        "tok" => [3.1, 3.4, 3.2, 3.6],
        "del" => [2.2, 2.5, 2.9, 3.0],
        "sha" => [2.0, 2.4, 2.3, 2.7],
    )
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "longitude", ylabel = "latitude")
    s = scatter!(ax, [139.7, 77.2, 121.5], [35.7, 28.6, 31.2]; markersize = 16)
    pts = interactables(s; payloads = cities)
    nothing
end

# ╔═╡ c0a10002-0001-4000-8000-000000000003
@bind pick masque(fig, pts; bind = s)

# ╔═╡ c0a10002-0001-4000-8000-000000000004
begin
    detail = Figure(size = (560, 240))
    dax = Axis(detail[1, 1]; title = isnothing(pick) ? "click a city" : pick.name)
    isnothing(pick) || lines!(dax, series[pick.id])
    detail
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═c0a10002-0001-4000-8000-000000000001
# ╠═c0a10002-0001-4000-8000-000000000002
# ╠═c0a10002-0001-4000-8000-000000000003
# ╠═c0a10002-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
