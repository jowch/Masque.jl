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

# ╔═╡ d4780000-0000-0000-0000-000000000001
begin
    import Pkg
    Pkg.activate(ENV["MASQUE_DEV_ENV"])
    using Masque, CairoMakie
    import JSON3
end

# ╔═╡ d4780000-0000-0000-0000-000000000002
include(joinpath(@__DIR__, "figures.jl"))

# ╔═╡ d4780000-0000-0000-0000-000000000003
begin
    D = look_cells()
    W = (seg_linked(D), seg_two(D), seg_one(D), look_linked(D))
    nothing
end

# ╔═╡ d4780000-0000-0000-0000-000000000004
@bind v1 W[1]

# ╔═╡ d4780000-0000-0000-0000-000000000005
@bind v2 W[2]

# ╔═╡ d4780000-0000-0000-0000-000000000006
@bind v3 W[3]

# ╔═╡ d4780000-0000-0000-0000-000000000007
@bind v4 W[4]

# ╔═╡ d4780000-0000-0000-0000-000000000008
HTML("<pre id=\"coords\">" * JSON3.write(seg_coords(W...)) * "</pre>")

# ╔═╡ Cell order:
# ╠═d4780000-0000-0000-0000-000000000001
# ╠═d4780000-0000-0000-0000-000000000002
# ╠═d4780000-0000-0000-0000-000000000003
# ╠═d4780000-0000-0000-0000-000000000004
# ╠═d4780000-0000-0000-0000-000000000005
# ╠═d4780000-0000-0000-0000-000000000006
# ╠═d4780000-0000-0000-0000-000000000007
# ╠═d4780000-0000-0000-0000-000000000008
