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

# ╔═╡ c1d50019-0001-4000-8000-000000000001
begin
    import Pkg
    dev = get(ENV, "MASQUE_DEV_ENV", "")
    if !isempty(dev)
        Pkg.activate(dev)
    else
        Pkg.activate(; temp = true)
        Pkg.add(["CairoMakie", "JSON3"])
        Pkg.develop(path = joinpath(@__DIR__, "..", "..", ".."))
        Pkg.instantiate()
    end
    using Masque
    using CairoMakie
    import JSON3
end

# ╔═╡ c1d50019-0001-4000-8000-000000000002
begin
    z = [Float64(i + 3j) for i in 1:4, j in 1:3]
    fig = Figure(size = (560, 280))
    ax = Axis(fig[1, 1])
    hm = heatmap!(ax, 1:4, 1:3, z)
    cb = Colorbar(fig[1, 2], hm)
    cbint = ColorbarInteractable(cb; id = :colorbar)
    wid = masque(fig, cbint; bind = cbint)
end;

# ╔═╡ c1d50019-0001-4000-8000-000000000003
@bind level wid

# ╔═╡ c1d50019-0001-4000-8000-000000000004
Base.Text(isnothing(level) ? "click the colorbar" : "value = $(round(level.value; digits = 2))")

# ╔═╡ c1d50019-0001-4000-8000-000000000005
HTML(
    "<span id=\"clip_manifest\" style=\"display:none\">" *
        JSON3.write((; width = wid.manifest["width"], height = wid.manifest["height"], layers = [l for l in wid.manifest["layers"] if string(l["id"]) in ("colorbar",)], transforms = wid.manifest["transforms"])) *
        "</span>"
)

# ╔═╡ Cell order:
# ╠═c1d50019-0001-4000-8000-000000000001
# ╠═c1d50019-0001-4000-8000-000000000002
# ╠═c1d50019-0001-4000-8000-000000000003
# ╠═c1d50019-0001-4000-8000-000000000004
# ╠═c1d50019-0001-4000-8000-000000000005
