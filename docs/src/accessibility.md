# Keyboard and screen readers

Every overlay is a keyboard-navigable, screen-reader-announced widget.
No extra setup. Tab focuses the surface (`tabindex="0"`). Then use the
keys in the following table to move between interactive elements.

## Keys

| Key | Moves to |
|---|---|
| → / ↓ | Next element |
| ← / ↑ | Previous element |
| Home / End | First / last element |
| Page Down / Page Up | First element of the next / previous layer |
| Enter / Space | Commit the focused element — the same `@bind` value a click would (`commitClick`) |
| Escape | Clear focus and leave the plot |

Arrow keys and Home / End stop at the first and last element. They do
not wrap.

**Tab** focuses the surface. It does not land on an element. **Home**
and the **first arrow** (either direction) land on index 0. If a legend
exists, its entries are first in the manifest, so index 0 is the first
legend entry. Page Down then steps from the legend into the plot
layers. That order matches the pointer: a legend drawn on top of a plot
takes the clicks under it. Focusing an entry highlights the trace it
labels, the same as holding the pointer over it. For more information,
see [Legend](@ref).

Moving focus draws the same overlay highlight as holding the pointer
over the mark (there is never a separate focus look) and shows the same
tooltip, positioned on the focused element.

Reachable kinds: `:circles`, `:rects`, `:polygons`, `:segments`, and
`:polyline`. That includes [`TextInteractable`](@ref) (kind `:rects`)
and Region circle / rect / polygon layers. Not reachable: `:grid`
(heatmap / image cells), threshold, ROI, and view. Hold the pointer or
use a touch drag for those. Keyboard does not arrow through heatmap
cells.

## What gets announced

Screen readers announce each element you land on: an optional layer
name, its position within that layer, and the same content the tooltip
shows, as plain text. For example:

```julia
PointInteractable(
    ax, pts;
    label = "Scatter",
    payloads = [(; x = 1.0, y = 4.0)],
)
```

might announce "Scatter, element 1 of 3: x 1.0, y 4.0". Without
`label`, the announcement omits the prefix: "element 1 of 3: x 1.0, y
4.0".

`label=` is a single string per **layer** — set it once on the
interactable, not per element. It is a screen-reader prefix on explicit
element constructors: [`PointInteractable`](@ref),
[`SegmentInteractable`](@ref), [`RectInteractable`](@ref) (list form),
and [`PolygonInteractable`](@ref). It is not accepted on plot-object
constructors (`PointInteractable(ax, p::Makie.Scatter)` and similar) or
on `masque(fig)` auto-extraction. Build the interactable with the
keyword form to set a label.

Do not confuse `label=` with a payload key `label` (for example
`(; label = "Tokyo")` in a tooltip). That is per-element tooltip data.
`label=` is one string for the whole layer.

```julia
masque(fig, [
    PointInteractable(ax, pts; id = :cities, label = "City"),
    RectInteractable(ax; rects = bars, id = :bars, label = "Revenue by quarter"),
])
```

`label=` on `PointInteractable(ax, p::Makie.Scatter)` is a `MethodError`.

## [Limitations](@id accessibility-limitations)

- **Grid layers** (`:grid` — heatmap / image cells) are not
  keyboard-focusable. They stay mouse- and touch-interactive.
- **Threshold, ROI, and view** have no keyboard equivalent. Drag them
  with the pointer.
- **Screen-reader support for `aria-live` inside a shadow DOM is
  uneven** across browser and assistive-technology combinations. If
  announcements are silent in your setup, the visual focus ring and
  tooltip still work. File an issue with the browser and AT versions.
