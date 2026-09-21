# Getting started

This page overlays one Makie figure: an eight-city scatter. Hold the pointer
over a city to read its population. Click a city to write that pick into
Julia.

In a Pluto notebook, paste each of the following snippets into its own cell.
Pluto runs one top-level expression per cell. Wrap multiple statements in
`begin ... end`. Showing `fig` alone does not mount the overlay; `masque`
returns the HTML that does.

The following embed is that scatter on this docs site. The
**Simulating `@bind`** chip marks that listed city clicks are precomputed
snapshots, not a live Julia process. For which gestures write `@bind`
and which stay in the overlay, see [Hover, click, and bind](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gs-player" title="README demo cities scatter with listed @bind snapshots"
        style="width:100%;height:480px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gs-player");
  if (!el) return;
  function isDocDark() {
    var c = document.documentElement.className || "";
    if (!c) return false;
    if (/(^|\s)theme--(documenter-light|catppuccin-latte)(\s|$)/.test(c)) return false;
    return /(^|\s)theme--/.test(c);
  }
  function pushTheme() {
    var doc = el.contentDocument;
    if (!doc) return;
    doc.documentElement.classList.toggle("pluto-dark", isDocDark());
  }
  el.addEventListener("load", pushTheme);
  new MutationObserver(pushTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  el.src = (pretty ? "../embeds/" : "embeds/") + "getting_started.html";
})();
</script>
```

## Overlay the cities scatter

If this notebook has not loaded Masque yet, paste an [Install](@ref)
load cell first (`Pkg.develop` or `Pkg.add(url=…)`, then
`using Masque, CairoMakie`). Skip the load cell if this notebook already
ran it. Do not paste `using` twice — Pluto reports multiple definitions
for CairoMakie and Masque.

The entry function is lowercase `masque`. A function named `Masque` clashes
with `module Masque`. With no backend loaded, `masque` raises
`ArgumentError`.

**1.** Create the cities scatter and its interactable:

```julia
begin
cities_data = [
    (city = "Tokyo", pop_m = 37.4, pop = 37_400_000, gdp = 1600),
    (city = "Delhi", pop_m = 32.9, pop = 32_900_000, gdp = 370),
    (city = "Shanghai", pop_m = 28.5, pop = 28_500_000, gdp = 780),
    (city = "São Paulo", pop_m = 22.4, pop = 22_400_000, gdp = 430),
    (city = "Mexico City", pop_m = 22.1, pop = 22_100_000, gdp = 411),
    (city = "Cairo", pop_m = 21.3, pop = 21_300_000, gdp = 165),
    (city = "Mumbai", pop_m = 20.7, pop = 20_700_000, gdp = 310),
    (city = "Beijing", pop_m = 21.5, pop = 21_500_000, gdp = 700),
]
city_colors = [
    "#e6194b", "#3cb44b", "#4363d8", "#f58231",
    "#911eb4", "#0e9aa7", "#f032e6", "#9a8b00",
]
xs = Float64[c.pop_m for c in cities_data]
ys = Float64[c.gdp for c in cities_data]

fig = Figure(size = (560, 360))
ax = Axis(
    fig[1, 1];
    xlabel = "Population (millions)",
    ylabel = "GDP (US\$bn)",
)
markersize = 18
scatter!(ax, xs, ys; color = city_colors, markersize)
cities = PointInteractable(
    ax, collect(zip(xs, ys));
    id = :cities,
    radius = 0.3525 * markersize,
    payloads = [(; city = c.city, pop = c.pop) for c in cities_data],
    colors = (;
        palette = city_colors,
        index = collect(0:(length(cities_data) - 1)),
    ),
    tooltip = masque"<b>$(city)</b><br>pop $(pop:,)",
)
nothing
end
```

**2.** Bind a click. A single interactable is legal; a one-element vector is
   also legal. `masque` does not mutate `fig`:

```julia
@bind pick masque(fig, cities)
```

Pluto rejects two cells that both `@bind` the same name. Replace the bind
cell; do not add a second.

Hold the pointer over a city. The tooltip shows the name and population.
That path does not assign `pick` and does not re-run cells that read
`pick`. Do not write a cell that reads `pick` expecting it to update when
you hold the pointer over a city.

**3.** Read the pick:

```julia
pick === nothing ? "click a city" : "$(pick.payload.city) selected"
```

Click a city. The readout becomes `"Tokyo selected"` (or whichever city
you clicked). Before a click, `pick` is `nothing`. After a click, `pick`
is an [`InteractionEvent`](@ref): `layer` is `:cities`, `index` is
0-based, and `payload` is the Julia object from `payloads[index + 1]`
(`===`, not a JSON copy). Index it as `pick.payload.city`, not
`pick.payload.label`. A click in empty space does not write the bond and
does not clear the selection.

`InteractionEvent` is exported by Masque. Do not redefine it in the
notebook.

## You are done

You have an overlay, a hover tooltip, and a click that writes `@bind`.
The readout cell is the sentence that uses the pick. Stop here.

The cities cell passes `radius = 0.3525 * markersize` so the highlight
sits on the default `:circle` disc. For hug paths, `tooltip=` on a plot
object, and `auto_interactables`, see [Constructors](@ref).

A second axis on the same `Figure` is still one `masque` call. For more
information, see [Linked views](@ref).

## Skip the constructor

When you do not need custom `payloads`, `tooltip=`, or `id`, skip
`PointInteractable` and call `masque(fig)`. On this same scatter, that
uses the plot-object constructor, so the highlight already hugs the
marker.

Replace **both** the bind cell and the readout cell. The leftover
`pick.payload.city` cell raises an error: the default payload has no
field `city`.

```julia
@bind pick masque(fig)
```

```julia
pick === nothing ? "click a point" :
    "index $(pick.payload.index) / x $(pick.payload.x) / y $(pick.payload.y)"
```

The default payload is `(; index, x, y)`, not `(; city, pop)`. The layer id
is `:scatter`, not `:cities`. For `auto_interactables` and huge-data
payloads, see [Constructors](@ref).

## Choose a backend

The [Install](@ref) cell loaded CairoMakie. Load `WGLMakie` instead for
a live GPU canvas (experimental). If you load neither, `masque` raises
`ArgumentError`. If you load both, unqualified `masque` uses CairoMakie.
The `backend=` keyword takes an extension instance, not a `:cairo` or
`:webgl` symbol. For more information, see [Backends](@ref).
