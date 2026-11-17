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


# ╔═╡ b10f0016-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f0016-0001-4000-8000-000000000002
begin
    doses = [0, 5, 10, 20, 40]
    mean_response = [2.1, 3.4, 4.6, 6.2, 6.9]
    sem = [0.3, 0.4, 0.5, 0.4, 0.6]

    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; xlabel = "Dose (mg)", ylabel = "Response")
    eb = errorbars!(ax, doses, mean_response, sem; whiskerwidth = 10, linewidth = 2)
    scatter!(ax, doses, mean_response; color = :black, markersize = 8)
    nothing
end

# ╔═╡ b10f0016-0001-4000-8000-000000000003
@bind pick masque(fig; bind = eb)

# ╔═╡ b10f0016-0001-4000-8000-000000000004
pick

# ╔═╡ b10f0016-0001-4000-8000-000000000005
masque(fig, interactables(eb; payloads = [(dose = d, mean = m, sem = s) for (d, m, s) in zip(doses, mean_response, sem)], tooltip = masque"<b>$(dose) mg</b><br>$(mean) ± $(sem)"))

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f0016-0001-4000-8000-000000000001
# ╠═b10f0016-0001-4000-8000-000000000002
# ╠═b10f0016-0001-4000-8000-000000000003
# ╠═b10f0016-0001-4000-8000-000000000004
# ╠═b10f0016-0001-4000-8000-000000000005
# ╟─00000000-0000-0000-0000-000000000001
