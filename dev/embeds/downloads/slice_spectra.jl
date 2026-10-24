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
# ╔═╡ 5c1ce000-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ 5c1ce000-0001-4000-8000-000000000009
md"""
Move the pointer across the plot. A vertical line follows it, a dot marks where it crosses each spectrum, and the tooltip lists each spectrum's absorbance at that wavelength.
"""

# ╔═╡ 5c1ce000-0001-4000-8000-000000000010
md"""
Plot each spectrum with its own `lines!` call. A `label` that starts with a letter and holds only letters, digits, and underscores names that spectrum's row in the tooltip.
"""

# ╔═╡ 5c1ce000-0001-4000-8000-000000000002
begin
    peak(λ, center, height, width) = height * exp(-((λ - center) / width)^2)
    λ = 420:2:680
    control = peak.(λ, 520, 0.9, 40)
    treated = peak.(λ, 555, 0.7, 45)
    washed = peak.(λ, 530, 0.8, 42)

    fig = Figure(size = (560, 340))
    ax = Axis(fig[1, 1]; xlabel = "Wavelength (nm)", ylabel = "Absorbance")
    a = lines!(ax, λ, control; label = "control")
    b = lines!(ax, λ, treated; label = "treated")
    c = lines!(ax, λ, washed; label = "washed")
    axislegend(ax; position = :rt)
    readout = AxisInteractable(ax)
    nothing
end

# ╔═╡ 5c1ce000-0001-4000-8000-000000000011
md"""
Pass all three plots to one `SliceInteractable`, because `masque(fig)` does not add one on its own. The slice only shows values, so to keep a wavelength, add an `AxisInteractable` as well, and `bind = readout` makes `at` its value. `auto = false` leaves out what `masque(fig)` would add for the lines and the legend, so only the slice and the readout respond to the pointer.

In your own notebook, a click saves the position in `at`. This page does not record clicks, so only the hover works here.
"""

# ╔═╡ 5c1ce000-0001-4000-8000-000000000003
@bind at masque(
    fig,
    SliceInteractable([a, b, c]),
    readout;
    auto = false,
    bind = readout,
)

# ╔═╡ 5c1ce000-0001-4000-8000-000000000012
md"""
`at` starts as `nothing`. After a click, `at.x` is the wavelength you clicked, and this cell reads each spectrum at the nearest measured wavelength.
"""

# ╔═╡ 5c1ce000-0001-4000-8000-000000000004
if isnothing(at)
    "click a wavelength"
else
    i = argmin(abs.(λ .- at.x))
    (; wavelength = λ[i], control = control[i], treated = treated[i], washed = washed[i])
end

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═5c1ce000-0001-4000-8000-000000000001
# ╟─5c1ce000-0001-4000-8000-000000000009
# ╟─5c1ce000-0001-4000-8000-000000000010
# ╠═5c1ce000-0001-4000-8000-000000000002
# ╟─5c1ce000-0001-4000-8000-000000000011
# ╠═5c1ce000-0001-4000-8000-000000000003
# ╟─5c1ce000-0001-4000-8000-000000000012
# ╠═5c1ce000-0001-4000-8000-000000000004
# ╟─00000000-0000-0000-0000-000000000001
