# Legend

Hover a legend entry to highlight the lines or points it labels, and
click it to send that series to your notebook. `masque(fig)` makes every
`Legend` and `axislegend` interactive and links each entry to the plots
it describes.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-legend-lines" data-masque-embed="legend_lines" title="Two lines with a legend. Click an entry and the readout names that series." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("legend_lines")
```

## What a click returns

Clicking an entry keeps its series highlighted and sets the legend's
field, `sel.legend`, to a [`LegendEvent`](@ref). The examples on this
page pass `bind = :legend`, so the value, `pick`, is the event itself:

```julia
@bind pick masque(fig; bind = :legend)
```

`pick.label` is the entry's text, `pick.group` is the group title in a
grouped legend (`nothing` otherwise), and `pick.targets` lists the
layers the entry highlights. Click the entry again to clear the
highlight, and `pick` is `nothing` again:

```julia
isnothing(pick) ? "click a legend entry" : "series $(pick.label)"
```

A figure with a second legend gives `sel.legend_2` in the same way, and
plots that take clicks keep their own fields.

## Fade the other series

To fade the series you did not click, create a second figure in a cell
that uses `pick`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-legend-fade" data-masque-embed="legend_fade" title="Two lines with a legend. Click an entry and a second figure fades the other line." style="width:100%;height:1500px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("legend_fade")
```

You can use `pick.label` the same way to filter a table, choose which
series to fit, or update any other cell.

## Which marks an entry highlights

Each entry is linked to the plots Makie made it for: the line for a
`lines!` entry, both the points and the line for `scatterlines!` and
`stem!`, and one series of a `series!` plot. To change that, pass
`targets=` to [`LegendInteractable`](@ref). For example, this makes
entry `"b"` highlight a scatter as well as its line:

```julia
LegendInteractable(leg; targets = Dict("a" => :lines, "b" => [:lines_2, :scatter]))
```

A target is a layer id, which highlights every mark in that layer, or
`id:k`, which highlights only element `k` of it. `targets` can also be a
vector with one entry per legend row, top to bottom. A label or layer
that does not exist raises an `ArgumentError`, so you see a typo right
away.

A legend you build yourself from `LineElement`s has no plots linked to
its entries, so an entry can still be clicked but highlights nothing.
To link them, give the elements Makie's own `plots=` keyword, or pass
`targets=`.

## A tooltip for each entry

Legend entries show no tooltip by default, because the label is already
on screen and a tooltip would cover the neighboring entries. To add
one, pass a template that uses the fields `label`, `group`, and
`targets`:

```julia
LegendInteractable(leg; tooltip = masque"$(label) ($(group))")
```

See [Tooltips](@ref) for how templates work.

## Keep a series highlighted after a rebuild

Clicking an entry keeps its series highlighted, but the highlight is
gone when the figure is created again. To keep it, select the series'
own plot. A line takes a selection only once it takes clicks, so pass
it as `interactables(l1)`, where `l1` is what `lines!` returned:

```julia
@bind sel masque(fig, interactables(l1); selected = (lines = 1,))
```

See [Selection](@ref).

A legend can also highlight series on other axes of the same figure;
[Linked views](@ref) shows this across two panels. You can also reach
legend entries with the keyboard; see
[Keyboard and screen readers](@ref).
