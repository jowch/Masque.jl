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


# ╔═╡ b10f0005-0001-4000-8000-000000000001
using Masque, CairoMakie, Random

# ╔═╡ b10f0005-0001-4000-8000-000000000002
begin
    fruit = ["Apples", "Pears", "Plums", "Figs"]
    sold = [42, 31, 18, 25]

    fig = Figure(size = (520, 320))
    ax = Axis(fig[1, 1]; xticks = (1:4, fruit), ylabel = "Crates sold")
    b = barplot!(ax, 1:4, sold)
    nothing
end

# ╔═╡ b10f0005-0001-4000-8000-000000000003
@bind pick masque(fig; bind = b)

# ╔═╡ b10f0005-0001-4000-8000-000000000004
pick

# ╔═╡ b10f0005-0001-4000-8000-000000000005
stalls = [
    (fruit = "Apples", stall = "North gate"),
    (fruit = "Pears", stall = "Bridge"),
    (fruit = "Plums", stall = "North gate"),
    (fruit = "Figs", stall = "Square"),
]

# ╔═╡ b10f0005-0001-4000-8000-000000000006
masque(
    fig,
    interactables(
        b;
        payloads = stalls,
        tooltip = masque"<b>$(fruit)</b><br>$(value) crates at $(stall)",
    ),
)

# ╔═╡ b10f0005-0001-4000-8000-000000000007
begin
    quarter = repeat(1:4; outer = 2)
    product = repeat([1, 2]; inner = 4)
    sales = [5, 7, 6, 8, 3, 2, 4, 3]

    fig2 = Figure(size = (520, 320))
    ax2 = Axis(
        fig2[1, 1];
        xticks = (1:4, ["Q1", "Q2", "Q3", "Q4"]),
        ylabel = "Sales",
    )
    b2 = barplot!(ax2, quarter, sales; stack = product, color = product)
    nothing
end

# ╔═╡ b10f0005-0001-4000-8000-000000000008
masque(
    fig2,
    interactables(
        b2;
        payloads = [(product = p == 1 ? "Tea" : "Coffee",) for p in product],
        tooltip = masque"<b>$(product)</b><br>$(value) sold, from $(low) to $(high)",
    ),
)

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═b10f0005-0001-4000-8000-000000000001
# ╠═b10f0005-0001-4000-8000-000000000002
# ╠═b10f0005-0001-4000-8000-000000000003
# ╠═b10f0005-0001-4000-8000-000000000004
# ╠═b10f0005-0001-4000-8000-000000000005
# ╠═b10f0005-0001-4000-8000-000000000006
# ╠═b10f0005-0001-4000-8000-000000000007
# ╠═b10f0005-0001-4000-8000-000000000008
# ╟─00000000-0000-0000-0000-000000000001
