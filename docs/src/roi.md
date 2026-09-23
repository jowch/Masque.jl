# Brush a region

Drag a rectangle on a 2D scatter. When you release, Julia sees either the box
bounds or the points the box enclosed.

The following embed is that brush on this docs site. Dragging the box to a
listed set swaps the table. Any other geometry still moves the box; the
table stays on the last listed set.

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

Prerequisites: [Install](@ref) and [Getting started](@ref) cells in your
notebook, plus `Markdown` for the table cell.

**1.** Plot ten stations, a [`PointInteractable`](@ref) with `id = :pts`, and an
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

**2.** Bind the widget. A vector of interactables is required here, because the
   box is not part of `auto_interactables`:

```julia
@bind picks masque(fig, [pts, roi])
```

Pluto rejects two cells that both `@bind` the same name. Replace the bind
cell; do not add a second. `masque` does not mutate `fig`.

**3.** Filter a table from `picks`:

```julia
if picks === nothing
    md"*Drag the box over some stations, then release.*"
elseif isempty(picks)
    md"*No stations in the box.*"
else
    rows = samples[picks]
    md_rows = ["| Station | x | y | Group |", "|---|---:|---:|---|"]
    for r in rows
        push!(md_rows, "| $(r.name) | $(r.x) | $(r.y) | $(r.group) |")
    end
    Markdown.parse("**$(length(rows)) stations**\n\n" * join(md_rows, "\n"))
end
```

Before the first release, `picks` is `nothing`. After you release, `picks` is
a `Vector` of [`ElementEvent`](@ref) values. An empty box commits `[]`,
never `nothing`. `e.index` is 1-based; `samples[e]` is the enclosed
station. Each event's `layer` is `:pts`. Enclosed points highlight
in the overlay; the PNG does not change.

On this docs site, the player lists a handful of
`{ items: [{ layer, index }, …] }` sets (including empty `items`), keyed
the same way the overlay commits. Exact pixel bounds are not in that
table. Unlisted box geometry still moves in the overlay; the table stays
on the last listed set.

## If your rows are a table

If the points come from a table, pull columns for `scatter!` and pass
`payloads` as a `DataFrame` with one row per mark, in the same order, or
as a vector of NamedTuples. Do not pass `eachrow(df)` as `payloads`.

```julia
xs = Float64[r.x for r in table]
ys = Float64[r.y for r in table]
pts = PointInteractable(ax, collect(zip(xs, ys)); id = :pts, payloads = table)
```

Filter with `table[picks, :]` when `payloads` is that DataFrame, or with
`e.name` on each event. After a `selects` release, `picks` is a
`Vector{ElementEvent}`. An empty box is still `[]`:

```julia
if picks === nothing
    md"*Drag the box, then release.*"
elseif isempty(picks)
    md"*No stations in the box.*"
else
    rows = table[picks, :]
    md_rows = ["| Station | x | y | Group |", "|---|---:|---:|---|"]
    for r in eachrow(rows)
        push!(md_rows, "| $(r.name) | $(r.x) | $(r.y) | $(r.group) |")
    end
    Markdown.parse("**$(nrow(rows)) stations**\n\n" * join(md_rows, "\n"))
end
```

`index` is 1-based. Slicing the original table with `e.index` works only
while row order matches the interactable. `e.name` and `table[picks, :]`
read the row you passed. For more information, see [Constructors](@ref).

## Drag and resize

The box draws four corner grips. A corner resizes two axes. The middle
of each side resizes that one axis, with no grip drawn there. The
pointer shows a directional resize cursor on a corner or an edge
midpoint, and a move cursor in the interior.

If the same axis also has a [`ViewInteractable`](@ref), Shift+drag yields to
the view: the plot pans (or orbits) instead of moving the box.

The keyboard cannot drag the box. Tab reaches scatter points, not the ROI.
For more information, see [Keyboard and screen readers](@ref).

## Commit bounds or enclosed items

Omit `selects` when you want the rectangle itself. On release the bond is a
[`BoundsEvent`](@ref) (`box.xmin` .. `box.ymax`). `bounds=` accepts that
4-tuple or a `BoundsEvent`:

```julia
ROIInteractable(ax; bounds = (1.0, 4.0, 2.0, 5.0))
```

With `selects`, the bond is a `Vector{ElementEvent}` over points, or one
[`GridWindowEvent`](@ref) over a grid:

- Circles (`PointInteractable`, kind `:circles`): one [`ElementEvent`](@ref)
  per enclosed point. `e.name` is that row.
- Grid ([`RectInteractable`](@ref) heatmap or image, kind `:grid`): **one**
  [`GridWindowEvent`](@ref) with 1-based inclusive `i1:i2` / `j1:j2`
  (`A[win]` is `A[win.i1:win.i2, win.j1:win.j2]`), not one event per
  cell. The enclosed cell-block is fill-only in the overlay; the ROI box
  is the outline.
- Empty points box: `[]`, never `nothing`. A grid brush that misses the
  grid is one `GridWindowEvent` whose ranges are empty, not `[]`.

`selects` names a layer id whose kind is `:circles` or `:grid`. The target
must be in the same `masque` call. `selects = :bars` fails
(`ArgumentError`): bars are `:rects`. A polyline layer fails the same way.

## Axes that work

`ROIInteractable` works on a 2D `Axis` with linear or log numeric scales
(`identity`, `log10`, `log`). It raises `ArgumentError` on `Axis3`,
`PolarAxis`, or a categorical axis.

A larger live-Pluto scatter brush is the "Box-select scatter" recipe in
[`gallery/gallery.jl`](https://github.com/jowch/Masque.jl/blob/main/gallery/gallery.jl).
The image ROI in that notebook is the `:grid` cousin: one
[`GridWindowEvent`](@ref) on release, not a listed cell-by-cell player. For
more information, see
[Examples](@ref).
