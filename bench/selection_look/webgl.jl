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

# ╔═╡ b5000000-0000-0000-0000-000000000001
begin
    import Pkg
    Pkg.activate(ENV["MASQUE_DEV_ENV"])
    using Masque, WGLMakie
    import JSON3
end

# ╔═╡ b5000000-0000-0000-0000-000000000002
include(joinpath(@__DIR__, "figures.jl"))

# ╔═╡ b5000000-0000-0000-0000-000000000003
begin
    D = look_cells()
    W_brush = look_brush(D)
    W_legend = look_legend(D)
    W_big = look_big()
    nothing
end

# ╔═╡ b5000000-0000-0000-0000-000000000004
@bind v_brush W_brush

# ╔═╡ b5000000-0000-0000-0000-000000000005
@bind v_legend W_legend

# ╔═╡ b5000000-0000-0000-0000-000000000006
@bind v_big W_big

# ╔═╡ b5000000-0000-0000-0000-000000000007
HTML("<pre id=\"coords\">" * JSON3.write(look_coords(W_brush, W_legend, W_big)) * "</pre>")

# ╔═╡ Cell order:
# ╠═b5000000-0000-0000-0000-000000000001
# ╠═b5000000-0000-0000-0000-000000000002
# ╠═b5000000-0000-0000-0000-000000000003
# ╠═b5000000-0000-0000-0000-000000000004
# ╠═b5000000-0000-0000-0000-000000000005
# ╠═b5000000-0000-0000-0000-000000000006
# ╠═b5000000-0000-0000-0000-000000000007
