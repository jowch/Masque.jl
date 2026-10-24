### A Pluto.jl notebook ###
# v1.0.4

using Markdown
using InteractiveUtils

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

# ╔═╡ a5000000-0000-0000-0000-000000000001
begin
    import Pkg
    Pkg.activate(ENV["MASQUE_DEV_ENV"])
    using Masque, CairoMakie
    import JSON3
end

# ╔═╡ a5000000-0000-0000-0000-000000000002
include(joinpath(@__DIR__, "figures.jl"))

# ╔═╡ a5000000-0000-0000-0000-000000000003
begin
    D = look_cells()
    W_brush = look_brush(D)
    W_legend = look_legend(D)
    W_big = look_big()
    W_linked = look_linked(D)
    nothing
end

# ╔═╡ a5000000-0000-0000-0000-000000000004
@bind v_brush W_brush

# ╔═╡ a5000000-0000-0000-0000-000000000005
@bind v_legend W_legend

# ╔═╡ a5000000-0000-0000-0000-000000000006
@bind v_big W_big

# ╔═╡ a5000000-0000-0000-0000-000000000008
@bind v_linked W_linked

# ╔═╡ a5000000-0000-0000-0000-000000000007
HTML("<pre id=\"coords\">" * JSON3.write(look_coords(W_brush, W_legend, W_big, W_linked)) * "</pre>")

# ╔═╡ Cell order:
# ╠═a5000000-0000-0000-0000-000000000001
# ╠═a5000000-0000-0000-0000-000000000002
# ╠═a5000000-0000-0000-0000-000000000003
# ╠═a5000000-0000-0000-0000-000000000004
# ╠═a5000000-0000-0000-0000-000000000005
# ╠═a5000000-0000-0000-0000-000000000006
# ╠═a5000000-0000-0000-0000-000000000008
# ╠═a5000000-0000-0000-0000-000000000007
