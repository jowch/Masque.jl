# Masque.jl — Perf findings (Phase 0 spike)

> Resolves the payload/latency envelope left as an open unknown by the original design spike
> (superseded notes, kept in git history).
> A measurement spike, not a feature — it **bounds the scope** of every payload-heavy roadmap
> item after it (M2.3 tooltips, M4 animation, SVG output, multi-select return shape).
>
> Reproduce (numbers below re-run 2026-06-29, last reconciled for M2.3 template-tooltip design
> on PR #10 and confirmed unchanged for M4 box-select (commit `d05318f`) on 2026-06-29 and for
> Phase 2a bars/areas/spans on 2026-06-30 and Phase 2b polygon surfaces (commit `431bd99`) on
> 2026-06-30 and colorbar readout `valueaxis` field (PR #27) on 2026-06-30 and text labels
> (`TextInteractable`, this arc) on 2026-07-01 and re-run for WS-3D Axis3 core on 2026-07-02
> (manifest-shape change: new per-transform `is3d` key + z in 3-coord point payloads — envelope
> unchanged: scatter-1k manifest 38.0 KB, heatmap-200² 196.8 KB, 30-frame scrub 5.6 MB; the
> `is3d` key costs ~10 B/transform and z one float per 3-coord point, both noise at this scale)
> and re-run for the `SegmentInteractable` `tol` wiring (PR #66): manifest-shape change — a new
> per-`:segments`/`:polyline`-layer `"tol"` field (one small int, present only on that layer,
> not per element). Envelope unchanged: `bench/payload_envelope.jl`/`bench/stress.jl` don't
> exercise `SegmentInteractable` (only `PointInteractable`/`:circles`), so re-running reproduces
> the previous numbers byte-for-byte. Measured the delta by direct manifest inspection instead:
> one MsgPack int header+value (1–3 B), added once per `:segments`/`:polyline` layer, not per
> element/vertex — e.g. the parity corpus's `logscale`/`axis3`/`polaraxis`/`colorbar` line
> layers each gained exactly one `"tol": 12` entry (`test/fixtures/parity/*.{cairo,webgl}.json`
> diffs). Doesn't scale with plot size — negligible at any N.
> Whole-line `:lines` (#89) is the same shape of change: geometry is one flat vertex list
> per path, and each such layer ships that same per-layer `"tol"` int. The envelope benches
> still construct `PointInteractable` and heatmap fixtures only, so they contain no `:lines`
> layer and the published sizes are unchanged by construction;
> and re-run for the keyboard-navigation `label` field (this PR, 2026-09-15):
> manifest-shape change — a new optional per-layer `"label"` string field (screen-reader
> announcement prefix), present only when the `label` keyword is set on
> `PointInteractable`/`SegmentInteractable`/`RectInteractable`(list)/`PolygonInteractable`.
> Envelope unchanged: neither `bench/payload_envelope.jl` nor `bench/stress.jl` sets `label`
> on any fixture, so re-running reproduces the previous numbers byte-for-byte (scatter-1k
> manifest still 38.0 KB, heatmap-200² still 196.8 KB, 30-frame scrub still 5.6 MB). Measured
> the delta by direct manifest inspection instead, same method as the `tol` re-run above: one
> MsgPack string key ("label", 6 B header+bytes) + one string value, added once per labeled
> layer, not per element — `label = "Scatter"` costs 14 B total, `label = "Bars, quarterly
> revenue"` costs 30 B. Doesn't scale with element count — negligible at any N.
> and re-run for the figure-background tooltip theme + per-element `colors` accent (this PR,
> 2026-09-15): two manifest-shape changes — an optional top-level `"background"` string
> (always present; `masque()` ships the figure's own background colour) and an optional
> per-layer `"colors"` field (a uniform CSS string, or a shared palette + one index per
> element for colormap/categorical data), present only on a `PointInteractable(ax,
> p::Makie.Scatter)`-derived `:circles` layer whose colour resolves. Envelope unchanged at the
> KB-rounded numbers this file tracks: scatter-1k manifest still 38.0 KB, the ~50 B added
> rounding away at this precision (corrected 2026-09-19, PR #116 — this and the blend-highlight
> entry below previously misstated it as 38.1 KB), heatmap-200² still 196.8 KB (`:grid` layers
> never carry `colors`), 30-frame scrub still
> 5.6 MB (PNG-only, untouched by a manifest-only change). Measured the exact delta directly:
> `background` costs 28 B (key + `"rgb(255,255,255)"` value), once per manifest, not per
> layer or element; a uniform `colors` costs ~22 B (key + one CSS colour string), once per
> Scatter layer. `masque(f)`'s default un-coloured scatter already carries a uniform `colors`
> (Makie's own default marker colour) — 50 B total added to the scatter-1000 row above.
> A colormapped/categorical `colors` instead ships a shared palette (`_COLOR_PALETTE_SIZE =
> 32` stops) + one small int per element — bounded by the fixed palette size regardless of N,
> plus ~1–2 B/element for the index, not measured directly here since neither bench fixture
> sets a numeric/vector `color=`.
> and re-run for `LegendInteractable` (this PR, 2026-09-18): manifest-shape change — a new
> `:legend` transform + one `:rects` `HitLayer` per `Makie.Legend` block (auto-extracted the
> same way as `ColorbarInteractable`), and `HitLayer`'s only cross-layer field, an optional
> per-layer `"links"` (an array of string-id arrays, one per element, naming other layers to
> highlight together with the hovered/selected entry) — present only on a `LegendInteractable`
> layer. Envelope unchanged: neither `bench/payload_envelope.jl` nor `bench/stress.jl` builds a
> `Legend` (grepped both for `Legend`/`legend` — no hits), so re-running reproduces the previous
> numbers byte-for-byte. Measured the delta by direct manifest inspection instead, same method
> as the `tol`/`label` re-runs above: a 3-entry `axislegend` (two `lines!`, one `scatter!`, each
> auto-linked to its own layer), `build_manifest`'d and hand-sized with the same MsgPack byte
> model `bench/payload_envelope.jl` itself uses (`mp(...)`, not MsgPack.jl — MsgPack.jl can't
> pack the manifest's `NamedTuple` payloads without a declared `msgpack_type`, so it was not a
> fit here either). The whole 3-entry legend layer dict (id/kind/geometry/payloads/events/
> style/label/colors/template/links) is 341 B; its `"links"` field alone (`[["lines"],
> ["lines_2"], ["scatter"]]`) is 26 B, 32 B including the `"links"` key itself — once per
> legend layer, ~9–11 B/entry for a short single-id link list (grows with target-id-string
> length and link-list length per entry, same as any other string-keyed field; bounded by
> entry count, not plot size). Doesn't scale with plot size — negligible at any N.
> and re-run for the split blend highlight (this PR, 2026-09-18): manifest-shape change — the
> mark-derived hover outline dropped the per-layer default `"style"."stroke"` key (`hoverstyle`'s
> stroke is now `nothing`; the highlight split itself — three sibling top-level svgs, `mix-blend-
> mode` color-dodge/multiply/screen — is CSS/JS-only and adds nothing to the manifest). Envelope
> unchanged: neither bench fixture sets a custom `hoverstyle`, so re-running reproduces the
> previous numbers byte-for-byte (scatter-1k manifest still 38.0 KB, heatmap-200² still
> 196.8 KB). Measured the exact delta the same way as the `tol`/`label`/`links` re-runs above,
> with `bench/payload_envelope.jl`'s own `mp(...)` byte model: the dropped `"stroke" =>
> "#3A6F7C"` key+value pair is `_str(6) + _str(7)` = 7 B + 8 B = 15 B, once per layer — 15 B off
> the scatter-1k row's single `:circles` layer and 15 B off the heatmap-200² row's single
> `:grid` layer, both noise at this scale. Doesn't scale with plot size — negligible at any N.
> and re-run for the bond payload contract cleanup (#110/#109, this PR, 2026-09-19): #110
> changes an `InteractionEvent.payload`'s Julia *type* after `transform_value` has already
> received it — no manifest-shape change, no bench gate. #109 removes the element hit's
> `payload` from the upload (`layer`/`index` already let Julia recover it from its own
> manifest), which is the JS→Julia direction neither `bench/payload_envelope.jl` nor
> `bench/stress.jl` measures at all (both scripts say so in their header comments — they cover
> only the outbound base64/manifest terms; the "Full click round-trip" numbers below are the
> only ones that touch the upload, and are one-off Playwright measurements, not re-run here).
> Confirmed **neutral** by re-running both scripts: every manifest/PNG size byte-for-byte
> identical to the pre-#110/#109 baseline (scatter-1k manifest still 38.0 KB, heatmap-200²
> still 196.8 KB, 30-frame scrub still 5.6 MB, the STRESS A–C tables unchanged) — expected,
> since neither change touches anything the manifest ships. `bench/stress.jl`'s STRESS D–E
> rows failed to run under this reconciliation, from a pre-existing bug unrelated to this PR
> (confirmed reproducing identically on unmodified `main`): `stress()`'s warm-up timing line
> calls `mkfig()` a second time to build the `@elapsed` argument, so `mkint(mkfig())` builds
> the interactable against a different `Figure`/`Axis` than the one passed to `masque()`,
> which only breaks the sections (D onward) where `mkint` depends on the figure — the throw
> aborts the script there, which is why STRESS E never ran either, not because E's own bare
> `let` block (it has no `mkint` at all) depends on anything broken. Verified STRESS D's own
> manifest size directly instead (bypassing the buggy warm-up call): 10.24 MB, identical on
> this branch and on unmodified `main`.
> and re-run after fixing `bench/stress.jl`'s timing bug (issue #119, commit `226d9f2`,
> 2026-09-20): no manifest-shape change — the bug was purely in `stress()`'s `@elapsed` line,
> which called `mkfig()` (and, for STRESS D, `mkint(mkfig())`) a second time inline, so the
> interactable was keyed to a different `Figure` than the one rendered; `axis_id` failed loud
> for STRESS D and the script never reached STRESS E. The fix hoists a `fig2`/`ints2` pair
> before the timed call and times only `masque(fig2)`, warmed by the same `w` build as
> before — for STRESS A–C, `mkfig()` is still called exactly twice per case in the same order
> (once for `w`, once for the timed call), so the seeded RNG state — and every manifest/PNG
> byte it produces — is unchanged by construction. Confirmed: scatter-50k/100k/200k manifests
> still 1.88/3.83/7.72 MB, heatmap-300² still 442 KB (a 452 117-byte manifest — this doc
> previously rounded it to 441 KB; four small additive fields that landed since that number
> was last written account for the ~30 B difference, none of them from this fix: the
> top-level `background` key (+28 B, once per manifest), the dropped per-layer `style.stroke`
> (−15 B), and two per-transform fields that are always present regardless of value —
> `valueaxis` (+11 B; `null` on a non-colorbar axis like this one) and `is3d` (+6 B; `false`
> here). `tol`/`label`/`links` do **not** apply here — `tol` is code-gated to
> `:segments`/`:polyline`/`:lines` layers only (`src/render.jl`), and neither `label` nor `links` is
> set on this bench's heatmap fixture, so none of the three appear in its manifest; checked
> directly against the layer's keys), heatmap-1000² still 6 KB, and STRESS D still 10.24 MB —
> matching the value already verified by direct inspection in the `#110`/`#109` entry above. This is the
> **first run of `bench/stress.jl` to complete all five sections**; the corrected STRESS table
> is below, reported as a range across repeated runs rather than a single sample — this machine
> is a shared, multi-tenant box (other users' idle Pluto/Malt kernels run continuously in the
> background, and sibling agents' Playwright/`kind_sweep` runs come and go unpredictably), so no
> run here is truly isolated, and `stress()` takes one `@elapsed` sample per case with no
> repetition. Only scatter-100k came down by more than its own run-to-run spread — a real
> improvement, in the direction the fix predicts. Scatter-200k came out consistently *above* its
> previous single contaminated sample across all three runs — the opposite direction the issue
> predicted for the heaviest case — but by a margin comparable to its own spread, so call that a
> weak signal, not a settled one. Every other row, **including all three heatmap rows**, is not
> resolved at this sample size: scatter-50k's range nearly reaches its previous number, and the
> three heatmap rows moved between three runs and seven — round-1 review supplied two
> independent samples that fell outside a first three-run pass's reported ranges for two of
> them, which is why those three rows now carry seven runs each instead of three and a longer
> explanation than the other rows. See the STRESS table below for the exact ranges and that
> explanation.
> and re-run for the gesture channel (#102, commit `a9855b4`, 2026-09-20): no manifest-shape
> change to the STATIC widget — `build_manifest`/`masque()`'s own output is untouched; #102 adds
> a NEW per-frame response (`{png, manifest}`) on a separate channel (`with_js_link`), not a
> change to what `show`/`published_to_js` ship at mount. Confirmed by re-running both scripts
> twice each: every manifest/PNG size byte-for-byte identical between the two runs of each
> script and to the pre-#102 baseline (scatter-1k manifest still 38.0 KB, heatmap-200² still
> 196.8 KB, 30-frame scrub still 5.6 MB; every STRESS A–D manifest/PNG size identical across
> both runs). Render timings varied run-to-run as this file already documents for a shared
> machine. heatmap-1000² first measured at 302 ms and 316 ms during this reconciliation, above
> the recorded 97–227 ms span; two further runs on an otherwise-idle machine landed at 143 ms and
> 99 ms, inside it. The elevated pair was concurrent load from this session's own Pluto servers
> and kind sweeps, not a shift in the row — the 500²/1000² ordering was correct throughout. The
> row's 97–227 ms span stands unchanged, still with the "not resolved" caveat this file already
> carries for it. The gesture channel's OWN numbers — the `with_js_link` round trip itself —
> are new and are in their own section below
> ("Gesture channel (#102): the shipped `with_js_link` round trip"), measured directly against
> `Masque._view_render_frame` (the shipped closure, not the pre-implementation spike issue #102
> cites) via the new committed `bench/gesture_channel.jl`.
> #133 (2026-09-22) adds the `:webgl` per-frame response (`{scene, width, height, pxPerUnit,
> manifest}`, no PNG) on that same channel. The static mount payload is unchanged —
> `scene_payload` / `build_manifest` at `show` time are the same functions — so the envelope
> tables above were not re-run for it. The new frame's own cost is in
> "Gesture channel (#133): `:webgl` scene frames" below, measured by `bench/gesture_channel_webgl.jl`.
> baseline established after int-pixel geometry quantization, CairoMakie 0.15, Julia 1.12):
> - **base64-PNG / manifest / render numbers** — `julia --project=. bench/payload_envelope.jl`
>   (normal envelope) and `julia --project=. bench/stress.jl` (the 10× extremes). Both `seed!(0)`,
>   so PNG/manifest sizes reproduce *exactly* (render-ms is wall-clock, so it varies). These are the
>   committed, re-runnable numbers — they can't silently rot.
> - **Live click round-trip numbers** (the ms in the round-trip tables) — *one-off* measurements
>   from a headless Pluto kernel + Chromium (method documented inline); there is no committed
>   harness for these, so they are dated snapshots, not regenerated by the benches above.
> - **The `@bind` view-commit baseline** below is the same kind of one-off — a dated snapshot,
>   not regenerated by the benches above — and more so: its Playwright driver was run inline and
>   never saved as a file at all, so there is nothing to commit and nothing to re-run. The method
>   is written out next to the numbers instead, so it can be rebuilt by hand.

## The two payload terms

From `src/render.jl` `show`, a rendered cell ships two payloads (the click *return* value —
`{layer,index,payload}` — is tiny and not a factor):

| Term | Carried by | Cost driver | Regenerated |
|------|-----------|-------------|-------------|
| **base64 PNG** | HTML `<img src="data:…">` | output pixel area × visual density | every render |
| **manifest** | `published_to_js` (MsgPack on the wire) | #hit-elements × per-element payload | every render |

The "large base64 → editor lag" warning in Q5 is about the **PNG**. The manifest is the term
that **future features inflate** (tooltips, animation frames, multi-select).

**JS bundle (one-time, per page-load):** `assets/overlay.js` is inlined per cell and idempotent
(no repeated download cost). M2.3 bundled d3-format as the **first runtime JS dependency**, growing
the committed bundle **10 828 → 17 515 bytes raw minified** (+6 687 B raw; ~2–2.5 KB gzipped delta).
This is a one-time delivery cost per page-load, independent of manifest or PNG size.

PR #72 split `overlay.ts` into modules threaded through a shared `OverlayState`/`OverlayCtx`
object — object properties survive esbuild's identifier minification, so that refactor grew
`assets/overlay.js` **27 364 → 29 736 bytes** (+2 372 B), then to **35 133 bytes** after #75's
keyboard/a11y work. Enabling esbuild's `mangleProps: /_$/` (every frontend-internal
`OverlayState`/`OverlayCtx`/`ROIBox`/`Drag`/`FocusRef`/`Hit` field renamed to a trailing-`_`
convention — see `frontend-delivery.md`'s Bundle row) recovered most of that: **35 133 → 33 048
bytes** (−2 085 B, ~5.9%). `assets/masque-webgl.js` is unaffected (**1 173 bytes**, unchanged) —
`wgl-shim.ts` has no `OverlayState`-shaped internal properties to mangle, and its two wire-tag
properties (`__obs__`/`__t__`) are read via bracket notation specifically so `mangleProps` can
never touch them. Both bundles remain byte-identical across repeated `npm run build` runs.

The gesture channel (#102, commit `a9855b4`) added a new module (`frontend/src/gesture.ts`,
the request-discipline state machine) plus the frame-swap/manifest-rebuild path in `mount.ts` and
the request/settle wiring in `bond.ts`/`drag/view.ts`: `assets/overlay.js` **47 702 → 49 088
bytes** (+1 386 B, ~2.9%). `assets/masque-webgl.js` was then **1 179 bytes**, unchanged by
#102 — this doc's own count above was stale by 6 B, unrelated to that PR. #133 later added
the in-place scene swap to `wgl-shim.ts`; the shim is no longer a static-size spectator of
the gesture channel. Current numbers for the `:webgl` frame itself are in
"Gesture channel (#133): `:webgl` scene frames" below.

## Measured envelope

base64 PNG decoded size (KB) and manifest MsgPack size (KB), default 700px column (px_per_unit 2):

| Plot | PNG | manifest | note |
|------|----:|---------:|------|
| line, 10 pts | 51 | 0.5 | ~50 KB antialiasing/text floor for any plot |
| scatter, 100 | 35 | 4 | |
| scatter, 1 000 | 188 | 38 | typical interactive plot |
| scatter, 10 000 | 717 | 379 | manifest approaches PNG; both O(N) |
| heatmap, 50×50 | 30 | 13 | |
| heatmap, 200×200 | 190 | 197 | grid edges are compact, but `values[]` is O(cells) |

(Element geometry ships as `Vector{Int}` — quantized to integer pixels
([§9](architecture/09-wire-encoding.md)), so the
msgpack sizer counts each coord at 1–3 B, not Float32's flat 5. This trimmed the geometry term ~17 %
overall: scatter-1000 46→38 KB, scatter-10000 459→379 KB. Heatmaps barely move — their `values[]`
are *data* and stay Float32. The remaining per-element cost is now dominated by the payload's
Float64 `x`/`y`, not geometry.)

**The knee.** A realistic single interactive plot is **50–400 KB total** — at/just above the
"10–100 KB+ plausible" band from Q5, not below the "<10 KB" anecdote. Editor lag is not expected
here. It becomes a real risk only at the extremes below.

### What scales the manifest
- **Per-element count** is linear: ~38 bytes/element (3 Int geometry coords at 1–3 B each + a small
  payload whose `x`/`y` stay Float64). 10 000 elements → ~379 KB.
- **Heatmaps carry the full value matrix** (`:grid` geometry's `values[]`, O(cells)): 200×200 ≈
  198 KB. By design — that value already feeds the `{i,j,value}` hover readout; M2.3 confirmed
  no extra cost for heatmaps (template + tipStyle are O(1) per layer, not per-cell).
- **px_per_unit (display width)** scales the PNG ~quadratically with width but **does not** touch
  the manifest (geometry is pixel coords; the count is unchanged): scatter-1000 PNG 90 KB @300px
  → 187 KB @700px, manifest ~38 KB both.

### Render latency (Julia half of the click→re-render round-trip)
`@elapsed masque(fig)`, warmed, best-of-3. The click message is tiny and Pluto auto-throttles stale
events, so the felt latency is dominated by Julia re-rendering + re-encoding. Browser paint +
websocket transfer ride on top (needs live Pluto to measure — see Not measured).

| Plot | render + encode |
|------|----:|
| scatter 1 000 | ~70 ms |
| scatter 10 000 | ~280 ms |
| heatmap 200×200 | ~45 ms |

Sub-second for click selection across the board. The floor is the ~45–70 ms Cairo render.

### Full click round-trip (live Pluto + headless browser)
Measured end-to-end in a real Pluto kernel + Chromium: reproduce the overlay's exact bond commit
(`host.value = {layer,index,payload}` + `dispatchEvent(new CustomEvent("input"))`, what
`overlay.ts` does on click), then time until the downstream cell's re-rendered `<img>` lands in
the DOM. The downstream cell bakes the event index into the figure so a **genuinely new ~40 KB
PNG** is rendered, shipped over the websocket, decoded and painted each round-trip (the heavy
path, not just an overlay re-highlight). 15 samples, scatter-50:

| | round-trip |
|------|----:|
| median | **65 ms** |
| min | 61 ms |
| p90 | 121 ms |
| max | 241 ms |

The round-trip is **essentially the Julia render floor (~45–70 ms) plus only ~tens of ms** of
websocket transfer + decode + paint. So browser overhead is *not* the bottleneck — render time is.
Extrapolating with the render table: a scatter-10 000 click (~280 ms render + ~717 KB PNG over
localhost) lands well under ~400 ms. The client-side hit-test (~0 ms, not in this number) adds
nothing felt. Two caveats: localhost websocket (no network latency), and Pluto's selection
*re-highlight* is cheaper still (overlay-drawn → no new PNG, manifest-only round-trip).

### `@bind` view-commit baseline (drag-to-orbit release, this commit)

Measured **2026-09-19 at commit `e9a71f3`**, Julia 1.12.7, Pluto **1.0.3**, CairoMakie 0.15.14,
headless Chromium (Playwright) — a one-off measurement, more so than the round-trip numbers
above — no committed driver at all (see the header note). Pluto's version is recorded because the
double remount below depends on it: the scene's widget cell both defines the `@bind` and reads its
own previous bond value back, and a cell that does that is not a sanctioned Pluto use case
([issue #83](https://github.com/jowch/Masque.jl/issues/83), closed not-planned after the
mechanism was traced into Pluto's own bond-cache timing). Nothing about that shape is
contractual, so a different Pluto version can show a different remount count without that being
a regression.

Scene: `Axis3`, a 240-point helix `lines!` + a 12-marker `scatter!`,
`[ViewInteractable(ax), PointInteractable(ax, pts)]` as the interactable set, figure 480×360 at
`px_per_unit=2` (today's default). Driven through the real `masque(fig, ints)` with a deliberately
constructed self-referencing camera-`Ref` cell — the shape the shipped examples avoid:
`examples/demo.jl` has no view-manipulation cells at all, and `examples/view_manip.jl` uses the
opposite, acyclic shape (a plain `orb_seed` tuple, `@bind orb_ev`, and a separate
`orbit_committed` cell) precisely because Pluto forbids feeding a bond back into the same figure
cell (`examples/view_manip.jl`'s own markdown cell says so). Instrumented with `performance.now()`
at a synthetic `pointerup` dispatch, plus a poll on `.ip-host` node identity — identity-diffed
every 15 ms (not a fixed-interval `waitChange` poll) so the ~100–300 ms window isn't buried in
coarser polling noise. 12 drag-release trials.

**Reconstruction, not a committed driver** — not runnable as-written; captures the notebook cell
shape and measurement approach well enough to rebuild by hand:

```julia
# Cell A — once-init camera Ref, a separate Pluto cell so it does NOT re-run (and
# reset) every time cell B below does.
cam = Ref((0.4, 0.5))

# Cell B — the self-referencing @bind: this SAME cell both defines the bond (`ev`)
# and reads back its own previous value, which is the shape issue #83 investigated.
begin
    if @isdefined(ev) && ev !== nothing && ev isa InteractionEvent && ev.layer === :view
        cam[] = (Float64(ev.payload.azimuth), Float64(ev.payload.elevation))
    end
    fig = Figure(; size = (480, 360))
    ax = Axis3(fig[1, 1]; azimuth = cam[][1], elevation = cam[][2])
    ts = range(0, 6π, 240)
    lines!(ax, cos.(ts), sin.(ts), ts ./ 6; linewidth = 3)
    pts = Makie.Point3f.(cos.(ts[1:20:end]), sin.(ts[1:20:end]), ts[1:20:end] ./ 6)
    scatter!(ax, pts; markersize = 14, color = :tomato)
    @bind ev masque(fig, [ViewInteractable(ax), PointInteractable(ax, pts)])
end
```

```js
// Playwright, against the notebook above: dispatch a synthetic pointerdown/move/
// pointerup drag on the widget's `.surface`, stamp performance.now() at pointerup,
// then poll `document.querySelector(".ip-host")` identity every 15 ms — each
// distinct node identity seen after release is one remount.
```

| metric | p50 | p95 |
|---|---:|---:|
| release → bond value committed (Julia `masque()` done + Pluto's own reactive-run overhead) | 105.7 ms | 214.6 ms |
| release → **final** DOM update (last `.ip-host` replacement) | 201.5 ms | 294.6 ms |

Every one of the 12 trials produced exactly two distinct `.ip-host` node identities for one
release — the unsupported-shape double remount described in issue #83, reproduced live on this
Pluto version rather than only inferred from its description.

This section is the `@bind`-commit baseline #102 replaced for view manipulation. The
`with_js_link` gesture channel ships on both backends. `:cairo` numbers are in the next
section; `:webgl` numbers are in "Gesture channel (#133): `:webgl` scene frames".

### Gesture channel (#102): the shipped `with_js_link` round trip

Measured **2026-09-20 at commit `a9855b4`**, Julia 1.12.7, CairoMakie 0.15.14, against
`Masque._view_render_frame` **directly** (no browser, no Pluto kernel) via the new committed
`bench/gesture_channel.jl` — best-of-20 per phase after one discarded warmup call, `time_ns()`
around the closure call itself (mirrors issue #102's spike method: JS and Julia share one wall
clock per round trip in the real implementation, since the closure runs entirely inside the
kernel process). This is the Julia-side term only — no websocket transfer, no browser decode+
paint, which issue #102's own numbers put at a ~31–34 ms constant floor on top of whatever's
below (not re-measured here; `with_js_link`'s browser-side transfer/decode path is unchanged
from the spike).

Two scenes, matching issue #102's own measurements for direct comparison — `Axis3`, 240-point
helix `lines!` + 12-marker `scatter!`, `[ViewInteractable(ax), PointInteractable(ax, pts)]`,
figure 480×360 (light), the same +80×80 `surface!` (heavy) — plus a light 2D pan case (`Axis`,
6-point scatter, figure 500×320), since #102 ships pan as well as orbit:

| scene | in-drag (`ppu=1`) p50 | settle (mount `ppu`) p50 | PNG in-drag → settle |
|---|---:|---:|---:|
| light (helix + 12 markers), orbit | 11.1–11.3 ms | 24.2–25.5 ms | 56.5 KB → 139.2 KB |
| heavy (+80×80 `surface!`), orbit | 80.8–87.4 ms | 124.7–125.5 ms | 63.0 KB → 161.8 KB |
| light (scatter-6), 2D pan | 4.1–5.3 ms | 13.2–13.4 ms | 9.0 KB → 19.1 KB |

(ranges are two independent runs of `bench/gesture_channel.jl`, not a single sample.)

The manifest rebuild itself is not broken out separately here the way issue #102's spike did
(it instrumented `setcam`/`manifest`/`render`/`encode` as four sub-phases) — the shipped
`_view_render_frame` times the whole closure as one span, matching what `with_js_link` actually
measures end-to-end. The relative shape matches the spike's finding: `ppu=1` cuts the
heavy/light gap roughly in half (compare 11 ms/81 ms in-drag to 25 ms/125 ms at the mount ppu),
so the render term — not the manifest rebuild — is still what the heavy scene pays for, and
dropping resolution during the gesture is the lever actually being spent. The light scene's
in-drag numbers here (11 ms orbit, 4–5 ms pan) are close to or faster than issue #102's spike
total (which additionally paid `published_to_js`-equivalent serialization, browser transfer, and
`time_ns()`-vs-`performance.now()` clock differences the spike's own numbers folded in) — no
regression from the pre-implementation estimate.

**Not measured here**: the live Pluto + Chromium round trip (websocket transfer + `with_js_link`'s
own dispatch overhead + browser PNG decode+paint) — issue #102's spike measured that layer at a
~31–34 ms floor across all four of its configurations; nothing in `_view_render_frame`'s own
implementation should change that floor, since the wire shape (`{png, manifest}`, PNG as raw
bytes not base64) matches what the spike round-tripped. `test/e2e/kind_sweep.mjs`'s
`view/view-gesture-frame` check confirms a real frame lands end-to-end through an actual Pluto
kernel + headless Chromium, but does not time it. The discarded warmup this bench leaves out of
the timed trials is measured on its own in the view-warmup section below.

### Gesture channel (#133): `:webgl` scene frames

Measured **2026-09-22**, Julia 1.10.12, WGLMakie 0.13.15, against the same
`Masque._view_render_frame` closure as the `:cairo` section, on `:webgl`
(`bench/gesture_channel_webgl.jl`). Same three scenes, same best-of-20-after-warmup method, two
independent runs. No browser and no Pluto kernel — Julia-side only.

`:webgl` does not rasterize a PNG. `render` serializes the figure once per frame and records
`pxPerUnit` for the browser framebuffer (1 during the drag, the mount value on settle).
`scene_payload` does not resample, so the serialized scene is the same number of bytes at both
resolutions. Wire bytes are the binary length of every concrete numeric array in the value
(the dominant MsgPack term; same definition as `bench/webgl_payload_size.jl`). The JSON column
is `JSON3.write` of the scene alone, an upper bound, not the wire.

| scene | in-drag (`ppu=1`) p50 | settle (mount `ppu`) p50 | scene wire (both phases) | scene JSON |
|---|---:|---:|---:|---:|
| light (helix + 12 markers), orbit | 3.4–3.5 ms | 4.4–4.5 ms | 132.3 KB | 545.9 KB |
| heavy (+80×80 `surface!`), orbit | 3.4–3.5 ms | 4.5–4.6 ms | 522.2 KB | 1392.0 KB |
| light (scatter-6), 2D pan | 1.1–1.2 ms | 1.1–1.2 ms | 136.8 KB | 521.3 KB |

Frame wire (scene + manifest) is 0.1 KB above the scene on the two orbit rows and equal to it
on the pan row. The heavy scene is not render-bound on this path: it costs the same few
milliseconds as the light helix, and it pays in payload (522.2 KB wire, 1392.0 KB JSON) instead of
in a raster. Dropping `pxPerUnit` to 1 does not shrink that payload. It only tells the browser
to draw into a smaller framebuffer. Transfer and three.js deserialize/paint are not in this
table. `test/e2e/kind_sweep.mjs`'s `view/view-gesture-frame` check is what confirms a frame
lands on the live canvas. The discarded warmup this bench leaves out of the timed trials is
measured on its own in the next section.

### View warmup runs after the mount HTML

Measured **2026-09-22**, Julia 1.10.12, `OPENBLAS_NUM_THREADS=1`, two fresh processes per
backend via `bench/view_warmup.jl`. Same three scenes
as the gesture-channel benches. No browser and no Pluto kernel. `published_to_js` is stubbed to
`null`; the Cairo PNG is already on the widget and is written into the `<img>`. On every row the
mount HTML was written before the discarded frames started, and the camera matched the mount
image again after they finished.

`masque` is the mount render. `show` writes that HTML and returns. The discarded frames run
after that. "cold" is the first widget of that scene in the process. "warm" is the next
identical widget, after those methods exist. Scenes run light orbit, then heavy orbit, then 2D
pan, so the heavy and pan rows do not repeat the light orbit's first-call compile. A drag that
arrives while the discarded frames are still running waits for them and then renders.

Orbit discards four frames: an azimuth nudge, an elevation nudge, a farther pose, then a settle
at the original angles. Pan discards three: an x shift, a y shift, then a settle. Times below
are those frames in that order, milliseconds, as a range across the two processes.

| backend | scene | pass | `masque` | `show` | discarded frames | drag p50 | settle p50 |
|---|---|---|---:|---:|---|---:|---:|
| cairo | light orbit | cold | 1509–1564 | 86–87 | 1502–1546, 10, 194–196, 22–36 | 8.2–8.3 | 19.3–19.4 |
| cairo | light orbit | warm | 21–22 | 0.5 | ~9, ~9, ~9, ~33 | 7.9 | 18.3–19.0 |
| cairo | heavy orbit | cold | 193–209 | 0.6 | 219–247, 65–66, 77–79, 99–103 | 61–63 | 92 |
| cairo | heavy orbit | warm | 105–129 | 0.6–0.7 | ~66, ~65, ~78, 100–161 | 62–63 | 92–93 |
| cairo | 2D pan | cold | 116–117 | 0.1 | ~39, ~5, ~12 | 3.2 | 10.4–10.6 |
| cairo | 2D pan | warm | 13 | 0.1 | ~4, ~4–5, ~11–12 | 3.1–3.3 | 10.5–10.9 |
| webgl | light orbit | cold | 2152–2170 | 118–131 | 1310–1370, ~5, 324–333, ~5 | 3.2–3.3 | 3.5 |
| webgl | light orbit | warm | 11–12 | 0.1 | ~4, ~4, ~5, ~5 | 3.3–3.6 | 3.5 |
| webgl | heavy orbit | cold | 44–46 | 0.1 | 122–130, ~4–5, ~5, ~5 | 3.4 | 3.6–4.2 |
| webgl | heavy orbit | warm | 12–13 | 0.1 | 4–21, ~4, ~5, ~5 | 3.2–3.3 | 3.4–3.7 |
| webgl | 2D pan | cold | 101–103 | 0.1 | 509–527, 13–14, ~2–3 | 1.2 | 1.1–1.2 |
| webgl | 2D pan | warm | 8 | 0.1 | ~2, ~3, ~2 | 1.2 | 1.2–1.4 |

The first discarded orbit frame is the gesture-path compile, about 1.5 s on Cairo and 1.3–1.4 s
on WebGL. It runs after `show` has written the HTML. The farther pose adds about 0.2 s on Cairo
and about 0.3 s on WebGL, once, on that first orbit. The mount compile stays in `masque`: the
first Axis3 in a process is 1.5–1.6 s on Cairo and 2.2 s on WebGL before the HTML exists. Later
widgets pay the mount render only (Cairo light ~22 ms, Cairo heavy 105–129 ms, WebGL ~12 ms).

Once those methods exist, the discarded frames are ordinary renders. Cairo heavy is the
expensive steady case, a few hundred milliseconds of raster after the HTML is already written.
Warm WebGL stays around 20 ms even with the 80×80 surface, and the drag p50 matches the
`:webgl` table above. The first 2D pan still compiles its own limit updates: about 40 ms on
Cairo, about 0.5 s on WebGL, in the first discarded frame, also after the HTML.

A drag during a warm warmup waited about the sum of the discarded frames plus one in-drag
frame. One sample each: Cairo light 59–72 ms, Cairo heavy 380 ms, WebGL light 25–39 ms, WebGL
heavy 38 ms. Two further samples waited longer (Cairo light 273 ms, WebGL light 180 ms) while
the frames themselves still added up to the short number, so that extra time was outside the
renders. The first `show` in a process is 86–131 ms and later shows are under 1 ms; that cost
is inside the HTML write.

Drag and settle here are a p50 of 5 after the discarded frames, not the best-of-20 in the
tables above, and the Cairo steady numbers there were taken on Julia 1.12.7. This section does
not replace those tables.

## Stress test — the extremes (where it stops being render-bound)

Pushing past the normal envelope (live round-trips + a pure-Julia sweep to 10× the sizes above):

**Live round-trip vs total payload — the crossover.** Same method as above, heavier downstream:

| Downstream re-render | PNG | manifest | round-trip (median) | render floor | non-render overhead |
|----------------------|----:|---------:|--------------------:|-------------:|--------------------:|
| scatter 50 (tiny) | 40 KB | ~3 KB | 65 ms | ~50 ms | ~15 ms |
| scatter 10 000 | 768 KB | 459 KB | 335 ms | ~280 ms | **~55 ms** |
| heatmap 1000×1000 | 2.13 MB | **4.78 MB** | **553 ms** | ~260 ms | **~290 ms** |

> These two rows are **pre-change live snapshots** (dated, not regenerated). The wire format has since
> shrunk both manifests: scatter-10000 is now ~379 KB (int-pixel geometry, this PR), and the 1000²
> heatmap ships ~6 KB (its sub-pixel `values[]` is dropped by the PR #8 cap), so that exact heatmap is
> now **render-bound** (a few hundred ms at most — not resolved to a single number at this sample
> size; see the STRESS table below and its note), not the 553 ms payload-bound case shown, since
> even the widest observed sample for this row is still well under it. The 553 ms remains a
> valid datapoint for *what a 4.78 MB manifest costs* — it just no longer occurs by default.

(PNG sizes here are the live browser-measured transferred bytes; manifest sizes are from the bench.
The render floor is bench `masque(fig)` — it excludes the `published_to_js` msgpack serialization
of the manifest, which happens at `show` time and is part of the non-render overhead.)

Below ~1 MB total, the round-trip is **render-bound** and browser/transfer overhead is a near-constant
~15–55 ms. Above a few MB it flips to **payload-bound**: the 553 ms above is mostly *not* render — it's
`published_to_js` msgpack-serializing a 4.78 MB manifest + shipping ~7 MB over the wire + paint. Nothing
crashed; it degrades gracefully into the half-second range. The crossover sits around **~1–10 MB total**.
Post-wire-shrink (int-pixel geometry + the `values[]` cap), the case that *reaches* that regime by
default is **high-N scatter** (200 000 pts → 7.72 MB manifest), not heatmaps — the cap keeps even a 1 M-cell
heatmap render-bound.

**The manifest is the high-N wall, not the PNG** (pure-Julia sweep, `bench/stress.jl` at commit
`226d9f2` — the first run of this script to complete all five STRESS sections; see the
reconciliation entry above). Render times are reported as the min–max **range across repeated
runs**, not a single sample, because this machine is a shared multi-tenant box that cannot be
verified quiet (see above) and `stress()` takes one `@elapsed` sample per case. Scatter and
STRESS D are from three runs; the three heatmap rows are from seven, after an initial three-run
report of those rows turned out not to hold up under two more independently-run samples posted
during round-1 review (see below the table):

| Case | PNG | manifest | render |
|------|----:|---------:|-------:|
| scatter 50 000 | 791 KB | 1.88 MB | 810–935 ms (3 runs) |
| scatter 100 000 | 303 KB | 3.83 MB | 1 499–1 552 ms (3 runs) |
| scatter 200 000 | 71 KB | **7.72 MB** | 3 117–3 369 ms (3 runs) |
| heatmap 300×300 (cells visible) | 388 KB | 442 KB | 33–84 ms (7 runs) |
| heatmap 500×500 (cells sub-pixel) | 1 009 KB | 3 KB | 57–206 ms (7 runs; see note) |
| heatmap 1000×1000 (cells sub-pixel) | 2.26 MB | **6 KB** | 97–142 ms (7 runs; see note) |
| scatter 50 000 + 200 B payload/elem | 47 KB | **10.24 MB** | 1 248–1 340 ms (3 runs) |

One case is a resolved improvement, in the direction the fix predicts, because the drop is much
larger than the run-to-run spread: scatter 100 000 (previously ~1.6 s, now tightly 1.50–1.55 s).
Scatter 200 000 sat consistently *above* its previous single contaminated sample (~3.0 s) across
all three runs (3.12–3.37 s) — the opposite of the issue's expectation that the heaviest case,
where the removed confounder scales with scene weight, would benefit *most* — but the 8% spread
between the three runs is close enough to the ~4–12% apparent shift that this is a weak signal,
not a settled one. **Every other row, including all three heatmap rows, is not resolved at this
sample size.** Scatter-50k's 810–935 ms range nearly reaches its previous ~940 ms number.

The heatmap rows deserve the longer explanation, because an earlier version of this table got
them wrong. A first pass reported three runs each and called heatmap-300² and heatmap-500² tight
resolved improvements; two independently-run samples posted during round-1 review broke both
claims immediately — heatmap-300² came back at 34 ms and 77 ms (77 ms is *above* the ~50 ms
figure it was supposedly beating), and heatmap-500² came back at 47 ms and 201 ms (a 4.3× miss
off the "tight" 201–203 ms this doc had just reported, 201 ÷ 47 ≈ 4.3). Four more of my own
runs confirmed the reviewer's numbers were not a fluke of their machine: heatmap-300² across my
seven runs spans 33–84 ms, and heatmap-1000² spans 97–142 ms; the reviewer's 129 ms sample for
that row falls inside my seven-run range, but the reviewer's other sample, 227 ms, sits above
it. Heatmap-500² is the strangest: six of my seven runs land tightly in 201–206 ms, and the
seventh (run under incidental load from a concurrent test suite) plus the reviewer's
independent run both landed near 47–57 ms — two low outliers from two different environments,
not one fluke. Something
about this specific case has (at least) two distinct regimes, and *this bench does not measure
what causes it* — no hypothesis (contention, GC, cache state) is asserted here, because none has
been tested. The table above reports my own seven-run range for each heatmap row; counting the
reviewer's independent samples too widens heatmap-500² down to 47 ms (10 ms below my own low
outlier, 57 ms) and heatmap-1000² up to 227 ms (85 ms above my own high end). Treat every
heatmap render number here as **not resolved**, full stop, not as a point estimate with error
bars.

STRESS D (scatter 50 000 + 200 B payload/elem) and the new heatmap 500×500 row have no valid
prior number to compare against — D never completed before this fix, and 500×500 was never in
this table: `stress()`'s loop always sampled `d ∈ (300, 500, 1000)`, but the original table only
carried the two endpoints. Heatmap 500×500 is **sub-pixel, not visible** — like 1000×1000, it
drops the `values[]` payload (confirmed directly: `masque()` emits `Masque: heatmap/image grid
cells are ~0.69 px on screen (sub-pixel); dropping the values[] payload…` for this case, and its
manifest has no `values` key). The 300²/500² boundary, not 300²/1000², is where cells stop being
individually targetable at this figure's default column width. Heatmap-500×500's manifest (3 KB)
is smaller than the 1000×1000 row's (6 KB) because the sub-pixel cap ships grid *edges*
(`nrows+1`/`ncols+1` entries), not per-cell values, so it scales with √cells, not cells.

- **PNG is non-monotonic in N** — past saturation, dense random scatter compresses to a near-solid mass
  (200 000 pts → only 71 KB), while the **manifest grows strictly O(N) to 7.7 MB** (int-pixel geometry,
  this PR; was 9.28 MB at Float32). At high element counts the manifest, not the image, is the ceiling.
- **Heatmap render is much cheaper than the multi-second high-N scatter case, though the exact
  figure is not resolved at this sample size** (33–227 ms across all rows and all runs recorded
  in the STRESS table above and its note — see there rather than a single bound here) — Cairo
  blits the raster. The manifest carries the value matrix (O(cells)) **only while cells are
  targetable**: at 300² (visible) it's 442 KB, but from 500² up the cells go sub-pixel and the
  values cap (PR #8) drops the matrix (500² → 3 KB, 1000² → 6 KB). So a giant heatmap is no
  longer the payload wall it was; high-N *scatter* is.
- **Raw canvas pixels are *not* a payload driver for sparse content**: a 3200×2000 figure with 2 000
  points produced a *smaller* PNG (132 KB) than a 600×400 one — density drives PNG size, not resolution.
- **What actually shrinks the multi-MB manifest** (de-speculated by `bench/encoding_experiment.jl`, real
  MsgPack bytes — see the encoding experiment below): **int-pixel geometry** (−58% on the geometry term,
  no structural change) and **capping heatmap `values[]`** (−499×). **Both now shipped** — the values cap
  in PR #8, int-pixel quantization here. The TypedArray binary fast-path, which I first guessed was the
  lever, buys only ~5% over int-quantization and is *not* worth the manifest-shape change.

### Encoding experiment (de-speculation)
`bench/encoding_experiment.jl` MsgPack-encodes a real 50k-circle geometry and a 1000² heatmap `values[]`
under each scheme — replacing theoretical byte math with measured wire bytes:

| Encoding | bytes/coord | 50k circles | note |
|----------|------------:|------------:|------|
| `Float32` (current, nested or typed) | 5.00 | 732 KB | baseline |
| **int-pixel quantized** (generic) | **2.10** | **307 KB** | **−58%, no manifest-shape change** |
| Int16 raw binary (Pluto TypedArray) | 2.00 | 293 KB | only ~5% beyond int-quant → not worth the rewrite |

| Heatmap 1000² `values[]` | size |
|---|---:|
| with `values[]` (uncapped) | 4.78 MB |
| capped → `{i,j}` only | 9.8 KB (**499× smaller**) |

Both wins **shipped**: the `values[]` cap in `52f174c` (PR #8), and **int-pixel geometry quantization
in PR #9** (element geometry vectors are `Int`,
[§9](architecture/09-wire-encoding.md)). The
experiment's −58%/2.10-B-per-coord is the *geometry-term* saving; on a whole realistic manifest (where
the payload's Float64 `x`/`y` dilute it) it lands ~17 % — see the envelope table. AxisTransform stays
Float64. The measured experiment numbers above are unchanged — they just describe what now ships.

**Conclusion:** the cheap, non-structural wins (int-pixel coords + `values[]` cap) capture essentially all
of it; the structural typed-array fast-path does not earn its cost. `Float16` is a non-starter (no MsgPack
float16; lossy >2048px). Keep `AxisTransform` lims `Float64` (drag inversion) — quantize geometry only.

## Scope bounds for downstream phases

- **Phase 2a bars/areas/spans** *(delivered, 2026-06-30)* — Hist, Waterfall, CrossBar, HSpan,
  VSpan now auto-extracted as `:rects`. The payload schema grew from `(; index)` to a semantic
  shape per surface type (a few numbers per element — see
  [§3](architecture/03-interactables.md) bar
  payload schema). Bars/spans are inherently low-N (tens to low hundreds of elements for any realistic
  chart), so the per-element payload growth has negligible envelope impact. Bench re-run
  (2026-06-30) confirms the §A envelope is unchanged — see §A. No new manifest terms, no new
  per-element geometry (`:rects` was already quantized); the only wire change is richer payload
  fields per bar element.

- **Phase 2b polygon surfaces** *(delivered, commit `431bd99`, 2026-06-30)* — Band, Density,
  Contourf, Violin, Voronoiplot, BoxPlot now auto-extracted as `:polygons` (plus `:rects` for
  un-notched BoxPlot bodies). Ring geometry ships as a `Vector{Vector{Real}}` — one subvector per
  polygon element, flat `[x0,y0,x1,y1,…]` — with vertex coords quantized to integer pixels (the
  same 1–3 B/coord path as scatter; see
  [§9](architecture/09-wire-encoding.md)). Bench §F (2026-06-30,
  `bench/payload_envelope.jl`):

  | Surface | elements | total verts | manifest | ~B/elem | ~B/vert |
  |---------|--------:|------------:|--------:|--------:|--------:|
  | band, 100 x-pts (1 ring) | 1 | 200 | 1.5 KB | 1 494 | 6 |
  | violin, 3 groups (~400 verts/ring each) | 3 | 1 206 | 7.3 KB | 2 479 | 6 |
  | contourf, 50×50, default levels | 20 | 1 780 | 10.5 KB | 537 | 6 |

  The fundamental rate is **~6 B/vertex** (2 coords × ~3 B each at typical 700-px plot widths),
  consistent across all polygon kinds. Per-element cost is vertex-count-driven: a violin KDE ring
  (~400 verts) is ~2.5 KB/element — far above scatter's per-element cost (§A) — because the ring
  boundary is large. But realistic polygon charts have low element counts: a 3-violin plot is 7.3 KB
  total; a 20-piece contourf is 10.5 KB total — both well under the render-bound / payload-bound
  crossover (~1 MB). A high-cell voronoiplot (e.g. 1 000 cells, each a few vertices) could reach
  scatter-scale manifest sizes (scatter per-element × 1 000 → a few hundred KB; cf. §A), but is still
  render-bound. The §A–E envelope is
  **unchanged** — bench re-run (2026-06-30) confirms all existing scatter/heatmap numbers are
  identical; the `:polygons` term is an addition, not a modification of prior geometry kinds.

- **Text labels** *(delivered, this arc, 2026-07-01)* — `text!` and `annotation!` labels
  auto-extracted as `:rects` click-to-pick buttons (`TextInteractable`); no new geometry kind (rides
  the same primitive as bars/heatmap cells). The only new wire term is the payload's `text` string —
  `(; text, index, x, y)` replaces `(; index, x, y)`. Bench §G (2026-07-01, `bench/payload_envelope.jl`):

  | Case | labels | manifest | ~B/label | geometry | payload |
  |------|-------:|---------:|---------:|---------:|--------:|
  | scatter+labels (picker, 5 short labels) | 5 | 0.8 KB | 51 | 8 B (4-int `:rects` box) | 43 B |
  | text-only (100 labels, ~4-char strings) | 100 | 4.9 KB | 47 | 8 B (4-int `:rects` box) | 39 B |

  Per-label cost is **tiny and render-bound**: the `:rects` box is the usual 4 quantized ints
  (~8 B), and the payload is one short string (`text`) plus three numbers (`index`, `x`, `y` —
  `y` and `x` stay Float64 like every other point-anchored payload, `index` is a small int) — a few
  tens of bytes total, in the same range as a bar-chart element (see Phase 2a above), not a
  polygon-ring element (see Phase 2b above, ~hundreds–thousands of B/elem). Text is also inherently
  low-N: unlike scatter points, labels need screen-space room to stay legible, so realistic figures
  carry tens, not thousands, of them — a 100-label figure (already a dense label grid, not a
  realistic chart) is still under 5 KB. The §A–G envelope is **unchanged** — bench re-run
  (2026-07-01) confirms all existing scatter/heatmap/polygon numbers are identical; the text term is
  an addition, not a modification of prior geometry kinds.

- **M2.3 Richer tooltips** *(delivered, PR #10)* — the original
  prediction was correct: shipping per-element tooltip strings would grow the manifest by `Σ(tooltip
  bytes)`. Measured upper bounds (bench section B / Stress D): 1 000 elements × 200-byte HTML each =
  +196 KB (14 → 210 KB); 50 000 elements × 200 B each = **10.24 MB manifest**, 1.25–1.34 s render
  alone across three runs (STRESS D, `bench/stress.jl` commit `226d9f2` — see the reconciliation
  entry above; a live round-trip would add browser/transfer time on top). M2.3 avoided this by
  design: the per-element `tooltips[]` array was **not shipped** in the manifest. Instead, each
  layer that has a tooltip carries two O(1)-per-layer terms — `template` (a small segments
  array evaluated per hover) and a top-level `tipStyle`
  (CSS-var dict). The **default per-element envelope is unchanged** — confirmed by M2.3 bench
  re-run: scatter-1000 → 38 KB manifest, scatter-10000 → 379 KB manifest. The JS bundle grew by
  ~6.7 KB raw (10 828 → 17 515 B) to bundle d3-format (see "Two payload terms" above); this is
  a one-time delivery cost, not a per-manifest term.
- **M4 Animation / scrubbing** — frames are pre-baked PNGs: **total = frames × per-frame PNG**.
  Measured: a 187-KB plot × 30 frames = **5.5 MB**, × 120 = **22 MB**. This is the hard ceiling
  of the roadmap. Animation **must** shrink per-frame cost (smaller canvas / lower px_per_unit /
  fewer frames) or it trips the "framework-revisit" payload trigger. A naive full-res scrub is
  not viable. (Stress: a 1200×800 / 5 k-scatter frame is 492 KB → 300 frames = 144 MB, 1000 = 481 MB.)
- **SVG output path** — out of this bench (raster only). The roadmap already gates SVG behind a
  primitive-count viability spike; the PNG floor here (~50 KB even for 10 points) is the number
  SVG must *beat* to be worth it for sparse plots.
- **`ViewInteractable` / `:view` kind** *(drag-to-pan/orbit, this PR)* — one full-viewport bbox
  layer + mode/`azimuth`/`elevation` fields. Envelope impact is noise relative to PNG + per-element
  geometry (same order as a single ROI layer). Full `bench/payload_envelope.jl` re-run deferred;
  reconcile on the next manifest-shape change that adds per-element or frame payload.
- **Multi-select / box-select** *(delivered, M4 commit `d05318f`)* — the M4 wire change is a
  single small `selects` string per selector ROI layer (added to the outbound manifest); the
  selection vector or region descriptor is the **inbound** `@bind` return value, not part of the
  outbound manifest envelope measured here. The §A envelope cases contain no selector layer, so the
  `selects` string never appears in them — the 2026-06-29 bench re-run therefore confirms §A is
  unchanged trivially (the term simply isn't exercised there). When a selector *is* present it adds
  one short string per selector ROI layer to the outbound manifest; on the inbound path a selection
  is K events × ~tens of bytes (or a fixed-size region descriptor) — never a size concern. The
  contract change, not the size, was the work.

- **Colorbar readout (`valueaxis` field)** *(delivered, PR #27, 2026-06-30)* —
  `AxisTransform` gains a `valueaxis::Union{Nothing,Symbol}` field (serialized as `valueaxis?: "x"|"y"|null`
  in MsgPack). For all non-colorbar transforms it serializes as `null` — one nullable key per
  transform entry, negligible at the KB scale of the §A envelope. A colorbar contributes one
  additional `:axis` HitLayer (bbox geometry — four integer coords, a handful of bytes) and its own
  `AxisTransform` entry with `valueaxis: "x"` or `"y"`. Bench re-run (2026-06-30,
  `bench/payload_envelope.jl`) confirms the §A–F envelope is **unchanged** within noise — the
  `valueaxis` field and the colorbar `:axis` layer are invisible at the KB scale of the envelope
  table. The §A scatter/heatmap numbers are identical to the previous run.

## JS hit-test microbenchmark

Every claim above that "hit-test is ~0 ms" was from the pure-Julia render sweep, which doesn't
touch `frontend/src/geometry.ts`'s `hitTest`. `frontend/bench/hit_test.bench.ts` (`npm run bench`,
committed) times `hitTest` directly: for each kind × N, build one `HitLayer` of N random elements
scattered over a 4000×4000 px canvas, and time 2000 query points (one warm-up pass discarded) two
ways — **mixed** (random points over that same canvas) and **miss** (one point guaranteed to miss
every element). The two diverge for `circles`/`rects`: `hitLayer` returns on the first hit, so a
**mixed** query's cost depends on the *hit rate*, which rises with density — at fixed canvas size
and growing N, mixed stops measuring a scan and starts measuring the early-return path. **miss**
is the O(n) worst case (and the realistic case for hovering empty space on a sparse plot);
`segments`/`polyline` have no early exit at all, so their mixed and miss numbers agree. `grid`
(`findBin`, this PR's change) is timed the same way over an m×m-cell grid spanning the canvas —
every mixed query lands in some cell (100% hit rate) so mixed and miss both exercise the binary
search, just from different starting points.

Run 2026-09-14, Linux x86_64 (single workstation core), Node v24.15.0, `npm run bench` (commit
introducing this section: see PR #68):

| kind | N | mixed hit rate | mixed median (µs/call) | miss median (µs/call) |
|------|---:|---:|---:|---:|
| circles | 1 000 | 1.5% | 2.1 | 2.1 |
| circles | 10 000 | 16.0% | 19.1 | 19.2 |
| circles | 50 000 | 60.4% | 75–77 | 96–97 |
| circles | 200 000 | 97.4% | 73–77 | **380** |
| segments | 1 000 | 2.7% | 29.4 | 28.1 |
| segments | 10 000 | 25.1% | 294 | 294 |
| polyline | 1 000 | 0.0% | 28.5 | 29.0 |
| polyline | 10 000 | 0.7% | 284 | 289 |
| rects | 1 000 | 0.4% | 2.1 | 2.1 |
| rects | 10 000 | 5.8% | 19.9 | 19.7 |
| grid, 100×100 cells (202 edges) | — | 100% | 0.5 | 0.1 |
| grid, 1000×1000 cells (2002 edges) | — | 100% | 0.3 | 0.1 |

`circles`/`rects` **mixed** numbers look sub-linear from 50k→200k because the hit rate climbs
from 60% to 97% at fixed canvas size — that's early-return doing its job on *this benchmark's*
density, not evidence hit-test itself is sub-linear. The **miss** column is the true O(n) scan
cost and the number to read as the worst case: at 200k circles, one guaranteed-miss `hitTest`
call costs **~0.38 ms**. `segments`/`polyline` have no early exit (every query walks the full
element list to find the nearest segment) and scale linearly with N regardless of hit rate, ~10×
per decade as expected for O(n). `grid`'s binary search stays sub-microsecond even at 1000 edges
per axis (2000 comparisons/hover under the old linear scan, ~11 under the new binary search) —
not literally O(1) as an earlier draft of this section and `roadmap.md` said, but fast enough that
the distinction is invisible at these sizes.

**Conclusion: even at 200 000 circles (worst-case miss) or 10 000 segments, one `hitTest` call
costs well under 0.5 ms — three orders of magnitude below the render floor (tens of ms) and
manifest-transfer cost (hundreds of ms at the multi-MB extreme, see the stress test above).**
This confirms, with a direct hit-test measurement rather than an inference from render time, that
a spatial index (quadtree/grid bucketing) is not justified by the data: the wall a user would
actually feel is still payload size, not hit-test CPU. `docs/dev/roadmap.md`'s spatial-
acceleration lines cite this section rather than restating these numbers.

## MsgPack fast-path (Q5 sub-claim)

`published_to_js` always serializes via **MsgPack** (not JSON) — confirmed by the format Pluto
uses for published objects. The *TypedArray binary fast-path* (the Q5 "MsgPack fast-path") only
kicks in for top-level typed numeric vectors (`Vector{UInt8}`/`Vector{Float64}`…). **Our manifest
root is `Dict{String,Any}` with `Any[]` layers**, so the bulk serializes as generic MsgPack
maps/arrays, *not* binary blobs — even though leaf geometry is `Vector{Float32}`, it's nested
inside `Any` containers. Practical impact is small at normal sizes, but at the multi-MB extreme
(scatter-200k → 9.3 MB, heatmap-1000² → 4.78 MB) the generic-map serialization is exactly the
~290 ms non-render cost the stress round-trip exposed. **But the fix is *not* the fast-path** — the
encoding experiment above measured that engaging it (lifting geometry to a top-level typed vector)
buys only ~5% over plain int-pixel quantization, which already gets 58% *inside* the current
`Dict/Any` structure. So the manifest-shape rewrite is rejected; int-pixel coords + capping
`values[]` are the committed wins.

## Not measured (deliberately deferred)

- **Editor-lag knee** — the actual point where the Pluto *editor* (not the kernel) stutters from
  large cell output. Our payloads sit at/just above the anecdotal band; the only way to pin the
  real knee is to load increasingly heavy cells in a live notebook and watch the editor. Cheap
  follow-up if MB-scale features (animation) get built. (The round-trip *latency* — distinct from
  editor stutter — is now measured above.)

Payload size, the thing that drives every cost here, is now known — and the live round-trip
confirms render time, not the browser, is the latency bottleneck.

## :webgl backend (WGLMakie)

> Everything above this section is the `:cairo` backend's envelope (static CairoMakie PNG +
> manifest) and is **unchanged** by the `:webgl` backend below — the two ship genuinely different
> wire formats, so `:webgl` gets its own self-contained envelope here rather than folding into the
> tables above. This section was merged in from the formerly-separate `MasqueWGL` package's own
> `docs/perf-findings.md` when that package folded into `Masque` as a package extension rather than
> staying a separate registered package; it remains the single source of every `:webgl` size
> number, same as the rest of this file is for `:cairo`.
>
> **Reproduce** (re-runnable, prints the live numbers — they can't silently rot):
> `julia --project=. bench/webgl_payload_size.jl`. Last measured **2026-06-30** at commit
> **`f763c6d`** (the M2 envelope correction, pre-fold-in PR #20), **WGLMakie 0.13.12, Julia 1.12**.
> Re-run for WS-3D Axis3 core on **2026-07-02** (PR #35): all three wire figures unchanged —
> bundle 1.09 MB, 2D lines-200 0.07 MB, 2D scatter+text-40 0.1 MB, 3D helix-300 0.14 MB (the
> scene payload never carried Masque's manifest, and the manifest's `is3d`/z additions are noise).
> Re-run and reconcile this section on any wire-format change (a new geometry layout, a new scene
> field, an encoding change, an animation/frames slot) — and note the new commit here.

### The payload terms

A rendered `:webgl` cell ships three payloads over Pluto's `published_to_js` (MsgPack on the wire);
the click *return* value (`{layer,index,payload}`) is tiny and not a factor:

| Term | Carried by | Cost driver | Shipped |
|------|-----------|-------------|---------|
| **WGLMakie bundle** | `published_to_js` → blob URL → `import()` | fixed (vendored bundle + three.js + atlas) | **once per notebook** (M2) |
| **scene** | `published_to_js` (MsgPack binary) | #plots × geometry + glyph atlas | every render (per cell / per frame) |
| **manifest + overlay** | reuses Masque core verbatim | #hit-elements | every render (tiny — see the `:cairo` envelope above) |

The **bundle dominated** and is now shared once per notebook (M2 / PR #18), so the per-cell cost is
just the **scene**.

### Envelope (2026-06-30, WGLMakie 0.13.12)

| | shipped | wire | gzip-bin | gzip-json | JSON proxy |
|---|---|---|---|---|---|
| WGLMakie bundle | once per notebook | **1.09 MB** | — | — | — |
| scene — 2D lines (200 pts) | per cell | **0.07 MB** | 0.02 | 0.05 | 0.33 |
| scene — 2D scatter + text (40) | per cell | **0.10 MB** | 0.03 | 0.08 | 0.44 |
| scene — 3D helix (300 pts) | per cell | **0.14 MB** | 0.05 | 0.11 | 0.56 |

So the first `:webgl` cell ships ~1.1 MB (bundle) + ~0.07–0.14 MB (scene); each **additional** cell —
and each tier-1 reactive re-render — ships just its **0.07–0.14 MB** scene. That's **≈8–16×** below
the 1.09 MB bundle.

#### Stress + server cost (the terms the head-to-head turns on)

Two `:webgl` facts under stress (measured **2026-06-30 by `bench/vs_cairo.jl`**, `Random.seed!(0)` —
sizes exact, ms wall-clock/approximate; units MB = bytes/1 000 000):

| scene | wire | serialize ms |
|---|---|---|
| scatter 100 000 | 0.86 MB | ~30 |
| heatmap 200² | 1.96 MB | ~30 |
| heatmap 500² | 11.8 MB | ~45 |

- **Serialize time is ~flat (~30 ms) regardless of N** — `scene_payload` only *serializes*; the GPU
  draw is offloaded to the client. Contrast `:cairo`, which rasterizes server-side: `bench/vs_cairo.jl`
  measures its render+encode climbing to **~2.3 s at 100k points** (`markersize=6`, matching this
  file's own `bench/payload_envelope.jl`). `bench/stress.jl` sweeps 100k too but at `markersize=4`,
  where it records **~1.5 s** (the "manifest is the high-N wall" table above) — the marker size
  drives the raster cost, so the two are consistent, not contradictory. This flat WebGL line is the
  per-update UX win, not a measurement gap.
- **Dense rasters blow up the scene**: a heatmap ships as a value grid, so 500² = 11.8 MB vs a ~1 MB
  Cairo PNG. `:webgl` is *not* universally lighter — rasters are Cairo's home turf.

**Cross-backend comparison (wire + UX + cost regimes):** see
[`backend-comparison.md`](backend-comparison.md), generated by `bench/vs_cairo.jl` — the
head-to-head, the crossover-N analysis, and the interaction matrix (view manipulation is planned
as backend-symmetric Julia re-render, on the gesture channel rather than `@bind` — #122,
[§12.3](architecture/12-gesture-channel.md#123-what-commits-and-when); only the client-side GPU
camera is out of scope — see `backend-comparison.md` §1†/§6, not restated here). It reconciles
with this section and the `:cairo` envelope above.

#### Wire vs JSON proxy

`published_to_js` does **not** ship the scene as JSON text. Pluto's MsgPack encodes every typed
numeric `Vector` (`Float32`/`Int32`/`UInt32`/`UInt8` — exactly what `_plain` emits) as a **binary**
extension (`reinterpret(UInt8, x)`, `sizeof·length`). So the real wire is the **binary** column,
**~4–5× under** `JSON3.write` (floats-as-text) — the proxy an earlier bench reported. The committed
bench reports both; the `wire` column is what actually crosses the wire (dominant term; structural
map/string overhead adds a little).

### Bundle sharing — why it's once per notebook (M2 / PR #18)

`published_to_js` ids are content-addressed (`notebook_id/objectid(x)`, and `objectid(::String)` is
content-based), so the one `Ref`-cached bundle string has a **stable id** that crosses the wire
exactly once: across cells, Pluto's notebook merge keeps one copy on load; across re-runs of a cell,
Pluto nulls already-known ids before sending (`known_published_objects` + `format_output.jl`), so a
re-run re-ships only its new-id scene, never the stable-id bundle. The browser then caches the
bundle/shim blob URLs once on `window.__MasqueWGL` so the WGLMakie module imports once, not per cell.

### Deferred compression levers (measured, not yet built)

The per-cell scene is already small (binary), so compression is **deferred** — both levers measured:

- **gzip.** The bench's `gzip-bin` column measures gzip-of-binary at **~3×** (0.07→0.02 MB), but to
  use it we'd have to bypass `published_to_js`'s object channel and hand-roll a **msgpack decoder in
  JS**. The cheap path — gzip-of-JSON via the browser's native `DecompressionStream` → `JSON.parse`
  (the `gzip-json` column) — buys only **~25%** vs the current wire, since it starts from float-text.
  Not worth a new JS decoder + failure surface for ~0.05 MB/cell yet.
- **Atlas sharing.** The glyph-atlas tiles (`glyph_data/atlas_updates/<hash>`) carry content hashes
  **observed to repeat across scenes** (the digit/label tiles recur in all three bench figures above),
  so they're shareable like the bundle — but each is ~10–20 KB, gzip overlaps the win, and hoisting
  them to a shared channel is real complexity.

**Revisit both only if tier-1 animation profiling (per-frame scene re-ship) shows the scene is the
bottleneck** — tier-2 in-place patching (`roadmap.md`) already ships no new scene at all.

## Axis3 projection hinge spike (2026-07-01)

Not a size/latency number, but recorded here under the same single-source rule (one committed
home for a measured figure; other docs cite, never restate — `spike/` itself is gitignored).

**Result: build-time `Makie.project(ax.scene, Point3f)` lands on the rendered CairoMakie `Axis3`
raster with 0.0 px deviation** — measured on a static camera *and* again after an
`azimuth`/`elevation` change, projecting the scatter's data points through the corrected shared
projection closure (post-PR #32, `transform_func` applied) and comparing against the rendered
marker positions in the raster. `Point2f(x, y)` ≡ `Point3f(x, y, 0)` is byte-identical through
the same closure, so widening the geometry path to 3D cannot regress 2D. This is the WS-3D
"projection hinge" gate — cleared. Cited by `architecture.md`, `backend-comparison.md`, and
`roadmap.md`.

**`:webgl` canvas half (2026-07-02, WS-3D core landing): 0.0 px.** The mirror check on the live
canvas: render the E2E `page3d.html` (Axis3 scatter, red markers, explicit azimuth/elevation) in
GL-capable headless Chromium (SwiftShader), screenshot the `<canvas>`, and probe the pixel at
every build-time projected marker center — **each center pixel is a rendered marker pixel**
(nearest red at 0.0 px for all three markers; blank-canvas guarded so GL-init failure can't pass
vacuously). This was the "WGL canvas-alignment spike" gating the `:webgl` half of Axis3 parity —
cleared. The one semantic the 2D WGL alignment spike hadn't exercised (`viewport` origin/ppu/
y-flip on an `Axis3` canvas) is exactly what this measures. Bond-level coverage is committed CI:
`test/e2e` clicks the Axis3 page's marker 0 and asserts the `{index,x,y,z}` payload through
`transform_value`.

## WGL context lifecycle — the "context leak" premise, measured (2026-07-02)

> Measured at **PR #37** (branch base `8cc47cc`, the WS-3D core merge),
> **WGLMakie 0.13.12** (vendored bundle), Julia 1.12, headless Chromium (Playwright).

**Result: `:webgl` cell re-renders do NOT leak GL contexts.** Method: a live Pluto kernel
(headless Chromium), a `@bind` PlutoUI slider driving `azimuth` into `masque(fig)` (each step =
a full kernel re-render of the widget), `HTMLCanvasElement.getContext` instrumented before any
page script to count context creations and `webglcontextlost` events. Five-step sweep:

| after step | created | lost | **live** |
|---|---|---|---|
| mount | 1 | 0 | **1** |
| 1–5 (each) | +1 | +1 | **1** |
| total | 6 | 5 | **1** |

Mechanism (WGLMakie 0.13, vendored bundle): `check_screen`, called from `render_scene` on every
animation frame, disposes any screen whose canvas is no longer in the document
(`renderer.forceContextLoss()` + full dispose; console: "removing WGL context, canvas is not in
the DOM anymore!"). Pluto replaces the cell output on re-run, the old canvas detaches, and the
context is reclaimed within one frame. Cell **delete** detaches the canvas identically, so the
same mechanism covers it — the once-planned re-run-vs-delete lifecycle distinction is moot.
(Scope, honestly: the sweep *measures* the re-run half; the delete half is inferred from the
shared DOM-detach mechanism. `ctx_growth.mjs` attempts to measure delete too — it drives
Pluto's delete-cell control when reachable and asserts live→0 — but Pluto 0.20's delete UI is
not a directly-clickable button, so runs report `delete_measured=false` and the inference
stands until Pluto's UI or the tool's drive changes.)

**What this kills and what it keeps.** The earlier claim ("naive re-mounting leaks WebGL
contexts toward the browser's ~16 cap; all `:webgl` view-manip is gated on unbuilt context
reuse") was reasoned-not-measured, and is **false** on the shipped stack. `:webgl` sliders work
today (the sweep round-tripped the bond on every step). What survives as fact: each re-render
pays context + scene re-initialization — a per-step *cost*, for which the **camera-only
resident-scene patch** (ship only the new camera + freshly projected overlay to the still-live
scene) is the candidate optimization, but it is gated on canvas identity, not payload size:
Pluto destroys the `<canvas>` on every cell replacement (#86; `roadmap.md` §"View manipulation
and the remount").

**Reproduce**: `test/e2e/ctxgrowth_notebook.jl` + `test/e2e/ctx_growth.mjs` (local tools, same
serve.jl harness as the through-Pluto E2E; not in CI — a through-Pluto job is the flake-prone
kind, and the property is upstream-owned). Re-run on a WGLMakie major bump: if upstream ever
drops the `check_screen` disposal, this is the measurement that notices.
