# Selection

Clicking a mark selects it. The mark stays highlighted, and its plot's
field in the `@bind` value holds it until another click on that plot
replaces it. Click the mark again to clear the selection. You can also start
with a mark selected, or keep a selection when the figure is rebuilt.

The examples on this page use a scatter of cities, with each city's
name in its payload's `city` field:

```julia
cities = interactables(s; id = :cities, payloads = rows)
@bind sel masque(fig, cities)
```

The `id` names the field, so the selected city is `sel.cities`.

## What replaces a selection

`sel.cities` starts as `nothing`, and clicking a city makes it that
city's [`ElementEvent`](@ref). Clicking another city replaces it,
because a plot holds one selection. Clicking the selected city again,
clicking empty space inside the axis, or pressing Escape clears it: the
highlight goes and `sel.cities` is `nothing` again.

Each plot keeps its own selection, so in a figure with two scatters,
clicking a point in one leaves the other's field as it was. A click on
empty space clears only the plots in the axis you clicked, and Escape
clears every plot in the figure. A click on a line or another mark that
only shows a tooltip is not empty space, so it keeps the selection.

## Select several marks

A click selects one mark of a plot and replaces that plot's previous
selection. To let a reader hold several, pass the plot's interactable
with `select = :many`:

```julia
cities = interactables(s; id = :cities, payloads = rows, select = :many)
@bind sel masque(fig, cities)
```

`sel.cities` is then a `Vector{ElementEvent}`, empty to start. A click
still replaces the selection with the one city, and a Cmd-click (on a
Mac) or Ctrl-click (elsewhere) adds a city or takes it out again, so
`[c.city for c in sel.cities]` lists the cities picked, in the order
they were picked. A legend entry and an
[`AxisInteractable`](@ref) take `select = :many` the same way and give a
vector of their events; a colorbar's pick is one value, so it raises an
`ArgumentError`.

To select every mark in an area, drag across it: a box follows the
pointer, and when you let go the marks whose centre is inside it become
the selection. Cmd-drag or Ctrl-drag adds them to the selection
instead, and one that starts on a selected mark takes the marks it
covers out. On a plot you can pan or orbit, a plain drag still moves
the view, so hold Alt (Option on a Mac) to draw the box; Alt-drag works
on every plot. Clicking a legend entry selects every mark of its plot,
and Cmd-click or Ctrl-click on the entry adds them or takes them out.

To keep a box on the plot that the reader can move and resize, use an
[`ROIInteractable`](@ref) with `selects`, as [Brush a region](@ref)
shows.

## Start with a mark selected

To start with a mark selected, pass its position in the data you
plotted as `selected=`. These are the same numbers `pick.index` gives,
so `selected = 1` is the first city:

```julia
@bind sel masque(fig, cities; selected = 1)
```

The first city starts highlighted and `sel.cities` starts as its event, so
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

When the widget has more than one plot you could select, name the
field: `selected = (cities = 1,)`, or `selected = (cities = 1, scatter_2 = 3)`
for one mark in each of two plots. In that case a bare number raises an
`ArgumentError`, and so does a position outside your data.

A plot holds one selected mark, so `selected = [1, 3]` raises an
`ArgumentError`. To start with several marks selected, pass the plot
with `select = :many`, and `selected = (cities = [1, 3],)` starts with
both. The target of a box with `selects` also takes a list, which
replaces what the box starts with.

Points, bars, polygons, segments, and lines you name in `bind` can
start selected, but heatmap cells, axis readouts, boxes, thresholds, and
the view cannot. A
box or a threshold line starts where its `bounds` or `value` puts it,
so to start one somewhere else, set those instead; see
[Read the box itself](@ref) and [Drag a threshold](@ref).

A [`RegionInteractable`](@ref) with several kinds of shape makes one
part per kind, so name the part in `selected=`, as in
`selected = (cells = (circles = [1],),)` for the id `:cells`. See [Custom hits](@ref).

## Keep a selection when the figure rebuilds

When the figure is rebuilt, for example because a slider changed the
data, the widget starts over with nothing selected. A position in the
old data can point at a different city in the new data, so Masque does
not carry it over.

To keep a selection, keep what identifies the mark, such as the city's
name, and look up its position after the rebuild. First, store the
name in a cell that does not use `sel`:

```julia
last_city = Ref("Delhi")
```

Update it from `sel.cities` in another cell:

```julia
if !isnothing(sel.cities)
    last_city[] = sel.cities.city
end
```

Then look up the city in the rebuilt data and pass its position as
`selected=`. Here `city_names` lists the cities in the order you plotted
them:

```julia
start = findfirst(name -> name == last_city[], city_names)
```

```julia
@bind sel masque(fig, cities; selected = start)
```

If the city is no longer in the data, `findfirst` returns `nothing` and
no city starts selected.

Passing the widget its own value, `selected = sel.cities`, does not work:
Pluto refuses the cell with a **Cyclic references** error. Between
rebuilds you do not need it, because the widget keeps its highlight.

To select a mark from another widget's click, see [Linked views](@ref).
