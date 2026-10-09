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

# ╔═╡ e1000000-0000-0000-0000-000000000001
begin
    import Pkg
    Pkg.activate(ENV["MASQUE_DEV_ENV"])
    using Masque, CairoMakie, WGLMakie
    import JSON3
    backend = Symbol(get(ENV, "MASQUE_SPIKE_BACKEND", "cairo"))
end

# ╔═╡ e1000000-0000-0000-0000-000000000002
# Spike (live redraw): drag the threshold on the histogram; the mask on the image follows.
img = [
    exp(-((x - 30)^2 + (y - 40)^2) / 200) + 0.8 * exp(-((x - 70)^2 + (y - 55)^2) / 120) +
        0.6 * exp(-((x - 55)^2 + (y - 18)^2) / 80) for x in 1:100, y in 1:80
];

# ╔═╡ e1000000-0000-0000-0000-000000000003
w = let
    fig = Figure(; size = (760, 340))
    ax1 = Axis(fig[1, 1]; aspect = DataAspect(), title = "image")
    heatmap!(ax1, img; colormap = :grays)
    masked(v) = map(p -> p > v ? 1.0 : 0.0, img)
    mask = Observable(masked(0.5))
    heatmap!(ax1, mask; colormap = [RGBAf(1, 0, 0, 0), RGBAf(1, 0, 0, 0.55)], colorrange = (0, 1))
    ax2 = Axis(fig[1, 2]; title = "histogram")
    hist!(ax2, vec(img); bins = 40)
    level = ThresholdInteractable(
        ax2; orientation = :vertical, value = 0.5, id = :level, live = v -> (mask[] = masked(v)),
    )
    masque(fig, level; backend)
end;

# ╔═╡ e1000000-0000-0000-0000-000000000004
@bind level w

# ╔═╡ e1000000-0000-0000-0000-000000000005
HTML(
    "<span id=\"out_live\">LEVEL=$(repr(level)) AREA=$(count(>(level.value), img))</span>" *
        "<span id=\"backend_live\">$(backend)</span>" *
        "<span id=\"manifest_live\" style=\"display:none\">$(JSON3.write((; width = w.manifest["width"], layers = [l for l in w.manifest["layers"] if l["kind"] == "threshold"])))</span>",
)

# ╔═╡ Cell order:
# ╠═e1000000-0000-0000-0000-000000000001
# ╠═e1000000-0000-0000-0000-000000000002
# ╠═e1000000-0000-0000-0000-000000000003
# ╠═e1000000-0000-0000-0000-000000000004
# ╠═e1000000-0000-0000-0000-000000000005
