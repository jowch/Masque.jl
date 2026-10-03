# Concepts

Masque adds tooltips and selection to a Makie figure you have already
made: hovering a mark shows its data, and clicking a mark, or dragging a
box or a threshold line, sends a value to your notebook through `@bind`.

## One figure, one widget

`masque(fig)` returns a widget: your figure with an interactive layer on
top. A figure with several axes still needs only one `masque` call.

```julia
@bind pick masque(fig)
```

On its own, `masque(fig)` makes every plot it recognizes interactive,
along with every legend and colorbar. [Recipes masque(fig) extracts](@ref)
lists the plots it knows. To attach your own data to a plot, or to add
something Makie did not draw, such as a draggable threshold, pass your
own interactables after `fig`, and the other plots stay interactive. To
make only the marks you pass interactive, add `auto = false`.

## Interactables and payloads

An *interactable* tells Masque which marks respond to the pointer.
[`PointInteractable`](@ref) covers the points of a scatter,
[`RectInteractable`](@ref) covers bars, [`GridInteractable`](@ref) covers
heatmap cells, and
[`ROIInteractable`](@ref) adds a box you drag. [Constructors](@ref)
lists them all.

A *payload* is the data that belongs to one mark. To attach your data,
pass `payloads` with one entry per mark, in the order you plotted them,
as a vector of named tuples or a `DataFrame` with one row per mark:

```julia
cities = interactables(s; payloads = rows)   # rows[i] belongs to point i
```

The tooltip shows the payload, and a click returns it to Julia as
`pick.city`, `pick.pop`, and so on. Without `payloads`, each mark gets
an `index` and its coordinates, such as `x` and `y` for a scatter point.

## Tooltips are templates

A tooltip shows the payload of the mark under the pointer, by default as
a small table of the payload's fields. A `masque"..."` template
chooses which fields it shows and how they are formatted. A template can
use only payload fields, so to show a value you compute, add it to the
payload in Julia. See [Tooltips](@ref).

## How interactions work

Clicking a mark updates the `@bind` variable, and cells that use the
variable respond to the change. Hovering shows a tooltip and highlights
the mark without changing the variable.

| Gesture | On the figure | The `@bind` value | Cells that use it |
|---|---|---|---|
| Hover a mark | Tooltip and highlight | Unchanged | No change |
| Click a mark (or Enter / Space on a focused mark) | Mark stays highlighted | The clicked mark's event | Respond |
| Click the selected mark again (or Enter / Space on it) | Highlight clears | `nothing` | Respond |
| Drag an ROI box or threshold line | Box or line moves | Unchanged while dragging | No change |
| Release the ROI or threshold | Enclosed marks highlight (with `selects`) | The box, the enclosed marks, or the line's value | Respond |
| Pan or orbit ([`ViewInteractable`](@ref)) | The view moves | Never changes | No change |

## What the `@bind` value holds

A `masque` widget's `@bind` value starts as `nothing`, and after a click
or release it is an *event*, a small struct whose fields you read
directly. A clicked mark's event has the payload's fields, such as
`pick.city`, along with `pick.layer`, the interactable you clicked, and
`pick.index`, the mark's position in your data. The event indexes your
data too: `xs[pick]` is that mark's value and `df[pick, :]` is its row.
Clicking the selected mark again sets the value back to `nothing`.

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

A widget with several interactables holds the most recent event, so to
tell them apart, check `pick.layer` or the event's type. Clicking another
mark replaces the event, clicking the selected mark again clears it to
`nothing`, and clicking empty space keeps it. To start
with marks selected, see [Selection](@ref).

## Static exports and this site

A static HTML export of your notebook keeps tooltips and highlights, and
you can still select marks and drag boxes. Cells that use the `@bind`
value keep the values they had when you exported, because no Julia is
running to update them, and panning does nothing. PlutoSliderServer
cannot precompute a `masque` widget's values either, because it does
not know which values the widget can take.

The interactive examples on this site replay results recorded from real
notebooks, and the **Simulating `@bind`** badge marks them. Hovering
works as it does in Pluto, and a click shows the result recorded for it.
A few interactions, such as a large brush or a pan, are shown as video
clips instead. A click on an axis or a colorbar position is not
recorded, so to see what those clicks return, run the example in your
own notebook.

Next: [Tooltips](@ref) to change what a tooltip says, or
[Selection](@ref) for what a click selects and how to keep it.
