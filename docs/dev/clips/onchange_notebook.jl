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

# ╔═╡ c1d50002-0001-4000-8000-000000000001
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

# ╔═╡ c1d50002-0001-4000-8000-000000000002
begin
    xs = Float64[1, 2, 3, 4, 5, 6, 7, 8]
    ys = Float64[1.2, 1.9, 3.2, 3.8, 5.1, 6.3, 6.8, 8.1]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y", title = "click points to fit the line through them")
    fitline = lines!(ax, [1.0, 8.0], [1.0, 8.0]; color = :crimson)
    sc = scatter!(ax, xs, ys; markersize = 14)
    wid = masque(
        fig, (pts = interactables(sc; select = :many),);
        onchange = state -> begin
            picked = [e.index for e in state.pts]
            if length(picked) >= 2
                x, y = xs[picked], ys[picked]
                mx, my = sum(x) / length(x), sum(y) / length(y)
                slope = sum((x .- mx) .* (y .- my)) / sum((x .- mx) .^ 2)
                update!(fitline, [1.0, 8.0], my .+ slope .* ([1.0, 8.0] .- mx))
            end
        end,
    )
end;

# ╔═╡ c1d50002-0001-4000-8000-000000000003
@bind w wid

# ╔═╡ c1d50002-0001-4000-8000-000000000004
Base.Text("picked: " * join([e.index for e in w.pts], ", "))

# ╔═╡ c1d50002-0001-4000-8000-000000000005
HTML(
    "<span id=\"clip_manifest\" style=\"display:none\">" *
        JSON3.write((; width = wid.manifest["width"], height = wid.manifest["height"], layers = wid.manifest["layers"], transforms = wid.manifest["transforms"])) *
        "</span>"
)

# ╔═╡ Cell order:
# ╠═c1d50002-0001-4000-8000-000000000001
# ╠═c1d50002-0001-4000-8000-000000000002
# ╠═c1d50002-0001-4000-8000-000000000003
# ╠═c1d50002-0001-4000-8000-000000000004
# ╠═c1d50002-0001-4000-8000-000000000005
