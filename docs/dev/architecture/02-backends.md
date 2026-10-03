# 2. The backend seam — `AbstractBackend`

The backend owns exactly two operations: *produce the displayable artifact*, and *project
data→pixels* for that artifact. Everything backend-specific lives behind it; nothing upstream of
it knows what rendered the image.

```julia
abstract type AbstractBackend end

# every backend extension implements these (generic stubs in src/backend.jl)
_ppu(::AbstractBackend, fig, max_width)              # default px_per_unit (masque's px_per_unit = nothing)
render(::AbstractBackend, fig, ppu)                  # the displayable artifact
context(::AbstractBackend, fig, ppu, max_width)::InteractionContext  # projection + per-axis transforms
make_widget(::AbstractBackend, result, manifest, display_css, fig, interactables, ppu, max_width)  # the @bind widget

struct RenderResult                                   # CairoBackend's artifact
    mime    :: String                                 # always "image/png"
    payload :: Union{Vector{UInt8}, String}           # PNG bytes
    width   :: Int                                    # output image px
    height  :: Int
    scaling :: Float64                                # px_per_unit
end
```

`masque` finalizes the figure once (`_finalize!`), takes `ppu` from its `px_per_unit` keyword or,
when that is `nothing`, from `_ppu(backend, fig, max_width)`, and passes the same `ppu` to `context`
and `render`, so the manifest's geometry and the artifact agree on one pixel grid. `max_width` and
`px_per_unit` are `masque` keywords, never backend fields (#236): the roadmap rules out
per-backend settings, so every setting reaches every backend through these signatures. The
built-in backend structs are fieldless; `CairoBackend(; max_width)` / `WebGLBackend(; …)`
survive in 0.2.x only as deprecated constructors returning a `_LegacyBackend` wrapper whose
settings `masque`'s own keywords override (removed in 0.3).

**Two co-equal backends**, each a weak-dep extension:

- `CairoBackend` (`ext/MasqueCairoMakieExt.jl`) renders a static PNG: `render` =
  `colorbuffer(fig; px_per_unit = ppu)` → PNG → bytes in a `RenderResult`. There is no vector/SVG
  output path (`RenderResult.mime` is always `"image/png"`).
- `WebGLBackend` — the `:webgl` backend (`ext/MasqueWGLMakieExt.jl`) — draws on a browser-GPU
  `<canvas>`. Its `render` returns a `WebGLResult` (a serialized WGLMakie scene plus size and
  `px_per_unit`) rather than a `RenderResult`; everything else goes through the same contract.

`_resolve_backend` in `src/render.jl` maps `backend = :cairo` / `:webgl` to the extension's
instance (`_builtin_backend(::Val{name})`), failing with the package to load when that extension
is absent; passes an `AbstractBackend` instance through (the third-party extension point);
otherwise picks the loaded extension, and prefers Cairo when both are loaded. The interaction feature set is identical on both
— parity is CI-enforced by the golden-manifest harness; `perf-findings.md`'s "Backend
comparison" has the cost of each and which regime suits which. Both `context` methods share
`_project_closure` and the per-block transform builders in `src/backend.jl`, so the two differ
only in the artifact. The seam also admits a future
GLMakie-static backend (GPU offscreen → PNG, same contract) or a pure-image backend.

**WGLMakie's own camera controls stay off, on purpose.** The shim sets `can_send_to_julia: () =>
true` (`frontend/src/wgl-shim.ts`), which the client-side observable animation path needs, and
WGLMakie's `use_orbit_cam = () => !(Bonito.can_send_to_julia && Bonito.can_send_to_julia())` then
disables 3-D OrbitControls; 2-D `Axis` zoom and pan are Julia-side in WGLMakie and do nothing
under the server-free `Bonito.NoConnection()` session (`_headless_screen` in
`ext/MasqueWGLMakieExt.jl`). A client-driven camera would move the plot without Julia knowing, so
the overlay, projected in Julia at render time, would drift off the marks, and it could exist
only on `:webgl`. View gestures go through `ViewInteractable` and the gesture channel instead,
re-projected in Julia each frame on both backends
([§12](12-gesture-channel.md)).

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
    ispolar   :: Bool                              # PolarAxis: lims are the viewport's Cartesian window
    polar     :: Union{Nothing, PolarFrame}        # PolarAxis: resolved Makie.Polar fields for the θ/r step
end

struct PolarFrame
    theta_as_x :: Bool
    direction  :: Int
    theta_0    :: Float64
    r0         :: Float64                          # target_r0
    branch     :: Tuple{Float64,Float64}           # θ fold: thetacenter ± π on a sector, else 0..2π
end
```

For both backends the projection closure is the validated spike math:
`q = Makie.project(ax.scene, p); ((q+origin)·scaling) with y-flipped to image coords` (transform
applied in Float64 first; points widen to `Point3` so the same closure projects `Axis3` scenes).
The `AxisTransform` is the *same information* expressed declaratively, so JS can invert pixels→data
for `AxisInteractable` and for live hover-coordinate readout (the drag/Tier-0 enabler).

**Axis kinds.** `context()` builds a transform for every `Axis` (`:ax1`, `:ax2`, … in `fig.content`
order), `Axis3`, and `PolarAxis`. `Axis3` (`is3d`) carries a real
viewport but placeholder lims, because a pixel on a 3D axis is a ray. The interactables that invert
pixels (`AxisInteractable`, `ThresholdInteractable`, `ROIInteractable`, `SliceInteractable`) fail
loud in `validate()` on it rather than read the placeholders.

`PolarAxis` (`ispolar`, #170) inverts in two steps, the split Makie, Plotly, and Matplotlib all
use. Its lims are the Cartesian window of the scene viewport (the corners unprojected the way
`mouseposition` / `Makie.to_world` does, so `PolarAxis`'s letterbox and tick inset come with
them), and `invertAxis` maps a pixel linearly onto that window. `PolarFrame` then takes the
Cartesian point to `θ = mod(direction·atan2(y, x) − theta_0, branch)` and `r = hypot(x, y) + r0`,
swapped when `theta_as_x` is false; `projectAxis` runs the forward map first. `clip_r` is not
shipped because `hypot ≥ 0` makes it irrelevant to the inverse. The branch is `PolarAxis`'s own
zoom-handler fold (`thetacenter ± π` from `target_thetalims` on a sector, else
`inverse_transform(::Polar)`'s `0..2π`), so a point drawn at a negative angle on a sector around
0 reads back negative. Only `AxisInteractable` consumes it: a threshold, ROI, and slice follow
straight screen lines (constant r is a circle, constant θ a ray, a screen rectangle is no
annular sector), and a polar view would write `target_rlims`/`target_thetalims`, so those and
`ViewInteractable` still fail loud on `ispolar`. Element hit-testing (points, segments, polys)
works on every axis kind because it only uses the forward projection.

Any other `Makie.AbstractAxis` (`LScene`
today) gets no transform, so both backends refuse the figure with the same `ArgumentError`
(`_reject_unsupported_axes` in `src/backend.jl`, #172).

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
