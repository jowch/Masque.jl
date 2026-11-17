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


# ╔═╡ b10f001a-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f001a-0001-4000-8000-000000000002
begin
    xs = repeat(1:6; inner = 4)
    ys = repeat(1:4; outer = 6)
    amp = 0.2 .+ 0.1 .* ys
    u = amp .* cos.(0.5 .* xs .+ 0.3 .* ys)
    v = amp .* sin.(0.5 .* xs .+ 0.3 .* ys)

    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; xlabel = "x (km)", ylabel = "y (km)")
    ar = arrows2d!(ax, xs, ys, u, v)
    nothing
end

# ╔═╡ b10f001a-0001-4000-8000-000000000003
@bind pick masque(fig; bind = ar)

# ╔═╡ b10f001a-0001-4000-8000-000000000004
pick

# ╔═╡ b10f001a-0001-4000-8000-000000000005
masque(fig, interactables(ar; payloads = [(speed = round(hypot(a, b) * 20; digits = 1),) for (a, b) in zip(u, v)], tooltip = masque"<b>$(speed) m/s</b><br>at $(x), $(y) km"))

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f001a-0001-4000-8000-000000000001
# ╠═b10f001a-0001-4000-8000-000000000002
# ╠═b10f001a-0001-4000-8000-000000000003
# ╠═b10f001a-0001-4000-8000-000000000004
# ╠═b10f001a-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
