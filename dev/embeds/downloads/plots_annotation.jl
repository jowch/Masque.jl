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


# ╔═╡ b10f0014-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ b10f0014-0001-4000-8000-000000000002
begin
    year = 2000:2020
    visitors = [
        3.1, 3.3, 3.2, 3.6, 3.9, 4.4, 4.1, 4.8, 5.2, 4.0, 4.6,
        5.0, 5.5, 5.9, 6.3, 6.1, 6.8, 7.2, 7.5, 7.9, 3.4,
    ]

    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; xlabel = "Year", ylabel = "Visitors (million)")
    lines!(ax, year, visitors; color = :gray40)
    a = annotation!(
        ax, [-70, -90], [70, -10], [2009, 2020], [4.0, 3.4];
        text = ["Recession", "Pandemic"],
    )
    nothing
end

# ╔═╡ b10f0014-0001-4000-8000-000000000003
@bind pick masque(fig; bind = a)

# ╔═╡ b10f0014-0001-4000-8000-000000000004
pick

# ╔═╡ b10f0014-0001-4000-8000-000000000005
masque(
    fig,
    interactables(
        a;
        payloads = [
            (note = "Visitors fell 23%",),
            (note = "Visitors fell 57%",),
        ],
        tooltip = masque"<b>$(text)</b><br>$(note)",
    ),
)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f0014-0001-4000-8000-000000000001
# ╠═b10f0014-0001-4000-8000-000000000002
# ╠═b10f0014-0001-4000-8000-000000000003
# ╠═b10f0014-0001-4000-8000-000000000004
# ╠═b10f0014-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
