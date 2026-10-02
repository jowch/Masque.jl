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
| Enter / Space | Select the focused mark: the `@bind` value becomes what a click on it gives |
| Escape | Clear focus and leave the plot |

Arrow keys and Home / End stop at the first and last mark rather than
wrapping around.

Tab focuses the plot rather than a mark, and Home, or the first arrow
key in either direction, then moves to the first mark. If the figure
has a legend, its entries come first, and Page Down steps from the
legend into the plot. Focusing a legend entry highlights the series it labels, as
hovering over it does. See [Legend](@ref). On each axis, the plot drawn on top
comes first: the one created last.

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

## What gets announced

When you move to a mark, a screen reader announces an optional layer
name, the mark's position in its layer, and the text its tooltip shows.
For example:

```julia
PointInteractable(
    ax, [(1.0, 4.0), (2.0, 1.0), (3.0, 3.0)];
    label = "Scatter",
    payloads = [(x = 1.0, y = 4.0), (x = 2.0, y = 1.0), (x = 3.0, y = 3.0)],
)
```

Moving to the first point might announce "Scatter, element 1 of 3: x
1.0, y 4.0". Without `label`, the announcement starts at the position:
"element 1 of 3: x 1.0, y 4.0".

`label` names the whole layer, so you set it once per interactable. The
constructors that take positions accept it:
[`PointInteractable`](@ref), [`SegmentInteractable`](@ref),
[`RectInteractable`](@ref), and
[`PolygonInteractable`](@ref).

`masque(fig)` on its own sets no labels. To name the layers it builds
for your plots, pass each plot to [`interactables`](@ref) with a
`label`, here for a scatter `s` and a barplot `b`:

```julia
masque(
    fig,
    interactables(s; label = "City"),
    interactables(b; label = "Revenue by quarter"),
)
```

A payload field called `label`, as in `(city = "Tokyo", label =
"capital")`, is different: it belongs to one mark and shows in that
mark's tooltip.

## [Limitations](@id accessibility-limitations)

The keyboard does not reach heatmap or image cells, so to inspect
them, use the pointer or a touch drag.

A threshold line, an ROI box, and pan and orbit have no keyboard
controls, so drag them with the pointer.

Screen-reader announcements do not work the same in every browser and
screen reader. If yours stays silent, the highlight and tooltip still
work; please file an issue with your browser and screen-reader
versions.

For the rest of what a click or Enter sends to your notebook, see
[Concepts](@ref).
