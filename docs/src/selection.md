# Selection

Clicking a mark selects it. The mark stays highlighted, and the `@bind`
variable holds it until another click replaces it. You can also start
with a mark selected, or keep a selection when the figure is rebuilt.

The examples on this page use a scatter of cities with a name for each
point:

```julia
cities = PointInteractable(ax, s; id = :cities, payloads = rows)
@bind pick masque(fig, cities)
```

## What replaces a selection

`pick` starts as `nothing`. Clicking a mark makes `pick` that mark's
[`ElementEvent`](@ref). Clicking another mark replaces it, because one
widget holds one selection. Clicking empty space changes nothing: the
highlight stays and `pick` keeps its value, so a stray click does not
lose your choice. On a focused mark, Enter or Space selects it just as a
click does.

To select several marks at once, drag a box instead. An
[`ROIInteractable`](@ref) with `selects` returns every mark inside it.
See [Brush a region](@ref).

## Start with a mark selected

`selected=` sets the selection the widget starts with. `selected = 1`
is the first city you plotted, the same number `pick.index` would give:

```julia
@bind pick masque(fig, cities; selected = 1)
```

The first city starts highlighted and `pick` starts as its event, so
other cells have something to show before anyone clicks. Click another
city to replace it:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-selection-start" data-masque-embed="selection_start" title="Four cities with Tokyo selected. Click another and the readout names it." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("selection_start")
```

Some cases need more care:

- `selected = [1, 3]` highlights both marks, but `pick` stays `nothing`,
  because a click value holds one mark. The next click replaces the
  highlight. With a `selects` box in the widget the value is a vector,
  and `selected = [1, 3]` starts as those two events.
- When the widget has more than one layer you could select, name the
  layer: `selected = (; cities = 1)` or `selected = Dict(:cities => [1, 3])`.
  A bare number is ambiguous there and raises an `ArgumentError`. So
  does an index outside `1:n`.
- Points, bars, polygons, lines, and segments can start selected.
  Heatmap cells, axis readouts, boxes, thresholds, and the view cannot.
  Passing `selected=` for them raises an `ArgumentError`.
- For a [`RegionInteractable`](@ref), use the layer ids it creates for
  each shape (`:cells_c`, `:cells_r`, `:cells_p` for a base id
  `:cells`). See [Custom hits](@ref).

## Keep a selection when the figure rebuilds

When the figure is rebuilt, for example because a slider changed the
data, `masque` builds a new widget and the selection starts over. A
selection is a position in the data you plotted. After the data changes,
the same position can point at a different mark, so carrying it over
could highlight the wrong city.

To keep a selection, store the indices you still want in a cell that
does not use `pick`, and pass them in:

```julia
held = [1, 3]   # computed from your data, not from `pick`
```

```julia
@bind pick masque(fig, cities; selected = held)
```

Passing the widget its own value, `selected = pick`, does not work.
Pluto refuses that cell with a **Cyclic references** error, because the
cell would both define `pick` and depend on it. You do not need it: the
widget keeps its highlight between clicks until it is rebuilt.

Another widget can take the value, though. Passing one widget's `pick`
as another widget's `selected=` copies a click from one figure to the
other. [Selection round-trip](@ref) shows this, and
[Linked views](@ref) shows how a click can update other plots and
tables.

## Highlight and value

The highlight shows what `pick` holds, with one exception: clicking a
legend entry highlights every mark of the series it labels, while `pick`
holds only the legend entry. See [Legend](@ref).
