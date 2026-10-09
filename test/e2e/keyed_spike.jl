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

# ╔═╡ d1000000-0000-0000-0000-000000000001
begin
    import Pkg
    Pkg.activate(ENV["MASQUE_DEV_ENV"])
    using Masque, CairoMakie, WGLMakie
    import JSON3
    backend = Symbol(get(ENV, "MASQUE_SPIKE_BACKEND", "cairo"))
end

# ╔═╡ d1000000-0000-0000-0000-000000000002
# Spike (composite bond): one widget, two controls and a clickable layer, `keyed = true`.
w = let
    fig = Figure(; size = (500, 400))
    ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
    pts = [(2.0, 2.0), (3.0, 4.0), (4.5, 3.0), (8.0, 8.0)]
    scatter!(ax, first.(pts), last.(pts); markersize = 14)
    scatter!(ax, [8.5], [1.5]; markersize = 18, color = :orange)
    masque(
        fig,
        PointInteractable(ax, pts; id = :pts, payloads = ["a", "b", "c", "d"]),
        PointInteractable(ax, [(8.5, 1.5)]; id = :dots),
        ThresholdInteractable(ax; value = 6.0, id = :cutoff),
        ROIInteractable(ax; bounds = (1.0, 5.0, 1.0, 5.0), selects = :pts, id = :box);
        auto = false, keyed = true, backend,
    )
end;

# ╔═╡ d1000000-0000-0000-0000-000000000003
@bind sel w

# ╔═╡ d1000000-0000-0000-0000-000000000004
HTML(
    "<span id=\"out_keyed\">KEYED=$(repr(sel))</span>" *
        "<span id=\"manifest_keyed\" style=\"display:none\">$(JSON3.write(w.manifest))</span>" *
        "<span id=\"backend_keyed\">$(backend)</span>",
)

# ╔═╡ Cell order:
# ╠═d1000000-0000-0000-0000-000000000001
# ╠═d1000000-0000-0000-0000-000000000002
# ╠═d1000000-0000-0000-0000-000000000003
# ╠═d1000000-0000-0000-0000-000000000004
