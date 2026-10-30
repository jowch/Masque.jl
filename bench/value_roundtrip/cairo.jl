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


# ╔═╡ a4790000-0000-0000-0000-000000000001
begin
    import Pkg
    dev = get(ENV, "MASQUE_DEV_ENV", "")
    isempty(dev) && error("set MASQUE_DEV_ENV to the env `scripts/cloud-warm.sh julia` builds")
    Pkg.activate(dev)
    using Masque, CairoMakie
    import JSON3
end

# ╔═╡ a4790000-0000-0000-0000-000000000002
include(joinpath(@__DIR__, "figures.jl"))

# ╔═╡ a4790000-0000-0000-0000-000000000003
@bind vc masque(plain(); backend = :cairo)

# ╔═╡ a4790000-0000-0000-0000-000000000004
stamp("out_c", vc)

# ╔═╡ a4790000-0000-0000-0000-000000000005
@bind vs HTML("<input type=range id=ctl min=0 max=1000 value=0>")

# ╔═╡ a4790000-0000-0000-0000-000000000006
stamp("out_s", vs)

# ╔═╡ a4790000-0000-0000-0000-000000000007
@bind vc2 masque(plain(); backend = :cairo)

# ╔═╡ a4790000-0000-0000-0000-000000000008
heavy_c = masque(plain(repr(vc2)); backend = :cairo)

# ╔═╡ a4790000-0000-0000-0000-000000000009
(heavy_c; stamp("out_c2", vc2))

# ╔═╡ a4790000-0000-0000-0000-000000000020
HTML("<pre id=\"coords\">" * JSON3.write(rt_coords(masque(plain(); backend = :cairo))) * "</pre>")

# ╔═╡ Cell order:
# ╠═a4790000-0000-0000-0000-000000000001
# ╠═a4790000-0000-0000-0000-000000000002
# ╠═a4790000-0000-0000-0000-000000000003
# ╠═a4790000-0000-0000-0000-000000000004
# ╠═a4790000-0000-0000-0000-000000000005
# ╠═a4790000-0000-0000-0000-000000000006
# ╠═a4790000-0000-0000-0000-000000000007
# ╠═a4790000-0000-0000-0000-000000000008
# ╠═a4790000-0000-0000-0000-000000000009
# ╠═a4790000-0000-0000-0000-000000000020
