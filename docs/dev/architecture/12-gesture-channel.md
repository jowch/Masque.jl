# 12. The gesture channel (#102)

The contract for frames shipped over `AbstractPlutoDingetjes.Display.with_js_link` while an
interaction is in progress. It governs those frames only; the committed value's path is [§5](05-bond-value.md) and
[§6](06-composition.md) Tier 2, unchanged.

The channel is general. Any interaction §12.2's rule routes to question 3 belongs on it,
including one a notebook author writes. Nothing here is specific to a camera — view manipulation
(#102) is the first case, not the definition. The obligations in §12.4 and §12.5, the discipline
in §12.6, and the rule in §12.7 bind every caller.

## 12.1 Gesture vs. data interaction

A **gesture** is a continuous, in-progress manipulation whose intermediate states no downstream
cell reads. A **data interaction** is a value a downstream cell reads: a click, a keyboard commit
([§11](11-keyboard.md)), a `selects`-ROI release, a bounds-only `ROIInteractable` release, a threshold-drag
release. A view-manipulation gesture's release is not one: it settles a camera, and a camera is
not a value the notebook reads.

These are separate channels, not two speeds of one. A gesture's in-progress frames carry no value
the notebook can see; producing that value is what a data interaction is for.

Not every gesture rides this channel. "Gesture" is the larger set: an in-drag ROI box is a
gesture and answers question 0, so it never leaves the browser. The channel takes only those
gestures §12.2 routes to question 3.

Classification follows §12.2's rule — not the interactable that produced the state, and not what
is being manipulated. For the drag interactables that settle an analysis value — `ROIInteractable`
and `ThresholdInteractable` — release is a data interaction and commits through `@bind` exactly as
a click does; only the in-drag behaviour differs. `ViewInteractable` settles a camera and
commits nothing.

## 12.2 The routing rule

Where an in-progress state lives is decided by four questions, in order:

0. Can the browser answer it alone from what the manifest already ships? → overlay-local, no
   channel and no Julia round trip ([§6](06-composition.md) Tier 0).
1. Does the notebook need this value? → `@bind`.
2. Must it survive static export? → precompute it and ship it via `published_to_js`.
3. Neither? → `AbstractPlutoDingetjes.Display.with_js_link` — a pull channel outside Pluto's
   state management.

Question 3 requires three noes: not answerable in the browser, read by no cell, not needed in an
export. Nothing else restricts which interaction, or whose code, uses the channel.

**Exhaust question 0 first.** It costs no round trip, no latency budget and no backpressure, and
it survives static export. The manifest already carries `AxisTransform` (so any coordinate
readout or inversion is local), per-element `payloads`, and a grid's values: the source matrix
when a cell is at least one screen pixel, and one source value per screen pixel otherwise
(`GRID_VALUES_MIN_SCREEN_PX`, `src/interactables.jl`).
What blocks a question-0 answer is more often output surface than data: the overlay is three
sibling SVGs with no raster layer (`frontend/src/mount.ts`), so an effect needing per-pixel output
has nowhere to draw.

**View manipulation (#102).** Panning or orbiting changes the image, not an overlay drawn over
it, and every hit region's projection depends on the camera: question 0 is no. No cell reads the
intermediate camera state, and an export has no kernel to drive a live gesture: questions 1 and 2
are no. It routes to question 3, and because the camera moves it carries the obligations in §12.4
and §12.5's second list.

**A live threshold preview.** An image plot with a hover intensity readout, a colorbar dragged to
set a threshold, a live preview of the masked image, and the committed threshold bound as output.
Its four parts route to three places. Readout and threshold line: question 0 — the manifest
carries the transform and, at display resolution, the cell values. Committed threshold: question
1, `@bind` on release. Preview: question 3 — no cell reads the mid-drag mask, an export has no
kernel to recompute it, and the browser cannot produce it once the mask is not locally
computable.

A pointwise mask stays question 0 on a sub-pixel grid: the manifest carries the source value
under each screen pixel, so the readout is local. The mask leaves question 0 when it stops being
pointwise, since morphology and connected components are neighbourhood-dependent. **Thresholding
is question 0; segmentation is question 3.**

The camera does not move in this case, so the projection and every hit region stay valid for the
whole drag: a new frame is owed, a new manifest is not, and hit-testing stays live — a hover
readout keeps working mid-drag. §12.4 and §12.5 divide on that line.

`roadmap.md` states the same four questions as its own framing note ("Where a value lives").
This section is the normative statement and carries the reasoning for each branch; the two must
not diverge.

## 12.3 What commits, and when

In-drag frames never touch the bond: no cell re-execution, no output replacement, no remount.
Producing and displaying a frame during a gesture is invisible to Pluto's reactivity.

A gesture that settles an **analysis value** — a threshold, an ROI's bounds — commits it through
`@bind` on release. For those, this channel moves the in-progress frames off `@bind` and leaves
the committed value's path unchanged.

**A view-manipulation gesture commits nothing.** `@bind` carries values the user asked for; a
camera position is operational state, not an analysis value. Pan, zoom and orbit live entirely on
this channel, with no bond at the end. A widget carrying a `ViewInteractable` is still bindable:
its bond reports the selection ([§5](05-bond-value.md)), which a view-only widget never updates.

**View state does not persist across a re-render.** The `with_js_link` closure is recreated when
the cell re-runs, so an upstream data edit returns the view to the figure's own limits. This
matches every other non-bond display state in Pluto, and [§5](05-bond-value.md)'s rule that the overlay is wiped on
every re-render. To persist a view, an author writes the `Ref` + `@bind` pattern explicitly and
accepts its tradeoffs (§12.8).

*Status:* implemented on `:cairo` (#102) and `:webgl` (#133). `ViewInteractable` commits nothing;
`_computed_payload`'s `:view` branch (`src/render.jl`) has retired — a `:view` computed payload
now fails loud (unrecognized shape) rather than converting, since no path ever sends one.
Both backends stream in-drag frames over this channel. What they ship differs (§12.5); the
no-commit contract does not.

## 12.4 Projection stays Julia-authored on every frame

No backend ships 3D or 2D coordinates to JS and reprojects them there. That holds everywhere
([§2](02-backends.md)'s `InteractionContext`; the client-side-GPU-camera non-goal in [§7](07-scope.md)'s backend-scope note). On
this channel it holds **per frame**: a gesture that changes what Julia projected accompanies
every frame with hit geometry Julia computed for that same state.

The trigger is a change to the projection, not a change to the picture:

- A gesture that repaints without moving the camera or the limits leaves every hit region in
  place — new frame, same manifest, nothing to suspend or rebuild.
- A gesture that moves the camera invalidates every hit region at once — frame and manifest
  travel together.

A gesture that moves the camera and ships a frame without a matching manifest, or that lets JS
derive geometry from a JS-owned camera, does not conform, whatever its performance.

#87 (3D orbit preview) rests on this clause: without per-frame re-projection an orbit leaves the
overlay at a stale azimuth/elevation.

## 12.5 Backend obligations (mechanism-independent)

For every frame on this channel:

- update the displayed frame;
- do not remount;
- do not re-execute a cell;
- never leave the overlay live over a frame it no longer describes.

Additionally, when the gesture changes what Julia projected (§12.4):

- accompany the frame with hit geometry Julia computed for the same state, and swap the frame's
  hit manifest atomically with it.

The second list is the expensive one and is owed only by camera-moving gestures. Applied
unconditionally it charges the cheap case a manifest rebuild it does not need and suspends
hit-testing that could stay live.

Mechanisms differ by backend and need not converge. `:cairo` re-renders and ships a fresh PNG
plus, when owed, a fresh manifest. `:webgl` has no PNG to ship: each frame is a fresh
`serialize_scene` of the same figure, deserialized onto the WebGL renderer the widget's
`<canvas>` already owns (`deserialize_scene` + `start_renderloop` on that screen; the previous
three.js scene is deleted first). The canvas is not recreated and `setup_scene_init` is not
called again, so the gesture does not open a second WebGL context. Hit geometry is the manifest
Julia built for that same camera, swapped in the same turn as the scene. A client-side camera
would be cheaper and would not be this mechanism (§12.4).

This is not #86. #86 is about a scene surviving Pluto *replacing* the cell output, which destroys
the `<canvas>`. A view gesture does not replace the cell (§12.3), so the canvas this frame paints
on is the one the current output already holds. #85 hides the wait for that frame: while a 2D pan
or wheel zoom is ahead of the channel, the data inside the axis viewport slides under the cursor
on an inner matrix. The base image itself is not transformed, so the axis frame, tick labels, and
the rest of the figure stay where they are; a copy of those pixels, clipped to the viewport,
carries the matrix, and so does the data `g` inside each overlay svg. A data-space hit uses the
content pixel under the cursor, and only when that cursor is inside the pan view. A layout point
outside the clip does not hit data the preview has hidden. The view rectangle stays in layout pixels, and legend, colorbar,
and axis chrome are siblings of that clip so a ring outside the viewport is not cut off. The
matrix comes off in the turn
the sent frame is actually visible — the image `load` on `:cairo`, the scene swap on `:webgl` —
leaving only the residual if the pointer has moved on. It is not a client camera, and it is not a
substitute for the frame itself. A wheel has no pointer release, so the terminal request is one
settle 150ms after the last notch. A new notch resets that wait. Orbit ignores the wheel.
**Backends differ in cost, never in the interaction contract:** conformance is judged
against the obligations above, never against a particular backend's mechanism.

## 12.6 Request discipline

- One in-flight request per widget.
- Coalesce intermediate pointer moves rather than queueing them — a burst collapses to the latest
  move, not a backlog to drain.
- Always await a round trip before issuing the next. Never fire-and-forget.
- Never a fixed-interval poll. `with_js_link`'s own docstring warns that polling at a fixed
  interval can make a notebook unusable.

The channel carries no backpressure of its own — `@bind` has Pluto's machinery between browser
and kernel, this has nothing — so a caller that ignores the list can saturate the kernel from one
pointer drag. A user-facing surface enforces the discipline in what Masque hands the author
rather than leaving it to the author.

**A handler on this channel runs outside Pluto's reactive graph.** It is an ordinary Julia
closure captured at render time. When the data it closed over is redefined upstream, nothing
invalidates the closure, re-runs it, or signals that its answers are stale: frames keep arriving,
computed against data the notebook no longer holds. This follows from being outside the graph and
has no framework fix.

## 12.7 Nothing carried on this channel is notebook state

`with_js_link` bypasses Pluto's state management by design: nothing it returns is recorded in the
notebook. A value that rides this channel is not recoverable, not reproducible from the saved
notebook, and invisible to every downstream cell. If it matters, it commits through `@bind`.

The rule applies per *transmission*, not per variable. The same quantity travels both channels at
different moments: mid-drag a threshold is a transient render parameter driving a preview nothing
downstream reads; on release that same threshold commits through `@bind`.
Previewing live *and* binding the settled value is the ordinary case, not a tension to resolve.
For a quantity that can commit at all, the question is never "does a cell read this variable?"
but "does a cell read this send?" — if it does, it is a commit and goes through `@bind`. A camera
never commits on any send, which is why §12.3 takes view manipulation off `@bind` outright rather
than splitting it per transmission.

## 12.8 Relationship to #83

A channel that never remounts removes #83's double remount for gestures: there is no remount to
double. View manipulation also has no bond at the end of the gesture, so the
self-referencing `@bind` cell that produces #83 is never written for it.

#83 is otherwise unaffected, and is not a Pluto defect: a self-referencing `@bind` cell is not a
sanctioned Pluto use case. Every path still going through `@bind` retains #83's behaviour,
including an author who opts into the `Ref` + `@bind` pattern to persist a view.

## 12.9 Prerequisites for a user-facing surface

An internal-only use of the channel can ship without these. A surface a notebook author reaches
cannot.

**Static export degrades loudly.** A live-pull widget in a static export has a dead channel — no
kernel answers a `with_js_link` call. The widget says so and disables the gesture rather than
failing silently.

Hanging is not the failure mode to design against: Pluto swaps `pluto_actions` for
`nothing_actions` in a static export, and `request_js_link_response` is not in its `actions_to_keep`
list, so the call returns `undefined` and Pluto's own `.then` on it throws synchronously on the
first request (`frontend/common/SliderServerClient.js`, `frontend/components/CellOutput.js`). A
`with_js_link` call in an export fails fast and loudly by construction. PlutoSliderServer takes the
same branch, so it does not rescue the case. What the widget owes is catching that throw and
degrading deliberately, not a timeout.

**A dead channel is detected at use time.** A render-time capability check cannot establish that
the channel is still live. Exporting does not re-render: `generate_html` serializes existing
notebook state via `notebook_to_js` (`Pluto/src/notebook/Export.jl`,
`Pluto/src/webserver/Dynamic.jl`), so the widget's HTML — and the `is_supported_by_display`
decision baked into it — was produced in a session where the kernel was live, and carries that
decision forward to a reader who has none. The degradation above cannot rest on
`is_supported_by_display`. These two are one decision: the degradation mechanism has to work in
exactly the case the capability check cannot see.

**A rendering seam exists.** Every interactable declares geometry; none declares rendering ([§3](03-interactables.md),
[§4](04-custom-interactions.md)). An author supplying a preview frame needs one. [§4](04-custom-interactions.md) holds that extension point; no API is
specified.

## 12.10 Open questions

Constraints a conforming implementation must satisfy. Each is unresolved. The channel itself
ships on both backends; this is what it does not yet decide.

- **Heavy-scene mitigation beyond `px_per_unit = 1`.** On `:cairo` the heavy scene is render-bound
  (the PNG), so a further downscale, a render-quality knob during the drag, or an accepted lower
  frame rate is still unresolved — which one, and at what threshold. On `:webgl` that lever does
  not shrink the frame: `scene_payload` does not resample, so in-drag and settle ship the same
  serialized scene and the cost is that payload, not a raster. Measurements for both are in
  `perf-findings.md`. A wheel zoom ends without a pointer release: one settle 150ms after the
  last notch (§12.5). That rule is separate from how heavy a single frame is allowed to be.
