# Troubleshooting

Each heading is the failed try or the error prefix you searched for. For
constructor signatures, see [Constructors](@ref).

## Errors from `masque()` / interactable constructors

### Tried `masque` with no Makie backend

**Error prefix:** `masque(fig) needs a rendering backend loaded`

**Cause:** neither `CairoMakie` nor `WGLMakie` is loaded in the session.

**Fix:** add `using CairoMakie` (static PNG, the default) or
`using WGLMakie` (live GPU canvas; experimental) before calling
`masque`. Loading both is fine; unqualified `masque` then stays on
CairoMakie. For more information, see [Backends](@ref).

### Tried `tooltip = true`

**Error prefix:** `tooltip = true is not meaningful`

**Cause:** an interactable was built with `tooltip = true`.

**Fix:** omit `tooltip` for the auto name/value table (the default),
pass `masque"..."` for a template, or `tooltip = false` to suppress it.
`true` is not one of the three valid forms. For more information, see
[Tooltips](@ref).

### Tried `payloads` of the wrong length

**Error prefix:** `got N payloads for M elements` /
`payloads must match points`

**Cause:** `payloads` does not have one entry per geometry element. Most
constructors report "got N payloads for M elements".
`PointInteractable` says "payloads must match points" instead — same
mistake, different wording. `RegionInteractable` requires `payloads`
(no auto default) and says `regions/payloads length mismatch`.

**Fix:** match lengths 1:1, or omit `payloads` on constructors that
have an auto default.

### Tried `mode` or `orientation` other than the two valid symbols

**Error prefix:** `mode must be :polyline or :pairs` /
`orientation must be :horizontal or :vertical`

**Cause:** `SegmentInteractable(...; mode = ...)` or
`ThresholdInteractable(...; orientation = ...)` got an unknown symbol.

**Fix:** use `:polyline` (connected path) or `:pairs` (disjoint
segments); `:horizontal` (constant-y, dragged vertically) or
`:vertical`.

### Tried ROI `bounds` that are not a 4-tuple in order

**Error prefix:** `ROIInteractable: bounds must be (xmin, xmax, ymin, ymax)` /
`need xmin < xmax and ymin < ymax`

**Cause:** `bounds` is not a 4-tuple, or the min/max order is backwards.

**Fix:** pass `bounds = (xmin, xmax, ymin, ymax)` with `xmin < xmax`
and `ymin < ymax`.

### Tried an unknown Region kind, or `selected=` on the base Region id

**Error prefix:** `regions/payloads length mismatch` /
`unknown region kind`

**Cause:** `RegionInteractable`'s `regions` and `payloads` do not line
up 1:1, or a region tuple's first element is not `:circle`, `:rect`, or
`:polygon`. `selected = Dict(:cells => [0])` when `id = :cells` also
fails: Region layers are `:cells_c` / `:cells_r` / `:cells_p`.

**Fix:** check the region tuple shapes against [Custom hits](@ref). Key
`selected=` on the suffixed ids.

### Tried a scale Masque cannot invert in the browser

**Error prefix:** `is not invertible client-side` /
`needs client-side invertible`

**Cause:** `AxisInteractable`, `ColorbarInteractable`,
`ThresholdInteractable`, `ROIInteractable`, and **2D**
`ViewInteractable` invert a pixel back to a data value in the browser.
That works for `identity`, `log10`, or `log`. Any other Makie scale
(`Makie.pseudolog10`, `Makie.Symlog10`, a custom `ReversibleScale`)
fails loud at `masque()` time instead of reporting the wrong
coordinate.

**Fix:** switch the axis to a supported scale, or use an element
interactable (`PointInteractable`, `SegmentInteractable`, …) instead of
a continuous-readout one.

This is **not** the Axis3 orbit path. `ViewInteractable` on `Axis3`
does not invert a pixel to data. Orbit is allowed; a pixel→data error
comes from Axis, Threshold, or ROI, not from View.

### Tried `AxisInteractable`, `ThresholdInteractable`, or `ROIInteractable` on Axis3

**Error prefix:** `continuous pixel→data readout is undefined on an Axis3` /
`undefined on an Axis3`

**Cause:** those three kinds need a 2D pixel→data inverse. A screen
pixel on `Axis3` is a ray, not a data point.

**Fix:** pick marks with element interactables (points, segments,
polygons) on 3D axes. Do not attach Axis / Threshold / ROI to
`Axis3`.

### Tried `ViewInteractable` orbit on Axis3

**Cause:** orbit **is allowed**. `ViewInteractable` on `Axis3` validates
and sorts as a `:view` layer. If you saw a continuous pixel→data error,
that error came from Axis, Threshold, or ROI, not from View.

**Fix:** pass `ViewInteractable(ax)` for orbit. On `:cairo`, in-drag
frames need a live kernel. On `:webgl`, drag shows a numeric readout
only. The bond never carries `:view`. For more information, see
[Backends](@ref).

### Tried continuous θ/r readout on PolarAxis

**Error prefix:** `continuous θ/r readout on PolarAxis` /
`PolarAxis view gestures need continuous θ/r` /
`PolarAxis continuous θ/r inversion is not yet shipped`

**Cause:** continuous polar inversion is not shipped.
`AxisInteractable`, `ThresholdInteractable`, `ROIInteractable`, and
`ViewInteractable` on `PolarAxis` raise `ArgumentError`.

**Fix:** use element interactables (Scatter, Lines, LineSegments,
ScatterLines) for discrete hits. Polar is not WebGL-only.

