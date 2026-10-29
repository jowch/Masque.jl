# Use selections in other cells

Cells that use the `@bind` variable respond to each click, so a cell can
take the selected rows of your data, plot them, or fit a model to them.
Each event also works as an index into the data you plotted, as
[What the `@bind` value holds](@ref) introduces.

## Index your data with a selection

A selected point's event indexes the vectors you plotted it from, and,
once DataFrames is loaded, a `DataFrame` with one row per point:

```julia
pick = sel.scatter
isnothing(pick) ? "click a point" : ys[pick]
```

`ys[pick]` is the `y` of the clicked point, and `df[pick, :]` is its row,
because `pick.index` is the point's position in the data you plotted.
With `select = :many` or a box, the field holds a vector of events, and it
indexes the same way:

| The field holds | Index your data with | Gives |
|---|---|---|
| One [`ElementEvent`](@ref) | `xs[pick]`, `df[pick, :]`, `df[pick, :name]` | that point's value or row |
| A `Vector{ElementEvent}` | `xs[picks]`, `df[picks, :]` | the selected points |
| A [`linked`](@ref) group's row | `df[row, :]` | that row; with `key`, the value is the key instead |
| A heatmap or image event | `A[pick]`, `A[sel]`, `A[win]` | see [Heatmaps and images](@ref) |

A [`LegendEvent`](@ref) or a [`BoundsEvent`](@ref) does not point at one
row, so indexing a vector with it raises an `ArgumentError`. Use its fields
instead, such as `pick.label` to choose a series, or `box.xmin` to filter
by position.

## Show something before the first click

A field holds `nothing` until the reader clicks, and a vector field
starts empty. Check for that before you index, so the cell shows a
message or an empty table until the reader selects something:

```julia
isempty(picks) ? df[1:0, :] : df[picks, :]
```

`df[1:0, :]` is a table with the same columns and no rows.

## Update another plot from a click

Give each payload a key that identifies its row, such as an id or a
name, and use the key in other cells. Here, clicking a city on a map
plots that city's series:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-lv-city" data-masque-embed="linked_city" data-masque-segment="widget" title="A map of three cities. Click a city to plot its series in the next cell." style="width:100%;height:760px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("linked_city"; segment = "widget")
```

`bind = s` ([Choose the fields with `bind`](@ref)) makes `pick` the
clicked city itself, or `nothing` before
the first click.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-lv-city-detail" data-masque-embed="linked_city" data-masque-segment="detail" title="The detail cell: the clicked city's series." style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("linked_city"; segment = "detail")
```

The detail cell uses `pick`, so it responds to each click but not to
hovering. The same `pick.id` could filter a `DataFrame` or choose the
data for a fit. The detail figure can be a Masque widget too.

To mark the clicked point in another plot of the same rows, put both
plots in one figure and link them, as [Linked views](@ref) shows.

## Filter a table with a box

Drag a box over points to select every point inside it. When you release
an [`ROIInteractable`](@ref) with `selects`, the field of the plot it
selects from holds the points inside, so `df[picks, :]` is the rows
inside the box. [Select the points inside a box](@ref) sets up the box.

## Where to go next

[Build a widget](@ref) puts several selections and controls in one
value, and [Linked views](@ref) selects the same rows on several panels.
