# Legend

Hold the pointer over a legend entry to wash that series in the overlay.
Click the entry to write that pick into Julia.

The overlay cannot hide Makie traces. Use the wash plus `@bind` so a Julia
cell can filter the series.

The following embed is two `lines!` with labels `"a"` and `"b"`, plus
`axislegend`, on this docs site. The **Simulating `@bind`** chip marks that
listed legend clicks are precomputed snapshots, not a live Julia process.
Hold the pointer over an entry to wash its line. Click **a** or **b** to
swap the Julia readout. Listed clicks are `{layer: "legend", index}` `0`
and `1` — idle plus both entries.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-legend-lines" title="two-line axislegend with listed @bind snapshots"
        style="width:100%;height:480px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-legend-lines");
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
  el.src = (pretty ? "../embeds/" : "embeds/") + "legend_lines.html";
})();
</script>
```

## Overlay two series

In a Pluto notebook, paste each of the following snippets into its own
cell. Pluto runs one top-level expression per cell. Wrap multiple
statements in `begin ... end`.

**1.** Load Masque and a Makie backend:

```julia
using Masque, CairoMakie
```

**2.** Draw two lines, label them, and add `axislegend`:

```julia
begin
    xs = range(0, 2π; length = 80)
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
    lines!(ax, xs, sin.(xs); label = "a")
    lines!(ax, xs, cos.(xs); label = "b")
    axislegend(ax)
    nothing
end
```

**3.** Bind a click. `masque(fig)` walks the figure and installs a
   [`LegendInteractable`](@ref) from `auto_interactables` with
   `plotmap`, which links each entry to its traces:

```julia
@bind pick masque(fig)
```

**4.** Read the pick:

```julia
pick === nothing ? "click a legend entry" : "$(pick.payload.label) → $(pick.payload.targets)"
```

Before a click, `pick` is `nothing`. After a click, `pick` is an
[`InteractionEvent`](@ref): `layer === :legend`, `index` is 0-based in
the legend, and `payload` is `(; label, group, targets)`. `targets` are
`String` values (`"lines"`, `"lines_2"`), not `Symbol`s. `group` is the
entry's group title, or `nothing` on an ungrouped legend.

The click bond is that legend event. The highlight in the overlay is the
linked traces, not the swatch. A cell that reads `pick` as a `Vector` of
series points is looking at the wrong object.

## Persist a series wash

`selected = Dict(:legend => [0])` paints the **swatch** — the legend
layer is `:rects`. To keep a series washed across a remount, hydrate the
**target** layer ids instead. For more information, see
[Selection](@ref).

## Empty links

A legend with no links is still hittable. The tooltip still shows the
label, and a click still fires. The visual echo **clears**.

`LegendInteractable(leg)` on a custom `LineElement` legend with no
`plots=` and no `targets=` has empty links. Pass `plots=` on the
element (Makie's own keyword) or pass `targets=` on
[`LegendInteractable`](@ref).

## Supply explicit targets

Pass `targets=` when auto-link is not enough:

```julia
LegendInteractable(leg; targets = Dict("a" => :lines, "b" => [:lines_2, :scatter]))
```

`targets` also accepts a `Vector` — one value per legend entry, in
order (top to bottom, matching a grouped legend's flattened
`entrygroups`) — `Symbol` / `Vector{Symbol}` / `nothing`. A `Dict` key
that matches no label, a wrong-length `Vector`, or a target that names
an unknown layer or an unhighlightable kind raises `ArgumentError` at
build time.

An explicit `targets=` is fail-loud. The auto path drops unhighlightable
kinds (`:grid`) with `@warn` and keeps the rest.

`scatterlines!` and `stem!` auto-link both of their layers. With
`merge = true`, one legend entry names several ids. A second legend in
the figure is `:legend_2`. The manifest sorts legend layers first so
they win pixels under them.

## Tooltip

The default tooltip is the entry's label (`masque"$(label)"`). Pass your
own `masque"..."` template (fields: `label`, `group`, `targets`) or
`tooltip = false` to suppress it. For more information, see
[Tooltips](@ref).

A whole-layer wash can span axes. That two-panel picture lives on
[Linked views](@ref). This page is two `lines!` plus `axislegend` on one
axis.
