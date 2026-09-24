# API

Full docstrings for every exported name, grouped by area. Usage guidance
and worked examples live on the other pages; this page is the reference.

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

## Tooltip chrome

Set any of these on `masque` to lock that property (and opt it out of
dark-mode inversion):

```julia
masque(fig, interactables...;
    tooltip_bg        = nothing,   # background  — CSS string or Makie color
    tooltip_color     = nothing,   # text color  — CSS string or Makie color
    tooltip_accent    = nothing,   # accent (emphasis / links)
    tooltip_font      = nothing,   # font-family — String
    tooltip_font_size = nothing,   # Real → appended with "px"
    tooltip_radius    = nothing,   # Real → appended with "px"
    tooltip_caret     = true,      # Bool — draw the caret toward the mark
)
```

`nothing` (the default for every keyword except `tooltip_caret`) means
use the built-in default. Only the keywords you set change anything.

The `--masque-tip-*` custom properties inherit like any CSS custom
property. Setting one on an ancestor of the cell overrides it with no
Julia API:

```html
<style>
main { --masque-tip-bg: #1a1a2e; --masque-tip-color: #e0e0e0; }
</style>
```

`--masque-tip-bg` / `--masque-tip-color` / `--masque-tip-border` are
derived from the figure's background unless you set them here or with a
`tooltip_*` keyword. The "Legacy fallback" column is what a browser
without CSS relative-color syntax uses instead:

| Custom property | Legacy fallback (light / dark) | Julia keyword |
|---|---|---|
| `--masque-tip-bg` | `#ffffff` / `#1e1e1e` | `tooltip_bg` |
| `--masque-tip-color` | `#1a1a1a` / `#e8e8e8` | `tooltip_color` |
| `--masque-tip-border` | `rgba(0,0,0,0.1)` / `rgba(255,255,255,0.15)` | — (CSS only) |
| `--masque-tip-accent` | `#6b7280` | `tooltip_accent` |
| `--masque-tip-font` | `system-ui, -apple-system, sans-serif` | `tooltip_font` |
| `--masque-tip-font-size` | `11px` | `tooltip_font_size` |
| `--masque-tip-radius` | `4px` | `tooltip_radius` |
| `--masque-tip-caret` | `block` (the caret's `display`) | `tooltip_caret` (`false` → `none`) |
| `--masque-tip-padding` | `8px 12px` | — (CSS only) |
| `--masque-tip-shadow` | `0 2px 4px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)` / `0 2px 4px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.3)` | — (CSS only) |
| `--masque-tip-maxwidth` | `320px` | — (CSS only) |
| `--masque-mark-border` | *(unset — plain 1px border)* | — (from the mark's `colors`; see [Accent color](@ref)) |

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

`CairoBackend` and `WebGLBackend` are the two concrete backends, but
they are defined inside Masque's package extensions
(`ext/MasqueCairoMakieExt.jl`, `ext/MasqueWGLMakieExt.jl`) rather than
in `Masque` itself — they only exist once `CairoMakie` / `WGLMakie` is
loaded, so Documenter cannot resolve `@docs` for them without loading
both weak dependencies into the docs build to document two structs.
They are documented in prose instead: see [Backends](@ref) for what
each does, and `masque`'s docstring on this page for the `backend=`
keyword both accept.
