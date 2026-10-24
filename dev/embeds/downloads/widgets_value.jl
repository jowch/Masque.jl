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
# ╔═╡ b7d10001-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ b7d10001-0001-4000-8000-000000000100
md"""
Click a point, then a bar: each click fills its own field of `w`, and the other field keeps its pick.
"""

# ╔═╡ b7d10001-0001-4000-8000-000000000101
md"""
Create the figure with a scatter of samples and a bar for each batch.
"""

# ╔═╡ b7d10001-0001-4000-8000-000000000102
begin
    xs = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    ys = [2.1, 3.4, 2.8, 4.9, 4.2, 5.6]
    fig = Figure(size = (640, 300))
    ax1 = Axis(fig[1, 1]; title = "Samples")
    sc = scatter!(ax1, xs, ys; markersize = 16)
    ax2 = Axis(fig[1, 2]; title = "Batches", xticks = 1:3)
    bp = barplot!(ax2, [1, 2, 3], [12, 7, 9])
    nothing
end

# ╔═╡ b7d10001-0001-4000-8000-000000000103
md"""
Wrap each plot in `interactables` and name it in a named tuple, and the names become the fields of `w`.
"""

# ╔═╡ b7d10001-0001-4000-8000-000000000104
@bind w masque(fig, (sample = interactables(sc), batch = interactables(bp)))

# ╔═╡ b7d10001-0001-4000-8000-000000000105
md"""
A cell that uses `w` responds to every click, on either plot.
"""

# ╔═╡ b7d10001-0001-4000-8000-000000000106
begin
    sample = isnothing(w.sample) ? "nothing" : "point $(w.sample.index)"
    batch = isnothing(w.batch) ? "nothing" : "bar $(w.batch.index)"
    "w.sample is $sample, w.batch is $batch"
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b7d10001-0001-4000-8000-000000000001
# ╟─b7d10001-0001-4000-8000-000000000100
# ╟─b7d10001-0001-4000-8000-000000000101
# ╠═b7d10001-0001-4000-8000-000000000102
# ╟─b7d10001-0001-4000-8000-000000000103
# ╠═b7d10001-0001-4000-8000-000000000104
# ╟─b7d10001-0001-4000-8000-000000000105
# ╠═b7d10001-0001-4000-8000-000000000106
# ╟─00000000-0000-0000-0000-000000000001
