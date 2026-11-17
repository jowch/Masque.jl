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


# ╔═╡ b10f001f-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f001f-0001-4000-8000-000000000002
begin
    rng = Xoshiro(21)
    x = randn(rng, 40)
    y = randn(rng, 40)
    z = 0.6 .* x .+ 0.3 .* y .+ 0.4 .* randn(rng, 40)

    fig = Figure(size = (520, 380))
    ax = Axis3(fig[1, 1]; xlabel = "Dose", ylabel = "Age", zlabel = "Response")
    sc = scatter!(ax, x, y, z; markersize = 10)
    nothing
end

# ╔═╡ b10f001f-0001-4000-8000-000000000003
@bind pick masque(fig; bind = sc)

# ╔═╡ b10f001f-0001-4000-8000-000000000004
pick

# ╔═╡ b10f001f-0001-4000-8000-000000000005
masque(fig, interactables(sc; payloads = [(patient = "P$(i)",) for i in 1:40], tooltip = masque"<b>$(patient)</b><br>response $(z:.2f)"))

# ╔═╡ b10f001f-0001-4000-8000-000000000006
begin
    t = range(0, 4pi; length = 120)
    fig2 = Figure(size = (520, 380))
    ax2 = Axis3(fig2[1, 1])
    lines!(ax2, cos.(t), sin.(t), t ./ 4pi; linewidth = 2)
    meshscatter!(ax2, cos.(t[1:20:end]), sin.(t[1:20:end]), t[1:20:end] ./ 4pi; markersize = 0.06, color = :orange)
    masque(fig2)
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f001f-0001-4000-8000-000000000001
# ╠═b10f001f-0001-4000-8000-000000000002
# ╠═b10f001f-0001-4000-8000-000000000003
# ╠═b10f001f-0001-4000-8000-000000000004
# ╠═b10f001f-0001-4000-8000-000000000005
# ╠═b10f001f-0001-4000-8000-000000000006
# ╟─00000000-0000-0000-0000-000000000001
