# API

Docstrings for every exported name, grouped by area. For worked
examples, start with [Getting started](@ref).

## Entry point

```@docs
Masque
masque
interactables
auto_interactables
InteractionEvent
ElementEvent
LegendEvent
GridCellEvent
GridWindowEvent
AxisEvent
ThresholdEvent
ColorbarEvent
BoundsEvent
bondtype
transform_bond
```

## Interactable constructors

```@docs
PointInteractable
SegmentInteractable
RectInteractable
GridInteractable
SurfaceInteractable
PolygonInteractable
AxisInteractable
ColorbarInteractable
LegendInteractable
TextInteractable
ThresholdInteractable
ROIInteractable
ViewInteractable
SliceInteractable
RegionInteractable
FunctionInteractable
```

## Tooltip macro and type

```@docs
Markup
@masque_str
```

For usage, see [Tooltips](@ref).

## Tooltip styling

Pass `tooltipstyle` to `masque` to change how the tooltip card looks in
that widget. Name only the parts you want to change; the rest keep the
built-in look. A part you set stays the same on light and dark figures:

```julia
masque(fig; tooltipstyle = (; bg = "#1a1a2e", color = :white, radius = 6))
```

An unknown key raises an `ArgumentError` that lists the valid ones.

| Key | Value | Changes |
|---|---|---|
| `bg` | CSS string or Makie color | background |
| `color` | CSS string or Makie color | text color |
| `accent` | CSS string or Makie color | field names in the default table |
| `font` | `String`, a CSS font-family | font |
| `font_size` | number, in px | text size |
| `radius` | number, in px | corner radius |
| `caret` | `Bool` | `false` hides the caret pointing at the mark |

`tooltip_sigdigits`, a separate keyword, sets how many significant
figures a tooltip number shows, from 1 to 17 (default 4). In the
default tooltip, a heatmap cell, and a template field with no format
spec, trailing zeros are dropped; axis, colorbar, and slice readouts
and drag labels keep them, so they don't change width as you move. See
[Tooltips](@ref).

To style tooltips without Julia, set the `--masque-tip-*` CSS custom
properties on any element that contains the cell:

```html
<style>
main { --masque-tip-bg: #1a1a2e; --masque-tip-color: #e0e0e0; }
</style>
```

By default, `--masque-tip-bg`, `--masque-tip-color`, and
`--masque-tip-border` follow the figure's background, so a dark figure
gets a dark tooltip. Older browsers without CSS relative-color syntax
use the fixed values shown instead, and where a row lists light and
dark values, the browser picks one by the system's color scheme:

| Custom property | Default (light / dark) | `tooltipstyle` key |
|---|---|---|
| `--masque-tip-bg` | follows the figure; older browsers `#ffffff` / `#1e1e1e` | `tooltipstyle.bg` |
| `--masque-tip-color` | follows the figure; older browsers `#1a1a1a` / `#e8e8e8` | `tooltipstyle.color` |
| `--masque-tip-border` | follows the figure; older browsers `rgba(0,0,0,0.1)` / `rgba(255,255,255,0.15)` | CSS only |
| `--masque-tip-accent` | `#6b7280` | `tooltipstyle.accent` |
| `--masque-tip-font` | `system-ui, -apple-system, sans-serif` | `tooltipstyle.font` |
| `--masque-tip-font-size` | `11px` | `tooltipstyle.font_size` |
| `--masque-tip-radius` | `4px` | `tooltipstyle.radius` |
| `--masque-tip-caret` | `block` (the caret's `display`) | `tooltipstyle.caret` (`false` → `none`) |
| `--masque-tip-padding` | `8px 12px` | CSS only |
| `--masque-tip-shadow` | `0 2px 4px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)` / `0 2px 4px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.3)` | CSS only |
| `--masque-tip-maxwidth` | `320px` | CSS only |
| `--masque-mark-border` | *(unset: plain 1px border)* | none; set from the mark's `colors` (see [Accent color](@ref)) |

## Overlay styling

Pass `overlaystyle` to `masque` to change how highlights, the
selection, the crosshair, and ROI boxes look in that widget. Name only
the parts you want to change; the rest keep the built-in look:

```julia
masque(fig; overlaystyle = (; color = :steelblue, hover_width = 2.5))
```

A per-layer `hoverstyle` stroke still wins on that layer. An unknown key
raises an `ArgumentError` that lists the valid ones. Widths are in CSS
pixels, and opacities run from 0 to 1. Colors take a CSS string or any
Makie color.

| Key | Default | Changes | Custom property |
|---|---|---|---|
| `color` | `#7a7a7a` on a light figure, `#c8c8c8` on a dark one | highlight, selection, ROI, and threshold stroke | `--masque-chrome` |
| `dodge_fill` | `#141414` | how strongly a highlight brightens the mark; lighter is stronger | `--masque-hi-fill` |
| `hover_width` | `1.5` | outline of the hovered mark | `--masque-hover-width` |
| `selected_width` | `2` | outline of a selected point, bar, or shape; a selected line uses the ring below | `--masque-selected-width` |
| `hover_fill_opacity` | `0.18` | fill of a hovered mark with a `hoverstyle` stroke | `--masque-hover-fill-opacity` |
| `selected_fill_opacity` | `0.35` | fill of a selected mark with a `hoverstyle` stroke | `--masque-selected-fill-opacity` |
| `ring_width` | `2` | ring around a selected line | `--masque-ring-width` |
| `ring_halo_width` | `4` | soft band around that ring | `--masque-ring-halo-width` |
| `ring_halo_opacity` | `0.25` | that band's opacity | `--masque-ring-halo-opacity` |
| `roi_width` | `1` | ROI box outline | `--masque-roi-width` |
| `handle_width` | `1` | ROI corner grip outline | `--masque-handle-width` |
| `handle_fill` | `#ffffff` | ROI corner grip fill | `--masque-handle-fill` |
| `cross_color` | `#b0b0b0` on a light figure, `#929292` on a dark one | crosshair line | `--masque-cross` |
| `cross_width` | `1` | crosshair line | `--masque-cross-width` |
| `cross_opacity` | `0.8` | crosshair line | `--masque-cross-opacity` |
| `cross_halo_width` | `1.5` | figure-colored edge around the crosshair line | `--masque-cross-halo-width` |

To change these without Julia, set the custom properties in a CSS rule
on an element that contains the cell, as for tooltips. `color`,
`dodge_fill`, and `cross_color` can only be set from Julia.

One property has no key: `--masque-noblend-fill-opacity` (default `0.18`)
is the highlight fill in a browser that cannot brighten the mark, and
can be set only from CSS.

## Custom-hit interface

For usage, see [Custom hits](@ref).

```@docs
AbstractInteractable
AbstractSelector
HitLayer
InteractionContext
AxisTransform
data_to_image_px
hitlayers
```

## Backend abstraction

```@docs
AbstractBackend
```

The two built-in backends are `:cairo` and `:webgl`, chosen with
`masque`'s `backend=` keyword once `CairoMakie` or `WGLMakie` is
loaded. [Backends](@ref) describes what each one does.
