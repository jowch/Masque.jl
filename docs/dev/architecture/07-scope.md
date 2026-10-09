# 7. Scope

What Masque covers is the user site's [Supported plots and axes](../../src/support.md) page and
`CHANGELOG.md`; what is left to build, and what we decided not to build, is `roadmap.md`. This
section keeps the scope decisions whose reasoning the code depends on.

**Hit-testing is a naive O(n) scan per pointer move** (`frontend/src/geometry.ts`). The wall that
bites first is manifest **payload size**, not hit-test CPU ([§8](08-scaling.md)), so the
higher-leverage lever is wire encoding ([§9](09-wire-encoding.md)). Spatial acceleration
(bucketing/quadtree) waits until a profile shows the JS hit test itself is the bottleneck.

**Occlusion policy (backend-symmetric).** Within a `:surface` layer, quads are tried front to
back; between layers, first match wins. Julia sorts a surface's quads by the average clip-space
depth of their corners, the order CairoMakie paints them in, so on `:cairo` the answer and the
picture agree to within a cell and on `:webgl` they differ only where two faces of close average
depth overlap (#259). Every other layer keeps every projected vertex hittable, including
far-side points on solid 3D objects, and between layers the plot drawn last wins (#242), which
is what CairoMakie draws. On `:webgl`, which depth-tests every pixel, a mark hidden behind a
surface still answers hover and beats the surface in front of it; accepted, since a
backend-dependent rule is ruled out (`roadmap.md`). A painter's cull (dropping hidden quads) is
not built: the depth order already resolves every overlap, and a cull would only save bytes at
the price of a raster pass per orbit frame. GPU-pick occlusion is a non-goal: hit geometry stays Julia-projected on both
backends. The `:webgl` scene JSON zeros non-finite floats in GPU buffers (`_json_float` in
`ext/MasqueWGLMakieExt.jl`, since `JSON3` rejects `NaN`), for transport only; hit geometry keeps
them as `Float32`, so a `NaN` gap survives ([§9](09-wire-encoding.md)).

**3D and polar are backend-symmetric.** CairoMakie renders static 3D natively, so `Axis3` is not
a `:webgl`-only domain: both backends collect `Axis3` blocks, element interactables project
through the shared closure (3D enters only at the projection step — spike-verified on the Cairo
raster and the live canvas, recorded in `perf-findings.md`), and the `axis3` parity goldens are
byte-identical across backends. Continuous pixel→data inversion is undefined on a 3D axis (a
screen pixel is a ray), so the inverting interactables fail loud on `is3d`. `PolarAxis` discrete
overlays ship on both backends the same way (`Makie.Polar` applied via `transform_func`). The
continuous readout, #170, is scoped to `AxisInteractable`; threshold, ROI, slice, and view stay
gated on `ispolar` ([§2](02-backends.md)).

**`LScene` is refused on both backends** at `masque` time (`_reject_unsupported_axes` in
`src/backend.jl`, #172). Interactive 3D is `Axis3`.

**Figure hygiene.** `masque` forces an opaque background for the render and restores it; it makes
no other change to the user's figure.

**BoxPlot whiskers and outliers are decorative**; only the box body is a hit target. Likewise a
`wireframe!` of the same grid as a `surface!` on the same `Axis3` (`==` on the converted
arguments): its edges sit a few pixels apart over the whole surface and would answer nearly every
hover with an edge, hidden side included. An explicit `SegmentInteractable(ax, wf)` still builds it.
