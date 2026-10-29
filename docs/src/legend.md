# Legend

Hover a legend entry to highlight the series it labels, and click it to
send that series to your notebook. `masque(fig)` makes every `Legend`
and `axislegend` interactive and links each entry to the plots it
describes.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-legend-lines" data-masque-embed="legend_lines" data-masque-segment="widget" title="Two lines with a legend. Click an entry and the readout names that series." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("legend_lines"; segment = "widget")
```

## What a click returns

Clicking an entry keeps its series picked out and sets the legend's
field, `sel.legend`, to a [`LegendEvent`](@ref). The example above
passes `bind = :legend`, so the value, `pick`, is the event itself.

`pick.label` is the entry's text, `pick.group` is the group title in a
grouped legend (`nothing` otherwise), and `pick.targets` lists the
names of the plots the entry highlights, such as `["lines_2"]`. Click the entry again to
clear the highlight, and `pick` is `nothing` again.

A figure with a second legend gives `sel.legend_2` in the same way, and
plots that take clicks keep their own fields.

## Fade the other series

To fade the series you did not click, create a second figure in a cell
that uses `pick`. In the same notebook as above:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-legend-fade" data-masque-embed="legend_lines" data-masque-segment="fade" title="A second figure that fades the line whose legend entry you did not click." style="width:100%;height:600px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("legend_lines"; segment = "fade")
```

You can use `pick.label` the same way to filter a table, choose which
series to fit, or update any other cell.

## Highlight a series on every panel

A legend entry picks out its series on every axis where the series
appears, not only the axis the legend sits on. Hover an entry below and
both panels highlight its points:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-lv-legend-wash" data-masque-embed="linked_legend_wash" title="Two scatter panels with a legend. Hover an entry to highlight its series on both." style="width:100%;height:720px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("linked_legend_wash")
```

## Choose which plots an entry highlights

Each entry highlights the plots Makie made it for: the line for a
`lines!` entry, the points and the line for `scatterlines!` and
`stem!`, and one series of a `series!` plot. To have an entry highlight
other plots as well, such as a scatter of the same data on another
axis, pass `targets=` to [`LegendInteractable`](@ref), with each label
mapped to the names of the plots it should highlight.
[What `masque(fig)` builds](@ref) lists those names:

```julia
LegendInteractable(leg; targets = Dict("a" => :lines, "b" => [:lines_2, :scatter]))
```

A label or plot name that does not exist raises an `ArgumentError`, so
a typo shows up right away. A legend you build yourself from
`LineElement`s has no plots linked to its entries, so they highlight
nothing until you pass `targets=`, or give each element Makie's own
`plots=` keyword.

## Add a tooltip to each entry

Legend entries show no tooltip by default, because the label is already
on screen and a tooltip would cover the neighboring entries. To add
one, pass a template that uses the fields `label`, `group`, and
`targets`:

```julia
LegendInteractable(leg; tooltip = masque"$(label) ($(group))")
```

See [Tooltips](@ref) for how templates work.

## Keep a series highlighted after a rebuild

A legend click is lost when the cell that creates the figure runs
again, because the new figure starts with no entry selected. To start it
with an entry selected, pass the entry's position in the legend, counting
from the top, as `selected`:

```julia
@bind pick masque(fig; bind = :legend, selected = (legend = 2,))
```

The second entry's series starts highlighted, and `pick` starts as its
[`LegendEvent`](@ref). See [Selection](@ref) for more on `selected`.

Next, [Keyboard and screen readers](@ref) shows how to reach legend
entries with the keyboard.
