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
snapshots, not a live Julia process.

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

1. Load Masque and a Makie backend:

```julia
using Masque, CairoMakie
```

The entry function is lowercase `masque`. A function named `Masque` clashes
with `module Masque`. With no backend loaded, `masque` raises
`ArgumentError`.

2. Create the cities scatter and its interactable. Pass `radius=` so the
   highlight sits on the drawn disc:

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

3. Bind a click. A single interactable is legal; a one-element vector is
   also legal. `masque` does not mutate `fig`:

```julia
@bind pick masque(fig, cities)
```

Pluto rejects two cells that both `@bind` the same name. Replace the bind
cell; do not add a second.

4. Read the pick:

```julia
pick === nothing ? "click a city" : "$(pick.payload.city) selected"
```

Before a click, `pick` is `nothing` (unless you pass `selected=`). After a
click, `pick` is an [`InteractionEvent`](@ref): `layer` is `:cities`,
`index` is 0-based, and `payload` is the Julia object from
`payloads[index + 1]` (`===`, not a JSON copy). Index it as
`pick.payload.city`, not `pick.payload.label`. A click in empty space does
not write the bond and does not clear the selection.

`InteractionEvent` is exported by Masque. Do not redefine it in the
notebook.

`payloads` length must match the points (`ArgumentError` otherwise). Each
payload is a NamedTuple `(; city, pop)`. Placeholders in `masque"..."` are
payload field names, not Julia locals: `$(city)` reads `payload.city` in the
browser. `id` becomes `InteractionEvent.layer` (`:cities` here). Bare points
default to `:points`; introspecting a `Scatter` defaults to `:scatter`.

This plot needs custom `payloads`, `colors=`, and `tooltip=`, so it uses the
points constructor plus `radius=`. `PointInteractable(ax, p::Makie.Scatter;
tooltip = masque"…")` is a `MethodError`. Plot-object constructors that take
`payloads` still do not take `tooltip=` except `TextInteractable`.
`tooltip = true` raises `ArgumentError`.

## Inspect a mark without Julia

Holding the pointer over a city shows the tooltip and highlights the mark
in the overlay. That path does not assign `pick` and does not re-run cells
that read `pick`. The highlight after a click also runs in the overlay; the
PNG does not change.

`colors` on the layer is a tooltip accent. `scatter!`'s `color=` does not
change the overlay highlight. Holding the pointer over a mark that is
already selected still shows the tooltip and still fires `@bind` on click.

## Make the highlight hug the marker

`PointInteractable(ax, points)` defaults `radius` to 9 logical px and never
reads the marker. Next to `scatter!` with `markersize = 18` and the default
`:circle`, that is a halo around the disc. The cities cell passes
`radius = 0.3525 * markersize` so the highlight sits on the drawn disc.

Two hug paths are legal:

- Pass the scatter plot object when you do not need `tooltip=`:
  `p = scatter!(ax, xs, ys; markersize); PointInteractable(ax, p)`.
  Radius comes from the drawn marker. Default `:circle` →
  `r ≈ 0.3525 × markersize`. A `Circle` or `Rect` sprite →
  `r = markersize / 2`. Anything else → `markersize / 2`. This requires
  `markerspace = :pixel` (the default); otherwise pass `radius=`.
- Use the points constructor with `radius = 0.3525 * markersize` for
  default `:circle`, as in the cities cell, when you need `tooltip=`,
  `colors=`, or custom `payloads`.

Do not pass `radius = markersize / 2` for default `:circle` (still a halo).
Do not pass `radius = markersize` for a `Circle` sprite (that value is the
diameter; the shipped `r` is half). Calling `masque(fig)` uses the Scatter
constructor and already hugs the marker.

## Use these cells in a larger notebook

Take the cities cells into a larger notebook. Add more plots on the same
`Figure`. One `masque` call covers every axis: pass a vector of
interactables. Layer ids must not collide; repeats of a kind in
`auto_interactables` become `:scatter_2`. A second axis is still one
overlay, not a second widget.

`auto_interactables` walks every `Axis` / `Axis3` / `PolarAxis` plot it
knows, plus every `Colorbar` and `Legend`. It does not install
`AxisInteractable`, `ThresholdInteractable`, `ROIInteractable`, or
`ViewInteractable`. Unsupported plots are skipped with `@warn`, not an
error. On huge data, `masque(fig)` allocates one default payload per
element; pass a lean `payloads=` (or skip the layer) yourself. `max_width`
defaults to 700 (Pluto's column).

Do not add a second `@bind pick` cell. Do not `deepcopy(fig)` (Makie
`Figure`s cannot). Do not feed this widget's own bond into the same call's
`selected=` (Pluto cycle). `masque(fig)` on a large demo figure does not
install ROI, view, threshold, or a hand-built `LegendInteractable`.

Outside Pluto, inspection still runs in exported HTML. A cell that reads
`pick` needs a live Pluto session.

## Skip the constructor

When you do not need custom `payloads`, `tooltip=`, or `id`, skip
`PointInteractable` and call `masque(fig)`. That is
`masque(fig, auto_interactables(fig))` after layout. On this same scatter,
it uses the plot-object constructor, so the highlight already hugs the
marker.

Replace the `@bind pick masque(fig, cities)` cell with:

```julia
@bind pick masque(fig)
```

The default payload is `(; index, x, y)`, not `(; city, pop)`. The layer id
is `:scatter`, not `:cities`. `pick.payload.city` then raises an error. An
empty figure warns "overlaying nothing". Auto-extracted layers do not take
`tooltip=` or `label=`; build an explicit interactable for those.

You can also start from `auto_interactables(fig)`, tweak the vector, and
pass it back. For more information, see
[Zero-config: `masque(fig)`](@ref).

## Choose a backend

The first cell loaded CairoMakie. Load `WGLMakie` instead for a live GPU
canvas (experimental). If you load neither, `masque` raises
`ArgumentError`. If you load both, unqualified `masque` uses CairoMakie.
The `backend=` keyword takes an extension instance, not a `:cairo` or
`:webgl` symbol. For more information, see [Backends](@ref).
