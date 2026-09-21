# Brush a region

Drag a rectangle on a 2D scatter. When you release, Julia sees either the box
bounds or the points the box enclosed.

The following embed is that brush on this docs site. The
**Simulating `@bind`** chip marks that listed enclosed-point sets are
precomputed snapshots, not a live Julia process. Dragging the box to a listed
set swaps the table. Dragging to any other geometry still moves the box in the
overlay; the table stays on the last listed set.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-roi-table" title="Stations scatter with a region box and listed @bind table snapshots"
        style="width:100%;height:480px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-roi-table");
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
  el.src = (pretty ? "../embeds/" : "embeds/") + "roi_table.html";
})();
</script>
```

Hold the pointer over a station to read its name. Drag the box interior to
move it, or a handle to resize. Enclosed stations highlight in the overlay.
Julia runs when you release, not while you drag.

## Overlay a scatter and a box

`masque(fig)` does not install an [`ROIInteractable`](@ref). Pass the box in
the same `masque` call as the layer it brushes.

This page is a new notebook. It does not reuse `fig` or `pick` from the
cities scatter. Develop the checkout and load a backend as on
[Install](@ref), plus `Markdown` for the table cell. Skip the load cell if
this notebook already ran it. Do not paste `using` twice.

In a Pluto notebook, paste each of the following snippets into its own cell.
Pluto runs one top-level expression per cell. Wrap multiple statements in
`begin ... end`.

**1.** Develop the checkout and load CairoMakie and Markdown:

```julia
begin
    using Pkg
    Pkg.develop(path = "path/to/Masque.jl")
    Pkg.add("CairoMakie")
    using Masque, CairoMakie, Markdown
end
```

**2.** Plot ten stations, a [`PointInteractable`](@ref) with `id = :pts`, and an
   `ROIInteractable` whose `selects` names that layer. `bounds` is required:
   `(xmin, xmax, ymin, ymax)` in data space, with `xmin < xmax` and
   `ymin < ymax` (`ArgumentError` otherwise):

```julia
begin
    samples = [
        (name = "North-1", x = 1.5, y = 8.0, group = "North"),
        (name = "North-2", x = 2.5, y = 7.2, group = "North"),
        (name = "North-3", x = 2.0, y = 9.0, group = "North"),
        (name = "Mid-1", x = 5.0, y = 5.0, group = "Mid"),
        (name = "Mid-2", x = 5.8, y = 4.2, group = "Mid"),
        (name = "Mid-3", x = 4.5, y = 5.8, group = "Mid"),
        (name = "South-1", x = 8.0, y = 1.5, group = "South"),
        (name = "South-2", x = 8.8, y = 2.4, group = "South"),
        (name = "South-3", x = 7.2, y = 2.0, group = "South"),
        (name = "East", x = 9.0, y = 6.5, group = "East"),
    ]
    group_color = Dict(
        "North" => "#4363d8",
        "Mid" => "#f58231",
        "South" => "#3cb44b",
        "East" => "#911eb4",
    )
    palette = [group_color[s.group] for s in samples]
    xs = Float64[s.x for s in samples]
    ys = Float64[s.y for s in samples]

    fig = Figure(size = (560, 360))
    ax = Axis(
        fig[1, 1];
        xlabel = "x",
        ylabel = "y",
        limits = (0.5, 10.0, 0.5, 10.0),
    )
    markersize = 18
    scatter!(ax, xs, ys; color = palette, markersize)
    pts = PointInteractable(
        ax, collect(zip(xs, ys));
        id = :pts,
        radius = 0.3525 * markersize,
        payloads = [
            (; name = s.name, group = s.group, x = s.x, y = s.y)
            for s in samples
        ],
    )
    roi = ROIInteractable(
        ax;
        bounds = (4.0, 6.5, 3.8, 6.5),
        selects = :pts,
    )
    nothing
end
```

**3.** Bind the widget. A vector of interactables is required here, because the
   box is not part of `auto_interactables`:

```julia
@bind picks masque(fig, [pts, roi])
```

Pluto rejects two cells that both `@bind` the same name. Replace the bind
cell; do not add a second. `masque` does not mutate `fig`.

**4.** Filter a table from `picks`:

```julia
if picks === nothing
    md"*Drag the box over some stations, then release.*"
elseif isempty(picks)
    md"*No stations in the box.*"
