# API

Docstrings for every exported name, grouped by area. For worked
examples, start with [Getting started](@ref).

## Entry point

```@docs
Masque
masque
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

Pass any of these to `masque` to set that part of the tooltip's style
for the whole widget. A property you set stays the same on light and
dark figures:

```julia
masque(fig, interactables...;
    tooltip_bg        = nothing,   # background: CSS string or Makie color
    tooltip_color     = nothing,   # text color: CSS string or Makie color
    tooltip_accent    = nothing,   # accent (emphasis, links)
    tooltip_font      = nothing,   # font-family: String
    tooltip_font_size = nothing,   # Real, in px
    tooltip_radius    = nothing,   # Real, in px
    tooltip_caret     = true,      # Bool: draw the caret pointing at the mark
    tooltip_sigdigits = 4,         # Int, 1 to 17: significant figures for numbers
)
```

`nothing`, the default for every keyword except `tooltip_caret` and
`tooltip_sigdigits`, keeps the built-in style. `tooltip_sigdigits` sets
how many significant figures a number shows when its template field has
no format spec; see [Tooltips](@ref).

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

| Custom property | Default (light / dark) | Julia keyword |
|---|---|---|
| `--masque-tip-bg` | follows the figure; older browsers `#ffffff` / `#1e1e1e` | `tooltip_bg` |
| `--masque-tip-color` | follows the figure; older browsers `#1a1a1a` / `#e8e8e8` | `tooltip_color` |
| `--masque-tip-border` | follows the figure; older browsers `rgba(0,0,0,0.1)` / `rgba(255,255,255,0.15)` | CSS only |
| `--masque-tip-accent` | `#6b7280` | `tooltip_accent` |
| `--masque-tip-font` | `system-ui, -apple-system, sans-serif` | `tooltip_font` |
| `--masque-tip-font-size` | `11px` | `tooltip_font_size` |
| `--masque-tip-radius` | `4px` | `tooltip_radius` |
| `--masque-tip-caret` | `block` (the caret's `display`) | `tooltip_caret` (`false` → `none`) |
| `--masque-tip-padding` | `8px 12px` | CSS only |
| `--masque-tip-shadow` | `0 2px 4px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)` / `0 2px 4px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.3)` | CSS only |
| `--masque-tip-maxwidth` | `320px` | CSS only |
| `--masque-mark-border` | *(unset: plain 1px border)* | none; set from the mark's `colors` (see [Accent color](@ref)) |

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

`CairoBackend` and `WebGLBackend` are the two concrete backends. Each
exists only once you load `CairoMakie` or `WGLMakie`, so their
docstrings are not on this page. [Backends](@ref) describes what each
one does, and `masque`'s docstring above covers the `backend=` keyword.
