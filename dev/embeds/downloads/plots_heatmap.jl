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


# ╔═╡ b10f001b-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f001b-0001-4000-8000-000000000002
begin
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    hours = 8:20
    visits = [round(Int, 40 + 30 * sin((h - 8) / 4) + (d >= 6 ? 25 : 0) + 8 * sin(3d + h)) for d in 1:7, h in hours]

    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; xticks = (1:7, days), ylabel = "Hour")
    hm = heatmap!(ax, 1:7, hours, visits; colormap = :viridis)
    Colorbar(fig[1, 2], hm; label = "Visits")
    nothing
end

# ╔═╡ b10f001b-0001-4000-8000-000000000003
@bind pick masque(fig; bind = hm)

# ╔═╡ b10f001b-0001-4000-8000-000000000004
pick

# ╔═╡ b10f001b-0001-4000-8000-000000000005
masque(fig, interactables(hm; payloads = (i, j) -> (day = days[i], hour = hours[j]), tooltip = masque"<b>$(day), $(hour):00</b><br>$(value) visits"))

# ╔═╡ b10f001b-0001-4000-8000-000000000006
masque(fig, interactables(hm; select = :many))

# ╔═╡ b10f001b-0001-4000-8000-000000000007
begin
    rng = Xoshiro(3)
    scan = [exp(-((x - 20)^2 + (y - 14)^2) / 60) + 0.6 * exp(-((x - 8)^2 + (y - 22)^2) / 20) + 0.05 * rand(rng) for x in 1:32, y in 1:32]
    fig2 = Figure(size = (520, 320))
    ax2 = Axis(fig2[1, 1]; aspect = DataAspect(), yreversed = true, title = "Scan")
    img = image!(ax2, scan; colormap = :grays, interpolate = false)
    masque(fig2, interactables(img; tooltip = masque"pixel $(i), $(j)<br>intensity $(value:.2f)"))
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f001b-0001-4000-8000-000000000001
# ╠═b10f001b-0001-4000-8000-000000000002
# ╠═b10f001b-0001-4000-8000-000000000003
# ╠═b10f001b-0001-4000-8000-000000000004
# ╠═b10f001b-0001-4000-8000-000000000005
# ╠═b10f001b-0001-4000-8000-000000000006
# ╠═b10f001b-0001-4000-8000-000000000007
# ╟─00000000-0000-0000-0000-000000000001