else
    rows = [samples[e.index + 1] for e in picks]
    lines = ["| Station | x | y | Group |", "|---|---:|---:|---|"]
    for r in rows
        push!(lines, "| $(r.name) | $(r.x) | $(r.y) | $(r.group) |")
    end
    Markdown.parse("**$(length(rows)) stations**\n\n" * join(lines, "\n"))
end
```

Before the first release, `picks` is `nothing`. After you release, `picks` is
a `Vector` of [`InteractionEvent`](@ref) values. An empty box commits `[]`,
never `nothing`. Index `e.index` is 0-based; `samples[e.index + 1]` is the
enclosed station. Each event's `layer` is `:pts`. Enclosed points highlight
in the overlay; the PNG does not change.

On this docs site, the player lists a handful of
`{ items: [{ layer, index }, …] }` sets (including empty `items`), keyed
the same way the overlay commits. Exact pixel bounds are not in that
table. Unlisted box geometry still moves in the overlay; the table stays
on the last listed set.

## From a table

If the points come from a table, pull columns for `scatter!` and build
`payloads` as a vector of NamedTuples, one per mark, in the same order.
Do not pass `eachrow(df)` as `payloads`. Do not pass the `DataFrame`
itself.

```julia
xs = Float64[r.x for r in table]
ys = Float64[r.y for r in table]
payloads = [(; name = r.name, group = r.group, x = r.x, y = r.y) for r in table]
```

Filter with payload identity, not `samples[e.index + 1]`. After a
`selects` release, each event's `payload` is the NamedTuple you passed
(`===`). An empty box is still `[]`:

```julia
if picks === nothing
    md"*Drag the box, then release.*"
elseif isempty(picks)
    md"*No stations in the box.*"
else
    rows = [e.payload for e in picks]
    lines = ["| Station | x | y | Group |", "|---|---:|---:|---|"]
    for r in rows
        push!(lines, "| $(r.name) | $(r.x) | $(r.y) | $(r.group) |")
    end
    Markdown.parse("**$(length(rows)) stations**\n\n" * join(lines, "\n"))
end
```

`index` stays 0-based. Slicing the original table with `e.index + 1`
works only while row order matches the interactable. Payload identity
survives a reorder. For more information, see [Constructors](@ref).

## Drag and resize

The box has eight square handles. Corner handles resize two axes. Edge
midpoint handles resize one axis. The pointer shows a directional resize
cursor on a handle and a move cursor in the interior.

If the same axis also has a [`ViewInteractable`](@ref), Shift+drag yields to
the view: the plot pans (or orbits) instead of moving the box.

The keyboard cannot drag the box. Tab reaches scatter points, not the ROI.
For more information, see [Keyboard and screen readers](@ref).

## Commit bounds or enclosed items

Omit `selects` when you want the rectangle itself. On release the bond is a
scalar `InteractionEvent` with `index = 0` and payload
`(; xmin, xmax, ymin, ymax)`:

```julia
ROIInteractable(ax; bounds = (1.0, 4.0, 2.0, 5.0))
```

With `selects`, the bond is a `Vector{InteractionEvent}` instead of that
bounds event:

- Circles (`PointInteractable`, kind `:circles`): one item per enclosed
  point, matching the payload that mark's click reports.
- Grid ([`RectInteractable`](@ref) heatmap or image, kind `:grid`): **one**
  range item `(; i0, i1, j0, j1, xmin, xmax, ymin, ymax)`, not one event per
  cell. The enclosed cell-block is fill-only in the overlay; the ROI box
  is the outline.
- Empty: `[]`, never `nothing`.

`selects` names a layer id whose kind is `:circles` or `:grid`. The target
must be in the same `masque` call. `selects = :bars` fails
(`ArgumentError`): bars are `:rects`. A polyline layer fails the same way.

## Axes that work

`ROIInteractable` works on a 2D `Axis` with linear or log numeric scales
(`identity`, `log10`, `log`). It raises `ArgumentError` on `Axis3`,
`PolarAxis`, or a categorical axis.

A larger live-Pluto scatter brush is the "Box-select scatter" recipe in
[`gallery/gallery.jl`](https://github.com/jowch/Masque.jl/blob/main/gallery/gallery.jl).
The image ROI in that notebook is the `:grid` cousin: one range item on
release, not a listed cell-by-cell player. For more information, see
[Examples](@ref).
