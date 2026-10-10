# Keyboard and screen readers

Press Tab to focus a plot, then use the arrow keys to move between its
marks and Enter or Space to select one. A screen reader announces each
mark as you move to it. A `masque` widget needs no extra setup for this.

## Keys

| Key | What it does |
|---|---|
| → / ↓ | Next mark |
| ← / ↑ | Previous mark |
| Home / End | First / last mark |
| Page Down / Page Up | First mark of the next / previous layer |
| Enter / Space | Select the focused mark: its plot's field in the `@bind` value becomes what a click on it gives |
| Cmd + Enter (Mac) / Ctrl + Enter | Add the focused mark to the selection, or take it out, on a plot with `select = :many` |
| Escape | Clear every selection, then the focus, and leave the plot |

Arrow keys and Home / End stop at the first and last mark rather than
wrapping around.

Tab focuses the plot rather than a mark, and Home, or the first arrow
key in either direction, then moves to the first mark. If the figure
has a legend, its entries come first, and Page Down steps from the
legend into the plot. Focusing a legend entry highlights the series it labels, as
hovering over it does. See [Legend](@ref).

On each axis, the keys visit the plot created last first, then the
earlier ones.

The focused mark gets the same highlight and tooltip as a hovered one.
A legend entry shows no tooltip, on hover or on focus, unless you pass a
template.

While the plot has focus and no mark is highlighted, as on a heatmap,
a grey outline shows just inside it. Clicking a plot focuses it without
drawing the outline.

The keyboard reaches points, bars and other rectangles, polygons, line
segments, and lines. That includes [`TextInteractable`](@ref) labels and
the circles, rectangles, and polygons of a
[`RegionInteractable`](@ref). For what it does not reach, see
[Limitations](@ref accessibility-limitations).

## Threshold lines, ROI boxes, and panning

Each threshold line, ROI box, and pan or orbit view is its own Tab stop
after the plot, so the arrow keys on the plot keep moving between marks.
Press Tab from the plot to reach the first one. The value shows as you
press a key, and the `@bind` value changes once, when you let go, so
cells that use it update when you release the key, not at every step.

| Stop | Key | What it does |
|---|---|---|
| Threshold line | ↑ / ↓, or ← / → on a vertical line | Move the line by one screen pixel |
| | Page Up / Page Down | Move it by ten |
| | Home / End | Move it to the lowest / highest value |
| ROI box | Arrow keys | Move the box by one screen pixel |
| | Page Up / Page Down | Move it up or down by ten |
| | Alt + arrow key | Grow the box on that side |
| | Alt + Shift + arrow key | Shrink the box on that side |
| Pan view | Arrow keys | Pan by a tenth of the axis |
| | + / − | Zoom in / out around the middle of the axis |
| Orbit view | Arrow keys | Rotate the camera |
| | Shift + arrow key | Pan by a tenth of the axis |
| | + / − | Zoom in / out around the middle of the axis |
| Any | Escape | Leave the stop |

On a categorical axis, a threshold line moves one category at a time.
Panning, zooming, and rotating never change the `@bind` value, as with the
pointer.

## What gets announced

When you move to a mark, a screen reader announces the layer's name,
the mark's position in its layer, and the text its tooltip shows. A
plot's layer takes its name from the plot's own `label`, the one its
legend entry shows:

```julia
scatter!(ax, [1.0, 2.0, 3.0], [4.0, 1.0, 3.0]; label = "wild type")
```

Moving to the first point might announce "wild type, element 1 of 3: x
1.0, y 4.0". A plot with no `label` gets no name, and the announcement
starts at the position: "element 1 of 3: x 1.0, y 4.0". A label written
in LaTeX or rich text names nothing either, since a screen reader would
read out its markup; give that layer a plain-text name as shown below.

To name a layer something else, or to name one whose plot has no
`label`, pass the plot to [`interactables`](@ref) with a `label`, here
for a scatter `s` and a barplot `b`:

```julia
masque(
    fig,
    interactables(s; label = "City"),
    interactables(b; label = "Revenue by quarter"),
)
```

`label = nothing` leaves the name out. The constructors that take
positions accept `label` too: [`PointInteractable`](@ref),
[`SegmentInteractable`](@ref), [`RectInteractable`](@ref), and
[`PolygonInteractable`](@ref).

The `label` field that `series!` puts in each line's payload is
different: it names that one line, and shows in its tooltip.

## [Limitations](@id accessibility-limitations)

The keyboard does not reach heatmap or image cells, so to inspect
them, use the pointer or a touch drag.

Screen-reader announcements do not work the same in every browser and
screen reader. If yours stays silent, the highlight and tooltip still
work; please file an issue with your browser and screen-reader
versions.

For the rest of what a click or Enter sends to your notebook, see
[Concepts](@ref).
