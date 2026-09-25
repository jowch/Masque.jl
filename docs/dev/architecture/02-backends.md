# 2. The backend seam — `AbstractBackend`

The backend owns exactly two operations: *produce the displayable artifact*, and *project
data→pixels* for that artifact. Everything backend-specific lives behind it; nothing upstream of
it knows what rendered the image.

```julia
abstract type AbstractBackend end

# every backend extension implements these (generic stubs in src/backend.jl)
_ppu(::AbstractBackend, fig)                         # px_per_unit / device scale
render(::AbstractBackend, fig, ppu)                  # the displayable artifact
context(::AbstractBackend, fig, ppu)::InteractionContext  # projection + per-axis transforms
make_widget(::AbstractBackend, result, manifest, display_css, fig, interactables, ppu)  # the @bind widget

struct RenderResult                                   # CairoBackend's artifact
    mime    :: String                                 # always "image/png"
    payload :: Union{Vector{UInt8}, String}           # PNG bytes
    width   :: Int                                    # output image px
    height  :: Int
    scaling :: Float64                                # px_per_unit
end
```

`masque` finalizes the figure once (`_finalize!`), computes `ppu = _ppu(backend, fig)`, and passes
the same `ppu` to `context` and `render`, so the manifest's geometry and the artifact agree on one
pixel grid.

**Two co-equal backends**, each a weak-dep extension:

- `CairoBackend` (`ext/MasqueCairoMakieExt.jl`) renders a static PNG: `render` =
  `colorbuffer(fig; px_per_unit = ppu)` → PNG → bytes in a `RenderResult`. There is no vector/SVG
  output path (`RenderResult.mime` is always `"image/png"`).
- `WebGLBackend` — the `:webgl` backend (`ext/MasqueWGLMakieExt.jl`) — draws on a browser-GPU
  `<canvas>`. Its `render` returns a `WebGLResult` (a serialized WGLMakie scene plus size and
  `px_per_unit`) rather than a `RenderResult`; everything else goes through the same contract.

`_resolve_backend` in `src/render.jl` honors an explicit `backend=`, otherwise picks the loaded
extension, and prefers Cairo when both are loaded. The interaction feature set is identical on both
— parity is CI-enforced by the golden-manifest harness; see `backend-comparison.md` for the
cost/regime tradeoff. Both `context` methods share `_project_closure` and the per-block transform
builders in `src/backend.jl`, so the two differ only in the artifact. The seam also admits a future
GLMakie-static backend (GPU offscreen → PNG, same contract) or a pure-image backend.

