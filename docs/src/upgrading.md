# Upgrading

Each section lists what changed between two minor versions in a way your
notebook can notice, and what to write instead. Patch releases never
break a call. The
[changelog](https://github.com/jowch/Masque.jl/blob/main/CHANGELOG.md)
has every change.

## From 0.4 to 0.5

In Masque 0.5, a plot with a [`ViewInteractable`](@ref) no longer takes
the page's scroll. Scrolling over the plot scrolls the page instead of
zooming. To zoom, hold Ctrl (Cmd on a Mac) while scrolling; in Chrome
and Firefox a trackpad pinch zooms too. To zoom on a plain scroll as 0.4
did, pass `wheel = :always`:

| 0.4 | 0.5 |
|---|---|
| `ViewInteractable(ax)`: scroll zooms | `ViewInteractable(ax)`: Ctrl+scroll zooms, scroll moves the page; `ViewInteractable(ax; wheel = :always)`: scroll zooms |
| scroll zoom turned off in Makie, the wheel zooms anyway | the wheel does not zoom; pass `wheel = :modifier` or `:always` to zoom |

Scroll zoom counts as turned off in Makie after
`deregister_interaction!(ax, :scrollzoom)` or
`deactivate_interaction!(ax, :scrollzoom)`, or with both `xzoomlock`
and `yzoomlock` set. See [Pan and zoom a 2D axis](@ref).

## From 0.3 to 0.4

Masque 0.4 changes two things a 0.3 notebook can notice, besides
removing the `tooltip_*` keywords (see
[From 0.2 to 0.3: tooltip keywords](@ref)):

- On a plot built with `select = :many`, a plain click adds the mark to
  the selection, or takes it out when it is already selected, where it
  used to replace the selection. A box drawn by dragging adds too. A
  click on an empty part of the plot keeps the selection, where it used
  to clear it; to start over, press Escape. See
  [Select several marks](@ref).
- A `Slider`, `Toggle`, `Checkbox`, `IntervalSlider` or `Menu` laid out
  in the figure but left out of the `masque` call raises an
  `ArgumentError`, where 0.3.1 warned. Name it, as in
  `masque(fig, (freq = sl,))`, or take it out of the figure. See
  [Name every control](@ref).

## From 0.2 to 0.3: the `@bind` value

In Masque 0.3, the `@bind` value is a named tuple with one field for
each plot that takes clicks and each threshold or box, named after it,
so every notebook that reads it changes:

| 0.2 | 0.3 |
|---|---|
| `@bind sel masque(fig)`, then `sel.index` | `sel.scatter.index`, or `@bind sel masque(fig; bind = s)` to keep `sel.index` |
| `@bind level masque(fig, thr)`, then `level.value` | `level.threshold.value`, or `bind = thr` to keep `level.value` |
| `@bind picks masque(fig, pts, roi)`, the points inside | `picks.scatter` for the points and `picks.roi` for the box, or `bind = s` for the points alone |
| a click on a line gives its event | a line only shows its tooltip until you name it in `bind` |
| `selected = [1, 3]` highlights two marks | one index per plot: `selected = (scatter = 1,)` |
| one threshold, box, or colorbar per widget | as many as you like, each in its own field |

Clicking one plot no longer clears another plot's selection, and a box
with `selects` starts with the marks inside its `bounds`. See
[What the `@bind` value holds](@ref).

## From 0.2 to 0.3: tooltip keywords

Masque 0.3 groups the tooltip style keywords into one `tooltipstyle`
keyword, the way `overlaystyle` groups the overlay's. The old keywords
showed a warning in 0.3 and were removed in 0.4; passing one now raises
an error that names the replacement:

| 0.2 | 0.3 |
|---|---|
| `masque(fig; tooltip_bg = :black, tooltip_color = :white)` | `masque(fig; tooltipstyle = (; bg = :black, color = :white))` |
| `tooltip_accent`, `tooltip_font`, `tooltip_font_size`, `tooltip_radius`, `tooltip_caret` | the `tooltipstyle` keys `accent`, `font`, `font_size`, `radius`, `caret` |

`tooltip_sigdigits` stays a keyword of its own. See [Tooltip styling](@ref).

## From 0.1 to 0.2

Masque 0.2 renamed or reshaped a few calls. 0.2 still ran the old forms
with a warning; 0.3 removed them, so each one now fails with a
`MethodError` ("no method matching …"), or an `UndefVarError` for
`auto_interactables`. Use the new form instead:

| Removed in 0.3 | Use instead |
|---|---|
| `auto_interactables(fig)` | `interactables(fig)` |
| `RectInteractable(ax; grid = (xedges, yedges, values))` | `GridInteractable(ax, xedges, yedges, values)` |
| `RectInteractable(ax, hm)` for a heatmap or image | `GridInteractable(ax, hm)` |
| `RectInteractable(ax; rects = rects)` | `RectInteractable(ax, rects)` |
| `RegionInteractable(ax; regions = regions, payloads)` | `RegionInteractable(ax, regions; payloads)` |
| `masque(fig; backend = CairoBackend(; max_width))` | `masque(fig; backend = :cairo, max_width)` |
| `masque(fig; backend = WebGLBackend(; px_per_unit, max_width))` | `masque(fig; backend = :webgl, px_per_unit, max_width)` |

Four changes have no old form to fall back on:

- `masque(fig, xs...)` now keeps the plots' own hover and click and
  adds `xs` to them. Add `auto = false` to overlay only what you pass,
  as in 0.1.
- On a categorical or date axis, a mark's default `x` and `y` are now
  the label or date as text, not a number.
- A heatmap or image layer is a `GridInteractable`, so code that checks
  `isa RectInteractable` for one needs the new type.
- If you wrote your own backend, its `_ppu`, `context`, and
  `make_widget` methods take `max_width` as a new last argument.

Next: [Troubleshooting](@ref) for errors and their fixes.
