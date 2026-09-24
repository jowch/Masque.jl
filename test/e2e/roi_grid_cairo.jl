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
# ROI over a grid — `:cairo` (agent live-verify)

Driven by `test/e2e/roi_grid_click.mjs`. Not a human Try Live notebook.
"""

# ╔═╡ e2000000-0000-0000-0000-000000000003
include(joinpath(@__DIR__, "roi_grid_figures.jl"))

# ╔═╡ e2000000-0000-0000-0000-000000000004
begin
    widget = build_roi_grid()
    nothing
end

# ╔═╡ e2000000-0000-0000-0000-000000000005
@bind region widget

# ╔═╡ e2000000-0000-0000-0000-000000000006
HTML(
    "<span id=\"out_region\">REGION=$(repr(region))</span>" *
        "<span id=\"roi_grid_meta\" style=\"display:none\">$(JSON3.write(roi_grid_meta(widget)))</span>" *
        "<span id=\"roi_grid_backend\">cairo</span>",
)

# ╔═╡ e2000000-0000-0000-0000-000000000007
HTML("<span id=\"readout_region\">READOUT=$(roi_grid_readout(region))</span>")

# ╔═╡ Cell order:
# ╠═e2000000-0000-0000-0000-000000000001
# ╟─e2000000-0000-0000-0000-000000000002
# ╠═e2000000-0000-0000-0000-000000000003
# ╠═e2000000-0000-0000-0000-000000000004
# ╠═e2000000-0000-0000-0000-000000000005
# ╠═e2000000-0000-0000-0000-000000000006
# ╠═e2000000-0000-0000-0000-000000000007
