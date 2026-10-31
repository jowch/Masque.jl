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

# ╔═╡ e4780000-0000-0000-0000-000000000001
begin
    import Pkg
    Pkg.activate(ENV["MASQUE_DEV_ENV"])
    using Masque, WGLMakie
    import JSON3
end

# ╔═╡ e4780000-0000-0000-0000-000000000002
include(joinpath(@__DIR__, "figures.jl"))

# ╔═╡ e4780000-0000-0000-0000-000000000003
begin
    D = look_cells()
    W = (seg_linked(D), seg_two(D), seg_one(D), look_linked(D))
    nothing
end

# ╔═╡ e4780000-0000-0000-0000-000000000004
@bind v1 W[1]

# ╔═╡ e4780000-0000-0000-0000-000000000005
@bind v2 W[2]

# ╔═╡ e4780000-0000-0000-0000-000000000006
@bind v3 W[3]

# ╔═╡ e4780000-0000-0000-0000-000000000007
@bind v4 W[4]

# ╔═╡ e4780000-0000-0000-0000-000000000008
HTML("<pre id=\"coords\">" * JSON3.write(seg_coords(W...)) * "</pre>")

# ╔═╡ Cell order:
# ╠═e4780000-0000-0000-0000-000000000001
# ╠═e4780000-0000-0000-0000-000000000002
# ╠═e4780000-0000-0000-0000-000000000003
# ╠═e4780000-0000-0000-0000-000000000004
# ╠═e4780000-0000-0000-0000-000000000005
# ╠═e4780000-0000-0000-0000-000000000006
# ╠═e4780000-0000-0000-0000-000000000007
# ╠═e4780000-0000-0000-0000-000000000008
