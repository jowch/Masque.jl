# Keyboard and screen readers

A `masque` widget works with the keyboard and a screen reader, with no
extra setup. Press Tab to focus the plot. A grey outline appears just
inside it. Then use the keys below to move between marks. The focused
mark gets the same highlight a hover draws, and the outline goes away
while it shows. A plot with nothing to step through, such as a heatmap,
keeps the outline while it has focus. Clicking a plot focuses it without
drawing the outline.

## Keys

| Key | What it does |
|---|---|
| → / ↓ | Next mark |
| ← / ↑ | Previous mark |
| Home / End | First / last mark |
| Page Down / Page Up | First mark of the next / previous layer |
| Enter / Space | Select the focused mark: the `@bind` value becomes what a click on it gives |
| Escape | Clear focus and leave the plot |

Arrow keys and Home / End stop at the first and last mark. They do not
wrap.

Tab focuses the plot, not a mark. Home, or the first arrow key in
either direction, moves to the first mark. If the figure has a legend,
its entries come first, so that mark is the first legend entry. Page
Down then steps from the legend into the plot. This order matches the
pointer: a legend drawn on top of a plot takes the clicks under it.
Focusing a legend entry highlights the series it labels, as hovering
over it does. See [Legend](@ref).

A screen reader calls the first mark of a layer "element 1", the same
numbering `selected=` uses, so `selected = 0` is out of range.

A focused mark shows its tooltip, as a hovered one does. A legend entry
shows none unless you pass a template.

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
[`RectInteractable`](@ref) with `rects =`, and
[`PolygonInteractable`](@ref).

```julia
masque(fig, [
    PointInteractable(ax, pts; id = :cities, label = "City"),
    RectInteractable(ax; rects = bars, id = :bars, label = "Revenue by quarter"),
])
```

The forms that take a Makie plot, such as `PointInteractable(ax, s)`
for a scatter `s`, do not accept `label`: passing it raises a
`MethodError`. `masque(fig)` on its own sets no labels either. To name a
layer, pass its positions instead.

A payload field called `label`, as in `(city = "Tokyo", label =
"capital")`, is different: it belongs to one mark and shows in that
mark's tooltip.

## [Limitations](@id accessibility-limitations)

- The keyboard does not reach heatmap or image cells. The pointer and
  touch drags still work on them.
- A threshold line, an ROI box, and pan and orbit have no keyboard
  controls. Drag them with the pointer.
- Screen-reader announcements do not work the same in every browser and
  screen reader. If yours stays silent, the highlight and tooltip still
  work. Please file an issue with your browser and screen-reader
  versions.

For the rest of what a click or Enter sends to your notebook, see
[Concepts](@ref).
