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

# ╔═╡ e2000000-0000-0000-0000-000000000001
begin
    import Pkg
    dev = get(ENV, "MASQUE_DEV_ENV", "")
    if !isempty(dev)
        Pkg.activate(dev)
    else
        Pkg.activate(; temp = true)
        Pkg.develop(path = joinpath(@__DIR__, "..", ".."))
        Pkg.add(["CairoMakie", "JSON3"])
        Pkg.instantiate()
    end
    using Masque
    using CairoMakie
    import JSON3
end

# ╔═╡ e2000000-0000-0000-0000-000000000002
md"""
# Contourf holes — `:cairo`

A pointer in a hole misses that polygon. Agents drive this with `test/e2e/contourf_holes.mjs`.
"""

# ╔═╡ e2000000-0000-0000-0000-000000000003
include(joinpath(@__DIR__, "contourf_holes_figures.jl"))

# ╔═╡ e2000000-0000-0000-0000-000000000004
begin
    holes = build_contourf_holes()
    nothing
end

# ╔═╡ e2000000-0000-0000-0000-000000000010
@bind ev_gauss holes.gaussian

# ╔═╡ e2000000-0000-0000-0000-000000000011
HTML(
    "<span id=\"out_gauss\">GAUSS=$(repr(ev_gauss))</span>" *
        "<span id=\"coords_gauss\" style=\"display:none\">$(JSON3.write(holes.gaussian.manifest["layers"]))</span>" *
        "<span id=\"axes_gauss\" style=\"display:none\">$(JSON3.write(holes.gaussian.manifest["transforms"]))</span>",
)

# ╔═╡ e2000000-0000-0000-0000-000000000012
@bind ev_peaks holes.peaks

# ╔═╡ e2000000-0000-0000-0000-000000000013
HTML(
    "<span id=\"out_peaks\">PEAKS=$(repr(ev_peaks))</span>" *
        "<span id=\"coords_peaks\" style=\"display:none\">$(JSON3.write(holes.peaks.manifest["layers"]))</span>" *
        "<span id=\"axes_peaks\" style=\"display:none\">$(JSON3.write(holes.peaks.manifest["transforms"]))</span>" *
        "<span id=\"holes_backend\">cairo</span>",
)

# ╔═╡ Cell order:
# ╠═e2000000-0000-0000-0000-000000000001
# ╠═e2000000-0000-0000-0000-000000000002
# ╠═e2000000-0000-0000-0000-000000000003
# ╠═e2000000-0000-0000-0000-000000000004
# ╠═e2000000-0000-0000-0000-000000000010
# ╠═e2000000-0000-0000-0000-000000000011
# ╠═e2000000-0000-0000-0000-000000000012
# ╠═e2000000-0000-0000-0000-000000000013
