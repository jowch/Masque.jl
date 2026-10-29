# What each mark returns

You can click any plot `masque(fig)` recognizes, not just scatters.
Clicking a point, bar, polygon, or text label sets that plot's field in
the `@bind` value to an [`ElementEvent`](@ref), which holds `index`, the
mark's position in your data, and fields that depend on the kind of
mark. Heatmap cells, legend entries, and colorbars give their own event
types; see [How Masque works](@ref).

The example on this page passes the plot as `bind`, so `pick` is the
clicked mark's event itself rather than a named tuple of fields (see
[What the `@bind` value holds](@ref)). [Plot-object defaults](@ref)
lists the fields each plot type reports, and
[Supported plots and axes](@ref) lists which plots work on which axes.

## Bars

A bar reports its `value`, which is its height, and its `low` and `high`
ends, so in a stacked or dodged bar plot you can tell which segment was
clicked:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-bars" data-masque-embed="marks_bars" title="Stacked bars of sales by quarter. Click a segment and the readout names it." style="width:100%;height:1000px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_bars")
```

## What other plots return

A click on any of these plots gives an `ElementEvent` with `index` and
these fields:

| Plot | Fields |
|---|---|
| `barplot!`, `waterfall!` | `value`, `low`, `high` |
| `hist!` | `value` (the bin's height, a count with `normalization = :none`), `low`, `high` |
| `crossbar!` | `midpoint`, `low`, `high` |
| `poly!`, bands, densities, Voronoi cells | `index` only: the polygon's position in the order you plotted them |
| `violin!` | `x`, the violin's category |
| `contourf!` | `low` and `high` of the level |
| `hexbin!` | `x` and `y`, the hexagon's center, and `count` |
| `scatter!` on a `PolarAxis` | `x` is the angle and `y` the radius, in the order you passed them |
| `lines!`, `series!`, `stairs!`, on an `Axis` or a `PolarAxis` | the plotted point nearest the click, once the line is in `bind` (see Lines below) |

Heatmaps have their own page: [Heatmaps and images](@ref).

A polygon reports only its position, so look up anything else by
`pick.index`, or pass the polygon plot `p` to [`interactables`](@ref)
with `payloads` to get it back with the click. Then `pick.name` is the
clicked polygon's name:

```julia
regions = interactables(p;
    payloads = [(name = "North",), (name = "South",), (name = "East",)],
)
@bind pick masque(fig, regions; bind = p)
```

## Lines

Hovering a line shows the point you plotted nearest the pointer (see
[Tooltips](@ref)), but a click on it changes nothing, not even the
other picks, until you name the line in `bind`. A click then picks that
same point, and a ring marks it. `pick.index` is the point's position
in your data, so `xs[pick]` reads it, and `pick.x` and `pick.y` hold it
too. With `select = :many`, each click adds a point. A line on an
`Axis3` has no points to pick, so a click there picks the whole line.
To read every line at the same `x`, use a [`SliceInteractable`](@ref)
instead.

When one `series!` call draws several curves, passing that plot as
`bind` makes them clickable, and `pick.line` says which curve you
clicked. To click lines from separate `lines!` calls, name each one in
`bind`, and each gets its own field:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-lines" data-masque-embed="marks_lines" title="A sine and a cosine. Click either line to pick its nearest point." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_lines")
```

Then `sel.sine` and `sel.cosine` each hold `nothing` or the point
clicked on that line. The same works for `stairs!`. A `scatterlines!`
plot's points take clicks without `bind`, as `sel.scatterlines.points`,
and its line does not. To make a line clickable while keeping every
other plot's field, pass `interactables(l1)` after the figure instead of
naming it in `bind`.

Plots made of separate pieces make each piece its own mark and take
clicks without `bind`: `linesegments!`, error bars, range bars,
`hlines!`, and `vlines!`.

[Supported plots and axes](@ref) lists the other plots a `PolarAxis`
supports.
