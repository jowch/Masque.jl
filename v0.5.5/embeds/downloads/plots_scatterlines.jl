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


# ╔═╡ b10f000e-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f000e-0001-4000-8000-000000000002
begin
    month = 1:8
    visitors = [120, 135, 160, 158, 190, 240, 260, 230]

    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; xlabel = "Month", ylabel = "Visitors", xticks = 1:8)
    sl = scatterlines!(ax, month, visitors)
    nothing
end

# ╔═╡ b10f000e-0001-4000-8000-000000000003
@bind sel masque(fig)

# ╔═╡ b10f000e-0001-4000-8000-000000000004
sel

# ╔═╡ b10f000e-0001-4000-8000-000000000005
events = [
    (month = m, event = e) for (m, e) in zip(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
            ["none", "none", "Fair", "none", "none", "Festival", "Festival", "none"],
        )
]

# ╔═╡ b10f000e-0001-4000-8000-000000000006
masque(fig, interactables(sl; payloads = (points = events,)))

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f000e-0001-4000-8000-000000000001
# ╠═b10f000e-0001-4000-8000-000000000002
# ╠═b10f000e-0001-4000-8000-000000000003
# ╠═b10f000e-0001-4000-8000-000000000004
# ╠═b10f000e-0001-4000-8000-000000000005
# ╠═b10f000e-0001-4000-8000-000000000006
# ╟─00000000-0000-0000-0000-000000000001
