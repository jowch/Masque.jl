# Selection

Clicking a mark selects it. The mark stays highlighted, and the `@bind`
variable holds it until another click replaces it. You can also start
with a mark selected, or keep a selection when the figure is rebuilt.

The examples on this page use a scatter of cities, with each city's
name in its payload's `city` field:

```julia
cities = PointInteractable(ax, s; id = :cities, payloads = rows)
@bind pick masque(fig, cities)
```

## What replaces a selection

`pick` starts as `nothing`. Clicking a mark makes `pick` that mark's
[`ElementEvent`](@ref). Clicking another mark replaces it, because one
widget holds one selection. Clicking empty space changes nothing: the
highlight stays and `pick` keeps its value, so a stray click does not
lose your choice.

To select several marks at once, drag a box instead. An
[`ROIInteractable`](@ref) with `selects` returns every mark inside it.
See [Brush a region](@ref).

## Start with a mark selected

`selected=` takes positions in the data you plotted, the same numbers
`pick.index` gives. `selected = 1` is the first city:

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

When the widget has more than one layer you could select, name the
layer: `selected = (; cities = 1)`, or `selected = Dict(:cities => [1, 3])`
for several marks. There a bare number raises an `ArgumentError`, as
does a position outside your data.

A few cases work differently:

- `selected = [1, 3]` highlights both cities, but `pick` stays `nothing`
  until the next click, because a click holds one mark. With a `selects`
  box in the widget, `pick` starts as both events.
- Points, bars, polygons, lines, and segments can start selected.
  Heatmap cells, axis readouts, boxes, thresholds, and the view cannot.
- A [`RegionInteractable`](@ref) makes one layer per shape, named
  `:cells_c`, `:cells_r`, and `:cells_p` for the id `:cells`. See
  [Custom hits](@ref).

## Keep a selection when the figure rebuilds

When the figure is rebuilt, for example because a slider changed the
data, the widget starts over with nothing selected. A position in the
old data can point at a different city in the new data, so Masque does
not carry it over.

To keep a selection, keep what identifies the mark, such as the city's
name, and look up its position after the rebuild. Store the name in a
cell that does not use `pick`:

```julia
last_city = Ref("Delhi")
```

Update it from `pick` in another cell:

```julia
if !isnothing(pick)
    last_city[] = pick.city
end
```

Then look up the city in the rebuilt data and pass its position as
`selected=`. Here `city_names` lists the cities in the order you plotted
them:

```julia
@bind pick masque(fig, cities; selected = findfirst(==(last_city[]), city_names))
```

If the city is no longer in the data, `findfirst` returns `nothing` and
no city starts selected.

Passing the widget its own value, `selected = pick`, does not work:
Pluto refuses the cell with a **Cyclic references** error. Between
rebuilds you do not need it, because the widget keeps its highlight.

To select a mark from another widget's click, see [Linked views](@ref).