**Don't corrupt the user's figure.** Makie `Figure`s can't be `deepcopy`'d (they hold module refs),
so instead the one mutation we introduce — forcing an opaque background — is **saved and restored**
(try/finally). `update_state_before_display!` is also run (inside `_finalize!`), but that's exactly
the step Makie performs at display/save time, so it's benign, not corruption. See also the
DPI/sizing policy in `frontend-delivery.md` (render at `2 × min(scene width, max_width)`, 700px
Pluto column by default; opaque background; the cell-widening half of wide mode is #179).

## `InteractionContext` — the backend → interactable bridge

The context is **backend-produced** so projection is not hard-wired to `Makie.project`. It carries a
projection closure (backend's implementation of data→image-px) plus the per-axis transforms (which are
*also* serialized to JS for continuous inversion).

```julia
struct InteractionContext
    project       :: Function                     # (ax, point) -> Point2f in image px (2-D or 3-D point)
    transforms    :: Dict{Symbol, AxisTransform}  # one per axis/colorbar/legend, keyed by id
    ids           :: IdDict{Any, Symbol}          # block object -> its transform id (axis_id(ctx, ax))
    width         :: Int
    height        :: Int
    scaling       :: Float64
    display_scale :: Float64                      # CSS px per image px on screen
end

# the ONE coordinate primitive interactables call — never re-derive projection
data_to_image_px(ctx::InteractionContext, ax, p) = ctx.project(ax, p)

struct AxisTransform
    id        :: Symbol
    xlims     :: Tuple{Float64,Float64}
    ylims     :: Tuple{Float64,Float64}
    xscale    :: Symbol                            # :identity | :log10 | :log | :symlog10 | :pseudolog10
    yscale    :: Symbol
    viewport  :: NTuple{4,Float64}                 # (x, y, w, h) in image px, top-left origin
    xreversed :: Bool
    yreversed :: Bool
    xcats     :: Union{Nothing, Vector{String}}    # categorical tick map
    ycats     :: Union{Nothing, Vector{String}}
    valueaxis :: Union{Nothing, Symbol}            # nothing = 2-D {x,y} readout; :x/:y = 1-D colorbar readout
    is3d      :: Bool                              # Axis3: pixel→data inversion undefined; lims are placeholders
    ispolar   :: Bool                              # PolarAxis: θ/r inversion not serialized; lims are placeholders
end
```

For both backends the projection closure is the validated spike math:
`q = Makie.project(ax.scene, p); ((q+origin)·scaling) with y-flipped to image coords` (transform
applied in Float64 first; points widen to `Point3` so the same closure projects `Axis3` scenes).
The `AxisTransform` is the *same information* expressed declaratively, so JS can invert pixels→data
for `AxisInteractable` and for live hover-coordinate readout (the drag/Tier-0 enabler).

**Axis kinds.** `context()` builds a transform for every `Axis` (`:ax1`, `:ax2`, … in `fig.content`
order), `Axis3`, and `PolarAxis`. `Axis3` (`is3d`) and `PolarAxis` (`ispolar`) carry a real
viewport but placeholder lims: a pixel on a 3D axis is a ray, and the polar transform is not
serialized to JS. The interactables that invert pixels (`AxisInteractable`, `ThresholdInteractable`,
`ROIInteractable`, `SliceInteractable`, and `ViewInteractable` on polar) fail loud in `validate()`
on those flags rather than read the placeholders; element hit-testing (points, segments, polys) works
on all three because it only uses the forward projection. Serializing the polar transform so
`AxisInteractable` gets a continuous θ/r readout is #170. Any other `Makie.AbstractAxis` (`LScene`
today) gets no transform: `CairoBackend` refuses the figure with an `ArgumentError`, `WebGLBackend`
renders it with no overlay for it (#172 proposes refusing on both).

**Categorical axes.** When an axis uses a categorical conversion, `xcats`/`ycats` carry the
ordered tick labels so JS maps a pixel to the right category (and tooltips/readout show the category,
not the integer index). Without this, bars/boxplots on categorical axes would report wrong
coordinates. An axis click or threshold release on a categorical dimension sends that label on the
wire; `bond_from_js` (`_decategorize`) maps it back to its `1:n` position before any
`transform_bond` runs, and keeps the label as `xcat`/`ycat` or `category` on the event.

**Colorbar and Legend transforms — the figure-block walk.** Colorbar blocks live in `fig.content`,
not in any `Axis` scene, so `context()` runs a second walk over `fig.content` after collecting axes —
picking up every `Makie.Colorbar` and registering it under a `Symbol("cb", k)` id. Each colorbar gets
its own `AxisTransform`: the value scale (`limits[]`, `scale[]`) is mapped to the long axis (`ylims` for
vertical, `xlims` for horizontal), and `valueaxis` is set to `:y` or `:x` accordingly. The viewport is
the colorbar's laid-out pixel bbox (`computedbbox[]`), converted with the same ×scaling + y-flip used for
axes. JS reads `valueaxis` to invert the cursor pixel to a scalar payload `(; value)` — the same
`invertAxis` path `AxisInteractable` uses for its 2-D `{x,y}` readout, projected along one axis only.
Every `Makie.Legend` is registered the same way (`:legend`, then `:legend_2`, …) with the legend's
whole laid-out bbox as its viewport and placeholder lims; a legend has no data-space readout, so
only the viewport is ever read (by `LegendInteractable`).
