# Legend

Hover a legend entry to highlight the lines or points it labels, and
click it to send that series to your notebook. `masque(fig)` makes every
`Legend` and `axislegend` interactive and links each entry to the plots
it describes.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-legend-lines" data-masque-embed="legend_lines" title="two-line axislegend with listed @bind snapshots" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("legend_lines")
```

## What a click returns

Clicking an entry makes `pick` a [`LegendEvent`](@ref). `pick.label` is
the entry's text, and `pick.group` is its group title in a grouped
legend (`nothing` otherwise). `pick.targets` lists the layers the entry
highlights. Clicking the plot itself still gives the plot's own events,
so check which kind you got:

```julia
pick isa LegendEvent ? "series $(pick.label)" : "click a legend entry"
```

## Fade the other series

The highlight cannot hide or dim the other lines in the figure. To fade
the series you did not click, create a second figure in a cell that
uses `pick`:

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
its entries. Give the elements Makie's own `plots=` keyword, or pass
`targets=`. An entry with no targets can still be clicked, but it
highlights nothing.

## A tooltip for each entry

Legend entries show no tooltip by default, because the label is already
on screen and a tooltip would cover the neighboring entries. Pass a
template to add one. Its fields are `label`, `group`, and `targets`:

```julia
LegendInteractable(leg; tooltip = masque"$(label) — $(group)")
```

See [Tooltips](@ref) for how templates work.

## Keep a series highlighted after a rebuild

`selected=` on the legend layer highlights the entry's swatch. To keep
the series itself highlighted when the figure is rebuilt, select the
series' own layer instead, for example `selected = Dict(:lines => [1])`.
See [Selection](@ref).

A legend can also highlight series on other axes of the same figure;
[Linked views](@ref) shows this across two panels. With the keyboard,
focus moves through the legend entries first, and a focused entry
highlights its series as hover does.
