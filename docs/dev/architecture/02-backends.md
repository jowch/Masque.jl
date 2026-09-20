# 2. The backend seam — `AbstractBackend`

The backend owns exactly two operations: *produce the displayable artifact*, and *project
data→pixels* for that artifact. Everything CairoMakie-specific lives behind it; nothing
upstream of it knows what rendered the image.

```julia
abstract type AbstractBackend end

render(::AbstractBackend, fig)::RenderResult         # finalize layout + produce artifact
context(::AbstractBackend, fig)::InteractionContext  # projection + per-axis transforms

struct RenderResult
    mime    :: String                                 # "image/png" | "image/svg+xml"
    payload :: Union{Vector{UInt8}, String}           # bytes (raster) | text (svg)
    width   :: Int                                    # output image px
    height  :: Int
    scaling :: Float64                                # device_scaling_factor (px_per_unit for PNG)
end
```

**`CairoBackend` was the only v1 implementation.** (Update: a second, co-equal implementation,
`WebGLBackend` — the `:webgl` backend, in `ext/MasqueWGLMakieExt.jl` — was added later; see the
note at the end of this section.) `CairoBackend` renders PNG only — no vector/SVG output path
exists (a `CairoBackend(vector=true)` groundwork field was removed pre-registration as dead code;
see `roadmap.md`'s SVG output path item for what an actual implementation would need). `render` =
`colorbuffer` → PNG → bytes. `context` calls
`Makie.update_state_before_display!(fig)` (mandatory, validated) then builds the projection closure
and reads each axis's transform.

**Don't corrupt the user's figure.** Makie `Figure`s can't be `deepcopy`'d (they hold module refs),
so instead the one mutation we introduce — forcing an opaque background — is **saved and restored**
(try/finally). `update_state_before_display!` is also run, but that's exactly the step Makie performs
at display/save time, so it's benign, not corruption. See also the DPI/sizing policy in `frontend-delivery.md`
(render at `2 × (max_width or 700px column)`, opaque background, package-owned wide mode).

The seam was originally scoped static-only: v1's research (Q0) found a browser-side *live*
WGLMakie rendering model server-centric and reload-fragile, at odds with the static/durable
output this project set out to provide, and framed it as a different product rather than a
deferred target. **Update:** the seam turned out to admit a live implementation cleanly after
all — `WebGLBackend` implements the same `AbstractBackend` contract (`render`/`context`)
against a browser-GPU `<canvas>` instead of a PNG, shipped as the `MasqueWGLMakieExt` weak-dep
extension. The two backends are now co-equal peers (`_resolve_backend` in `src/render.jl`
picks the loaded one, honors `backend=`, and defaults to Cairo if both are present); see
`backend-comparison.md` for the cost/regime tradeoff (the interaction
feature set is identical on both — parity is CI-enforced by the golden-manifest harness). The seam
still also admits a future GLMakie-static backend (GPU offscreen → PNG, same contract) or a
pure-image backend.

## `InteractionContext` — the backend → interactable bridge

The context is **backend-produced** so projection is not hard-wired to `Makie.project`. It carries a
projection closure (backend's implementation of data→image-px) plus the per-axis transforms (which are
*also* serialized to JS for continuous inversion).

```julia
struct InteractionContext
    project    :: Function                        # (ax, point::Point2) -> Point2f in image px
    transforms :: Dict{Symbol, AxisTransform}     # one per axis; keyed by an axis id
    width      :: Int
    height     :: Int
    scaling    :: Float64
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
    xcats     :: Union{Nothing, Vector{String}}    # categorical tick map (v1)
    ycats     :: Union{Nothing, Vector{String}}
    valueaxis :: Union{Nothing, Symbol}            # nothing = 2-D {x,y} readout; :x/:y = 1-D colorbar readout
end
```

For CairoMakie the projection closure is the validated spike math:
`q = Makie.project(ax.scene, p); ((q+origin)·scaling) with y-flipped to image coords`.
The `AxisTransform` is the *same information* expressed declaratively, so JS can invert pixels→data
for `AxisInteractable` and for live hover-coordinate readout (the drag/Tier-0 enabler).

**Categorical axes are v1.** When an axis uses a categorical conversion, `xcats`/`ycats` carry the
ordered tick labels so JS maps a pixel to the right category (and tooltips/readout show the category,
not the integer index). Without this, bars/boxplots on categorical axes would report wrong coordinates —
so it's shipped, not stubbed.

**Colorbar `AxisTransform` and the figure-block walk (M3).** Colorbar blocks live in `fig.content`,
not in any `Axis` scene, so `context()` runs a second walk over `fig.content` after collecting axes —
picking up every `Makie.Colorbar` and registering it under a `Symbol("cb", k)` id. Each colorbar gets
its own `AxisTransform`: the value scale (`limits[]`, `scale[]`) is mapped to the long axis (`ylims` for
vertical, `xlims` for horizontal), and `valueaxis` is set to `:y` or `:x` accordingly. The viewport is
the colorbar's laid-out pixel bbox (`computedbbox[]`), converted with the same ×scaling + y-flip used for
axes. JS reads `valueaxis` to invert the cursor pixel to a scalar payload `(; value)` — the same
`invertAxis` path `AxisInteractable` uses for its 2-D `{x,y}` readout, projected along one axis only.

