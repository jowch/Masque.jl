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

# ╔═╡ c1d50009-0001-4000-8000-000000000001
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

# ╔═╡ c1d50009-0001-4000-8000-000000000002
begin
    xs = Float64[1.2, 1.6, 2.1, 1.4, 2.4, 1.9, 2.8, 5.1, 5.6, 6.2, 5.4, 6.0, 6.6, 5.8, 3.9, 4.3, 8.4, 0.6]
    ys = Float64[2.0, 2.9, 2.3, 3.4, 3.1, 1.6, 2.6, 6.1, 5.4, 6.4, 7.0, 7.4, 5.9, 6.6, 4.6, 1.2, 4.4, 7.5]
    fig = Figure(size = (560, 420))
    ax = Axis(fig[1, 1]; title = "pick a class, then click or box points")
    sc = scatter!(ax, xs, ys; color = fill(:gray70, length(xs)), markersize = 16)
    class = Menu(fig[2, 1]; options = ["good", "bad", "unsure"], width = 160, tellwidth = false)
    labels = Dict{Int, String}()
    colors = Dict("good" => :seagreen, "bad" => :crimson, "unsure" => :orange)
    wid = masque(
        fig, (class = class, pts = interactables(sc; select = :many));
        onchange = state -> begin
            picked = [e.index for e in state.pts]
            # A point that is no longer picked loses its label
            for i in collect(keys(labels))
                i in picked || delete!(labels, i)
            end
            # A newly picked point takes the class shown in the menu
            for i in picked
                get!(labels, i, state.class)
            end
            pointcolors = [haskey(labels, i) ? colors[labels[i]] : :gray70 for i in eachindex(xs)]
            update!(sc; color = pointcolors)
        end,
    )
end;

# ╔═╡ c1d50009-0001-4000-8000-000000000003
@bind w wid

# ╔═╡ c1d50009-0001-4000-8000-000000000004
begin
    w
    Base.Text(join(["$c: " * join(sort([i for (i, l) in labels if l == c]), ", ") for c in ("good", "bad", "unsure")], "\n"))
end

# ╔═╡ c1d50009-0001-4000-8000-000000000005
HTML(
    "<span id=\"clip_manifest\" style=\"display:none\">" *
        JSON3.write((; width = wid.manifest["width"], height = wid.manifest["height"], layers = wid.manifest["layers"], transforms = wid.manifest["transforms"])) *
        "</span>"
)

# ╔═╡ Cell order:
# ╠═c1d50009-0001-4000-8000-000000000001
# ╠═c1d50009-0001-4000-8000-000000000002
# ╠═c1d50009-0001-4000-8000-000000000003
# ╠═c1d50009-0001-4000-8000-000000000004
# ╠═c1d50009-0001-4000-8000-000000000005
