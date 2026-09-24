# Brush a region

Drag a rectangle on a 2D scatter. When you release, Julia sees either the box
bounds or the points the box enclosed.

The following embed is that brush on this docs site. Dragging the box to a
listed set swaps the table. Any other geometry still moves the box; the
table stays on the last listed set.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-roi-table" data-masque-embed="roi_table" title="Stations scatter with a region box and listed @bind table snapshots" style="width:100%;height:1400px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("roi_table")
```

Hold the pointer over a station to read its name. Drag the box interior to
move it, or a handle to resize. Enclosed stations highlight in the overlay.
Julia runs when you release, not while you drag.

## Overlay a scatter and a box

The notebook is the tutorial. It scatters the stations, passes that
scatter to `PointInteractable` with the station rows as `payloads`, and
brushes them with `ROIInteractable`. `masque(fig)` does not add the box.
Pass it in the same call as the points.

`bounds` is `(xmin, xmax, ymin, ymax)` in data space, with `xmin < xmax`
and `ymin < ymax`.

Before the first release, `picks` is `nothing`. After you release,
`picks` is the stations inside the box. An empty box is an empty list.
`samples[picks]` is those rows. Enclosed points highlight in the overlay.

On this site the chip lists a handful of boxes, including an empty one.
A box that is not in that list still moves; the table stays on the last
listed set.

## If your rows are a table

If the points come from a table, pull columns for `scatter!` and pass
`payloads` as a `DataFrame` with one row per mark, in the same order, or
as a vector of NamedTuples. Do not pass `eachrow(df)` as `payloads`.

```julia
pts = PointInteractable(ax, s; id = :pts, payloads = table)
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

If the same axis also has a [`ViewInteractable`](@ref), Shift+drag pans
instead of moving the box. Orbit is the `Axis3` camera, and
[`ROIInteractable`](@ref) raises `ArgumentError` on an `Axis3`.

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

A larger scatter brush is [Box-select scatter](@ref). The
image cousin is [Image ROI](@ref): one [`GridWindowEvent`](@ref) on
release, not a listed cell-by-cell player. For more information, see
[Gallery](@ref).
