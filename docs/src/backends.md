# Backends

Masque has two backends. The interaction contract — `masque`, `@bind`,
[`InteractionEvent`](@ref), every interactable — is the same on both.
Cost and view preview are not.

For your first overlay, see [Getting started](@ref).

## Choose a backend

Load a Makie backend before you call `masque`.

- Load neither `CairoMakie` nor `WGLMakie`: the first `masque` call
  raises `ArgumentError`.
- Load only `CairoMakie`: Masque uses the static PNG backend.
- Load only `WGLMakie`: Masque uses the WebGL backend.
- Load both: an unqualified `masque(fig)` stays on CairoMakie, so a
  Cairo-baked session is not blocked by a stray `using WGLMakie`.

`backend=` takes an extension instance, not a `:cairo` or `:webgl`
symbol. `CairoBackend` and `WebGLBackend` are not in `Masque`'s exports.
Reach them with `Base.get_extension` when you need a WebGL-only knob
such as `px_per_unit`:

```julia
masque(
    fig, interactables;
    backend = Base.get_extension(Masque, :MasqueWGLMakieExt).WebGLBackend(;
        px_per_unit = 3.0,
    ),
)
```

`max_width` on `masque` applies when the backend is implicit (Pluto's
column, in CSS px; default 700). An explicit backend struct uses that
struct's own `max_width`.

## CairoMakie

`using CairoMakie` selects it. CairoMakie renders the figure to a PNG
once. Masque ships a hit-region manifest with that image. A TypeScript
overlay (`assets/overlay.js`) hit-tests pointer events, draws highlight
in the overlay and the tooltip locally, and sends a deliberate click
back through `@bind`.

One render per `masque()` call, independent of how many elements are
interactive. Cheap for a figure you build once and inspect. Expensive if
you re-render every animation frame (each frame re-rasterizes the whole
scene).

A static `Axis3` figure on CairoMakie is a valid 3D plot. 3D does not
require WGLMakie. Scatter and Lines on `Axis3` commit an
[`ElementEvent`](@ref) with `x`, `y`, `z`. MeshScatter derives
`radius3d` from data-space `markersize`. Orbit is
[`ViewInteractable`](@ref) on that axis. For constructor allowlists, see
[Constructors](@ref). For the cairo-frames versus webgl-numeric split,
see [Pan and orbit preview](@ref).

## WGLMakie

> **Status: experimental.** Verified end to end in a real Pluto
> notebook (render, overlay, and the `@bind` round-trip).

`using WGLMakie` (with CairoMakie **not** loaded) switches `masque` to a
browser-GPU canvas. The overlay sits on top. The `masque` / `@bind` API
does not change:

```julia
begin
    using Masque, WGLMakie
    x, y, z = randn(200), randn(200), randn(200)
    fig = Figure()
    ax = Axis3(fig[1, 1])
    scatter!(ax, x, y, z)
end
```

```julia
@bind pick masque(fig)
```

Load WGLMakie for a live GPU canvas: animation, frequent re-renders, or
large updating data, where per-frame PNG cost dominates.
For a figure you build once and inspect, CairoMakie's static PNG is
lighter.

The WGLMakie JS bundle ships once per notebook. Each extra `masque(fig)`
cell pays for its own scene, not another copy of the bundle. The
extension is version-coupled to WGLMakie internals (`serialize_scene`).
Treat a WGLMakie version bump as a re-check, not an automatic upgrade.

`using WGLMakie` in a session that already loaded CairoMakie does not
switch the PNG. Pick WebGL with `backend=` as shown earlier, or start a
session that loads only WGLMakie.

For a runnable gallery, see [Examples](@ref).

## Pan and orbit preview

[`ViewInteractable`](@ref) commits nothing. The bond never carries
`:view`. Drag is operational camera state, not analysis data.

On `:cairo`, in-drag frames stream over `with_js_link`. Julia mutates
limits (2D pan) or `azimuth` / `elevation` (`Axis3` orbit), re-renders,
and ships a fresh PNG plus hit manifest. That channel needs a live
kernel. It is dead on static export.

On `:webgl`, drag shows a numeric readout only. The canvas does not
repaint from Masque during the gesture. Loading WGLMakie so the PNG
"updates" during pan does not produce live preview.

`ViewInteractable` on `Axis3` is allowed: that is orbit. Polar, Colorbar,
categorical 2D, and non-invertible 2D scales raise `ArgumentError`.
`LScene`: CairoMakie refuses the figure; WGLMakie renders with **no**
overlay.

Persist a camera across remount with an explicit `Ref` plus rebuild, not
with `selected=`. The slider notebooks under [Examples](@ref) show that
pattern. For the overlay-only embed and the cairo in-drag clip, see
[Pan and orbit](@ref).

## Export static HTML

On either backend, a Pluto notebook exported to static HTML keeps
pointer inspection (tooltip and highlight in the overlay): the hit-test
manifest is baked in, and so is the base (PNG on `:cairo`; serialized
scene on `:webgl`, redrawn on the reader's GPU with no Julia server).
The page still loads Pluto's frontend from a CDN.

Lost on either backend: anything that needs Julia to recompute. A click
that updates `pick` and re-runs downstream cells does nothing without a
live kernel. `with_js_link` view frames die. Inspection-without-kernel
is true on both backends.
