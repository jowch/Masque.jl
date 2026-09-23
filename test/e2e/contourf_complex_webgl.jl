### A Pluto.jl notebook ###
# v0.20.28

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

# ╔═╡ e5000000-0000-0000-0000-000000000001
begin
    import Pkg
    dev = get(ENV, "MASQUE_DEV_ENV", "")
    if !isempty(dev)
        Pkg.activate(dev)
    else
        Pkg.activate(; temp = true)
        Pkg.develop(path = joinpath(@__DIR__, "..", ".."))
        Pkg.add(["WGLMakie", "JSON3"])
        Pkg.instantiate()
    end
    using Masque
    using WGLMakie
    import JSON3
end

# ╔═╡ e5000000-0000-0000-0000-000000000002
md"""
# Contourf holes, busier fields — `:webgl`

Several holes in one band, an island inside a hole, and a dented ring.
Agents drive this with `test/e2e/contourf_complex.mjs`.
"""

# ╔═╡ e5000000-0000-0000-0000-000000000003
include(joinpath(@__DIR__, "contourf_complex_figures.jl"))

# ╔═╡ e5000000-0000-0000-0000-000000000004
begin
    complex = build_contourf_complex()
    nothing
end

# ╔═╡ e5000000-0000-0000-0000-000000000010
@bind ev_pedestal complex.pedestal

# ╔═╡ e5000000-0000-0000-0000-000000000011
HTML(
    "<span id=\"out_pedestal\">PEDESTAL=$(repr(ev_pedestal))</span>" *
        "<span id=\"coords_pedestal\" style=\"display:none\">$(JSON3.write(complex.pedestal.manifest["layers"]))</span>",
)

# ╔═╡ e5000000-0000-0000-0000-000000000012
@bind ev_bump complex.bump

# ╔═╡ e5000000-0000-0000-0000-000000000013
HTML(
    "<span id=\"out_bump\">BUMP=$(repr(ev_bump))</span>" *
        "<span id=\"coords_bump\" style=\"display:none\">$(JSON3.write(complex.bump.manifest["layers"]))</span>",
)

# ╔═╡ e5000000-0000-0000-0000-000000000014
@bind ev_dented complex.dented

# ╔═╡ e5000000-0000-0000-0000-000000000015
HTML(
    "<span id=\"out_dented\">DENTED=$(repr(ev_dented))</span>" *
        "<span id=\"coords_dented\" style=\"display:none\">$(JSON3.write(complex.dented.manifest["layers"]))</span>" *
        "<span id=\"complex_backend\">webgl</span>",
)

# ╔═╡ Cell order:
# ╠═e5000000-0000-0000-0000-000000000001
# ╠═e5000000-0000-0000-0000-000000000002
# ╠═e5000000-0000-0000-0000-000000000003
# ╠═e5000000-0000-0000-0000-000000000004
# ╠═e5000000-0000-0000-0000-000000000010
# ╠═e5000000-0000-0000-0000-000000000011
# ╠═e5000000-0000-0000-0000-000000000012
# ╠═e5000000-0000-0000-0000-000000000013
# ╠═e5000000-0000-0000-0000-000000000014
# ╠═e5000000-0000-0000-0000-000000000015
