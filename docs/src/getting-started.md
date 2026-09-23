# Getting started

Masque overlays a Makie figure in Pluto. Hold your pointer over a city
to read its population. Click a city to select it; `@bind` captures that
pick, and a cell that reads it re-runs.

The embed on this page is that scatter. On this site the **Simulating
`@bind`** chip is a listed snapshot; in your notebook, the next cell
re-runs.

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

In the iframe, hold your pointer over Tokyo to read the population, then
click a city and watch the **Simulating `@bind`** chip.

## Install

In a Pluto notebook, paste each snippet from these docs into its own
cell. Pluto runs one top-level expression per cell. Wrap multiple
statements in `begin ... end`, which counts as one expression.

[Note: add the Pluto.activate_notebook_environment path to preserve nbpkg.]

```julia
begin
    using Pkg
    Pkg.add(url = "https://github.com/jowch/Masque.jl")
    Pkg.add("CairoMakie")
    using Masque, CairoMakie
end
```

[Note: wrap this in a documenter info callout]
Masque currently supports two backends, CairoMakie and WGLMakie. `using Masque`
with no Makie backend raises `ArgumentError` the first time `masque` runs. If
both CairoMakie and WGLMakie are loaded at the same time, then `masque` defaults
to CairoMakie. See [Backends](@ref) for more information.

## Quick start

[Note: quickstart embed needs to show code unfolded. Use cells with md"" in them for annotation.]

The following embed is a three-point scatter: your figure, `masque`, and
a readout. Hover a point, then click one. On this site the **Simulating
`@bind`** chip is a listed snapshot.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gs-quickstart" title="Three-point scatter with listed @bind snapshots"
        style="width:100%;height:480px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gs-quickstart");
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
  el.src = (pretty ? "../embeds/" : "embeds/") + "home_quickstart.html";
})();
</script>
```

`sel` is `nothing` until a click, then `sel.payload` is
`(; index, x, y)`.

[Note: remove cities example, expand simple example above to fold in custom tooltips, bind, reacting to bind values, etc. + descriptions]

<!-- ## Overlay the cities scatter

The entry function is lowercase `masque`. A function named `Masque`
clashes with `module Masque`.

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

**2.** Bind a click. A single interactable is legal; a one-element vector
   is also legal. `masque` does not mutate `fig`:

```julia
@bind pick masque(fig, cities)
```

Pluto rejects two cells that both `@bind` the same name. Replace the
bind cell; do not add a second.

Hold your pointer over a city. The tooltip shows the name and
population. A click selects that city; a cell that reads `pick` re-runs.
Hover does not change `pick`.

**3.** Read the pick:

```julia
pick === nothing ? "click a city" : "$(pick.city) selected"
```

Click a city. The readout becomes `"Tokyo selected"` (or whichever city
you clicked). Before a click, `pick` is `nothing`. After a click, `pick`
is an [`ElementEvent`](@ref): `layer` is `:cities`, `index` is 1-based,
and `pick.city` is that row's field. `cities_data[pick]` is the same row.
The selection stays on the last mark clicked. A click in empty space
does not change `pick`.

`ElementEvent` is exported by Masque. Do not redefine it in the
notebook.

For other event types, see [Constructors](@ref). -->

[Note: add pointers to examples and other next things to read]
