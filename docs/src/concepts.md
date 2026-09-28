# Concepts

Masque adds tooltips and selection to a Makie figure you have already
made. Hovering a mark shows its data. Clicking a mark, or dragging a box
or a threshold line, sends a value to your notebook through `@bind`.

## One figure, one widget

`masque(fig)` returns a widget: your figure with an interactive layer on
top. A figure with several axes still needs only one `masque` call.

```julia
@bind pick masque(fig)
```

On its own, `masque(fig)` makes every axis, legend, and colorbar it
recognizes interactive. [Recipes masque(fig) extracts](@ref) lists the
plots it knows. Pass interactables yourself to choose the marks, attach
your own data, or add something Makie did not draw, such as a draggable
threshold.

## Interactables and payloads

An *interactable* tells Masque which marks respond to the pointer.
[`PointInteractable`](@ref) covers the points of a scatter,
[`RectInteractable`](@ref) covers bars or heatmap cells, and
[`ROIInteractable`](@ref) adds a box you drag. [Constructors](@ref)
lists them all.

A *payload* is the data that belongs to one mark. Pass `payloads` with
one entry per mark, in the order you plotted them. It can be a vector of
named tuples or a `DataFrame` with one row per mark:

```julia
cities = PointInteractable(ax, s; payloads = rows)   # rows[i] belongs to point i
```

The tooltip shows the payload, and a click returns it to Julia as
`pick.city`, `pick.pop`, and so on. Without `payloads`, each mark gets
an `index` and its coordinates, such as `x` and `y` for a scatter point.

## Tooltips are templates

A tooltip shows the payload of the mark under the pointer. By default
it is a small table of the payload's fields. A `masque"..."` template
lets you customize what it says:

```julia
PointInteractable(ax, s; payloads = rows, tooltip = masque"$(city) — pop $(pop:,)")
```

In this template, `$(city)` and `$(pop)` are fields of the `rows`
payload, and `:,` adds thousands separators to `pop` (a
[d3-format](https://d3js.org/d3-format) spec). A template can use any
field you put in the payload. Without `payloads`, each plot type has its
own default fields, listed in [Plot-object defaults](@ref).

To show a value you compute, add it to the payload in Julia:

```julia
rows = [
    (city = "Lyon", density = round(522_250 / 47.9)),
    (city = "Nice", density = round(342_669 / 71.9)),
]
PointInteractable(ax, s; payloads = rows, tooltip = masque"$(city): $(density:,) per km²")
```

A template can only use payload fields, because tooltips work even when
Julia is not running. For example, they still work in a static HTML
export of the notebook. `tooltip = false` turns tooltips off. See
[Tooltips](@ref).

## How interactions work

Clicking a mark updates the `@bind` variable, and cells that use the
variable respond to the change. Hovering shows a tooltip and highlights
the mark without changing the variable.

| Gesture | On the figure | The `@bind` value | Cells that use it |
|---|---|---|---|
| Hover a mark | Tooltip and highlight | Unchanged | No change |
| Click a mark (or Enter / Space on a focused mark) | Mark stays highlighted | The clicked mark's event | Respond |
| Click empty space | Nothing | Unchanged | No change |
| Drag an ROI box or threshold line | Box or line moves | Unchanged while dragging | No change |
| Release the ROI or threshold | Enclosed marks highlight (with `selects`) | The box, the enclosed marks, or the line's value | Respond |
| Pan or orbit ([`ViewInteractable`](@ref)) | The view moves | Never changes | No change |

Clicking empty space keeps the current selection. Clicking another mark
replaces it. To start with marks selected, or to keep a selection when
you rebuild the figure, see [Selection](@ref).

## What the `@bind` value holds

A `masque` widget's `@bind` value starts as `nothing`. To start with
marks selected, pass `selected=` (see [Selection](@ref)). After a click
or release, the value is an *event*, a small struct whose fields you
read directly. A clicked mark's event has the
payload's fields, such as `pick.city`. It also has `pick.layer`, the
interactable that was hit, and `pick.index`, the mark's position in your
data. The event indexes your data too: `xs[pick]` is that mark's value
and `df[pick, :]` is its row.

| Interaction | `@bind` value | Read it as |
|---|---|---|
| Click a point, bar, polygon, line, or text label | [`ElementEvent`](@ref) | `pick.index`, payload fields; `xs[pick]` |
| Click a legend entry | [`LegendEvent`](@ref) | `pick.label` |
| Release an ROI with `selects` over points | `Vector{ElementEvent}` | one event per enclosed point; `[]` when empty |
| Click a heatmap or image cell | [`GridCellEvent`](@ref) | `pick.i`, `pick.j`, `pick.value`; `A[pick]` |
| Release an ROI with `selects` over a grid | [`GridWindowEvent`](@ref) | `win.i1:win.i2`, `win.j1:win.j2`; `A[win]` |
| Release an ROI without `selects` | [`BoundsEvent`](@ref) | `box.xmin`, `box.xmax`, `box.ymin`, `box.ymax` |
| Click an axis ([`AxisInteractable`](@ref)) | [`AxisEvent`](@ref) | `pick.x`, `pick.y` |
| Click a colorbar | [`ColorbarEvent`](@ref) | `pick.value` |
| Release a threshold line | [`ThresholdEvent`](@ref) | `pick.value` |

A widget with several interactables holds the most recent event. To tell
them apart, check `pick.layer` or the event's type.

One exception: the layer an ROI's `selects` names belongs to the box.
Its marks still show tooltips but do not take clicks. A click on one
goes to whatever clickable layer is underneath. Usually there is none,
and the value stays what the box holds: a `Vector{ElementEvent}` or a
`GridWindowEvent`. An [`AxisInteractable`](@ref) catches clicks anywhere
on its axis, so if the widget has one, that click becomes an
`AxisEvent`.

## Static exports and this site

A static HTML export of your notebook keeps tooltips and highlights, and
you can still select marks and drag. Other cells do not respond, because
the export has no Julia behind it. They keep the values they had when
you exported.

The interactive examples on this site are recordings of real notebooks.
Hovering works as it does in Pluto. A click shows a result computed
ahead of time, and the **Simulating `@bind`** badge marks these
examples. Some examples, including brushes, are kept small so that they
are practical to show on this site; a larger brush is shown as a
recorded clip instead. A click that picks a position, on an axis or a
colorbar, is not recorded, and its page says so.