### Tried `heatmap!` or `barplot!` on PolarAxis

**Cause:** `masque(fig)` skips those kinds on `PolarAxis` with `@warn`
(an axis-aligned hit layer would misalign). Explicit AABB constructors
can still build and sit in the wrong place.

**Fix:** stick to the polar allowlist, or use a Cartesian `Axis`.

### Tried ROI or View pan on a categorical 2D axis

**Error prefix:** `bounds need continuous axes` /
`pan needs continuous numeric axes`

**Cause:** `ROIInteractable` and 2D `ViewInteractable` pan need numeric
axis limits; a categorical axis has none. (`ViewInteractable` orbit on
`Axis3` is a different gate — that path is allowed.)

**Fix:** use `AxisInteractable` (reads the category) instead, or pass
numeric limits.

### Tried an `LScene` figure on CairoMakie

**Error prefix:** `Masque's CairoMakie backend supports Makie.Axis,
Makie.Axis3, and Makie.PolarAxis`

**Cause:** the figure contains an `LScene` block. The `:cairo` backend
refuses to render it rather than silently drop it.

**Fix:** restart the session with `using WGLMakie` instead of
`CairoMakie` — `:webgl` renders `LScene` live, with **no** hit-testing
overlay. Masque builds no overlay for `LScene` on either backend.

### Tried `selected=` on a kind that cannot hydrate

**Error prefix:** `does not support pre-highlight` /
`out of range`

**Cause:** the layer id does not support highlight in the overlay from
`selected=` (`:grid`, `:axis`, `:threshold`, `:roi`, `:view` cannot;
only `:circles` / `:rects` / `:polygons` / `:segments` / `:polyline`
can), or an index is out of range. Region keys are the suffixed ids,
not the base `id`.

**Fix:** check the layer's kind against [Selection](@ref). Indices are
0-based and must be less than the element count.

### An error mentioning "Makie internals changed?"

**Cause:** an internal-invariant guard tripped. Masque introspects a
live Makie plot object's fields, and a Makie / CairoMakie / WGLMakie
version bump can move or rename one of them. This is not user misuse.

**Fix:** file an issue with your Makie / CairoMakie / WGLMakie
versions; pin to a known-good version in the meantime.

## Not errors, but surprising

### Tried loading neither backend, or both

Loading neither raises the `ArgumentError` earlier on this page.
Loading both is fine; unqualified `masque` defaults to CairoMakie. For
more information, see [Backends](@ref).

### Tried feeding this widget's bond into the same call's `selected=`

**Pluto says:** cyclic references.

**Cause:** you passed this `@bind` value into the same `masque(...)`
call's `selected=` in one cell. Pluto detects the self-reference and
refuses to run the cell.

**Fix:** a click already updates the overlay selection on its own.
`selected=` is only for a starting value your Julia code computes, and
that has to come from a cell that does not read this widget's bond. For
more information, see [Keep a selection when the figure rebuilds](@ref)
in [Selection](@ref).

### Tried a click and nothing happened

Check, in order:

1. Is the bond actually read somewhere? `@bind pick masque(...)` with no
   cell reading `pick` looks like nothing happened.
2. Did you click empty space? Clicks that do not land on a hit region
   are a no-op, by design. A miss does not clear the selection.
3. Is the element you clicked actually interactive? An unsupported plot
   type in `masque(fig)` is skipped with a `@warn` in the notebook log,
   not an error, so it silently is not clickable. Polar heatmap /
   barplot is this skip.

### Tried a tooltip and saw `[object Object]`

**Cause:** the auto-table (or a `$(field)` template) is rendering a
payload value that is itself a nested `Dict` or array. That stringifies
to `[object Object]` in JavaScript.

**Fix:** flatten the field to a scalar (string or number) in Julia
before it goes into `payloads`, or reference a pre-formatted string
field with `masque"$(that_field)"`.

### Tried a window resize and the overlay looked misaligned

**Cause:** almost always a `px_per_unit` / `max_width` mismatch between
what was rendered and what the display shows. Hit-testing re-reads the
element's actual on-screen size at runtime, so page zoom or window
resizing after the widget mounted is not the cause.

**Fix:** re-run the cell that calls `masque(...)`. If the misalignment
persists, check that `max_width` on `masque` or the explicit backend
struct matches the column width you expect.

### Tried reading `pick` after a pan or orbit

**Cause:** `ViewInteractable` commits nothing. The bond does not change
when you drag the view.

**Fix:** do not read `@bind` for camera state. On `:cairo`, live frames
use `with_js_link`. On `:webgl`, you get a numeric readout only.

### Browser console errors

Open the browser developer-tools console. A serialization error there
on `:webgl` usually means the installed `WGLMakie` version is outside
Masque's pinned compat range — see [Backends](@ref). Any other console
error alongside a widget that otherwise renders is worth reporting as a
bug rather than assuming it is expected.

### Tried WGLMakie and the canvas is blank

**Cause:** typically a version mismatch between the installed
`WGLMakie` and the one Masque's `:webgl` extension was verified
against, or the figure has no supported plot for `masque(fig)` to
introspect (zero-config on an empty `Axis3` renders the canvas but
nothing is interactive — that is expected).

**Fix:** check the `WGLMakie` compat bound in `Project.toml`; confirm
the figure actually has a plot call in it before `masque(fig)`.
Expecting drag-orbit **preview** on `:webgl` is the numeric-readout
path; see [Backends](@ref).
