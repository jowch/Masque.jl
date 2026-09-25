# Concepts

Masque does three things to a Makie figure you have already drawn: it
decides which marks respond to the pointer, it shows information about a
mark without re-running Julia, and it hands a deliberate choice — a click,
a brushed region, a dragged threshold — back to your notebook through
`@bind`. This page explains how those pieces fit together, so the guides
read as variations on one idea rather than a list of features.

## One figure, one overlay

`masque(fig, interactables)` renders the figure once, works out where
every interactive mark sits on the image, and returns a widget: the image
with a thin browser overlay on top. The overlay does the hit-testing,
draws highlights and tooltips, and moves drag handles. A figure with
several axes still gets one `masque` call and one overlay; every axis
shares it.

```julia
@bind pick masque(fig)
```

Called with only the figure, `masque` walks every axis, legend, and
colorbar and makes whatever it recognizes interactive (the [Recipes
masque(fig) extracts](@ref) list says which plots). Pass interactables
yourself when you want to choose the marks, attach your own data, or add
something Makie never drew, such as a draggable threshold.

## Interactables and payloads

An *interactable* says what the pointer can hit and what each hit means.
[`PointInteractable`](@ref) makes the points of a scatter hittable,
[`RectInteractable`](@ref) bars or heatmap cells, [`ROIInteractable`](@ref)
a box you drag, and so on; [Constructors](@ref) lists them all.

Each hittable mark carries a *payload*: the data that belongs to it.
Give `payloads` one entry per mark, in the order the marks were drawn — a
vector of named tuples or a `DataFrame` with one row per mark:

```julia
cities = PointInteractable(ax, s; payloads = rows)   # rows[i] belongs to point i
```

The payload is what makes an overlay about *your* data rather than about
coordinates. The tooltip shows it, and a click hands it back to Julia
(`pick.city`, `pick.pop`). If you omit `payloads`, each mark gets a
1-based `index` plus the coordinates its constructor knows (for a scatter,
`x` and `y`).

## Tooltips are templates, not functions

A tooltip is built in the browser from the payload of the mark under the
pointer. By default it is a small table of the payload's fields. A
`masque"..."` template lays the same fields out as you like:

```julia
PointInteractable(ax, s; payloads = rows, tooltip = masque"$(city) — pop $(pop:,)")
```

`$(city)` is a payload field, not a Julia variable, and `$(pop:,)` formats
a number with a [d3-format](https://d3js.org/d3-format) spec. There is no
`tooltip = row -> ...` callback: the tooltip has to work without a running
Julia process (in a static export, for example), so anything computed goes
into the payload first. `tooltip = false` turns the card off. See
[Tooltips](@ref).

## What each gesture does

Holding the pointer over a mark and clicking it are different on purpose.
Hover is for *looking*: it never leaves the browser, so it is instant and
never re-runs a cell. A click is a *decision*: it becomes the value of the
`@bind` variable, and every cell that reads that variable re-runs.

| Gesture | On the figure | The `@bind` value | Cells that read it |
|---|---|---|---|
| Hover a mark | Tooltip and highlight | Unchanged | Do not re-run |
| Click a mark (or Enter / Space on a focused mark) | Mark stays highlighted | The clicked mark's event | Re-run |
| Click empty space | Nothing | Unchanged | Do not re-run |
| Drag an ROI box or threshold line | Box or line moves | Unchanged while dragging | Do not re-run |
| Release the ROI or threshold | Enclosed marks highlight (with `selects`) | The box, the enclosed marks, or the line's value | Re-run |
| Pan or orbit ([`ViewInteractable`](@ref)) | The view moves | Never changes | Do not re-run |

Pan and orbit are about looking too: a camera position is not a result,
so it never becomes the `@bind` value. With a live kernel Masque re-renders
frames while you drag (see [Pan and orbit](@ref)).

A click in empty space leaves the current selection alone. Clicking a
different mark replaces it; to start with marks already selected, or to
keep a selection when the figure is rebuilt, see [Selection](@ref).

## What the `@bind` value holds

Before the first click or release, the bound variable is `nothing`
(unless you passed `selected=`). After that it is an *event*: a small
struct whose fields you read directly. For a clicked mark, the payload's
fields are on the event (`pick.city`), next to `pick.layer` (which
interactable was hit) and a 1-based `pick.index`. An event also indexes
the data it came from: `xs[pick]` and `df[pick, :]` pick out that mark's
row.

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

One widget can hold several interactables, so the value is whichever
event came last; check `pick.layer` or the event's type when a cell has
to tell them apart. One exception: the layer an ROI's `selects` names
belongs to the box. Its points or cells still show their tooltips, but
they take no clicks: a click on one passes through to whatever clickable
layer is underneath. Usually nothing is, and the value stays what the
box holds (a `Vector{ElementEvent}` or a `GridWindowEvent`). An
[`AxisInteractable`](@ref) catches clicks anywhere on its axis, so in a
widget that has one, that click becomes an `AxisEvent`. Clicks on any
other layer in the widget still arrive as a single event.

## Live notebook, static export, and this site

In a running notebook everything above works. In a static HTML export of
the notebook there is no Julia process: tooltips, highlights, and drag
handles still work, but nothing reaches `@bind`, so downstream cells keep
the values they were exported with.

The interactive examples on this site are recordings of real notebooks.
Hovering works as it does in Pluto; clicks swap in results that were
computed ahead of time for a listed set of choices (the **Simulating
`@bind`** badge marks these). A box you drag shows the recorded box it
overlaps most, and the badge then reads **Nearest recorded brush**. Each example also has a *Notebook as text*
section with the same cells, which you can copy into your own notebook.
