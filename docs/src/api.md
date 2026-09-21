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
RegionInteractable
FunctionInteractable
```

## Tooltip macro and type

```@docs
Markup
@masque_str
```

For usage, see [Tooltips](@ref).

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
