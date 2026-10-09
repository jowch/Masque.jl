# Masque.jl — Payload and latency envelope

The measured payload size and latency of both backends, and the **single source of every size
and latency number** in the project: other docs cite this file and never restate its figures.
Each table says when it was measured. How a number got here, and the numbers it replaced, are in
git history.

**Reproduce.** Run the benches in the warmed dev env, not `--project=.`: CairoMakie, WGLMakie
and JSON3 are `[extras]` test deps, invisible to the package env, and the `:webgl` benches also
load Pluto (see `CLAUDE.md`; `scripts/cloud-warm.sh julia` builds the env with all of them).

```sh
ENV_DIR="${MASQUE_DEV_ENV:-$HOME/.julia/environments/masque-dev}"
julia --project="$ENV_DIR" bench/payload_envelope.jl        # :cairo envelope (sections A–J)
julia --project="$ENV_DIR" bench/stress.jl                  # :cairo 10× extremes (STRESS A–E)
julia --project="$ENV_DIR" bench/gesture_channel.jl         # :cairo gesture frames
julia --project="$ENV_DIR" bench/gesture_channel_webgl.jl   # :webgl gesture frames
JULIA_NOSYSIMAGE=1 julia --project="$ENV_DIR" bench/view_warmup.jl          # :cairo warmup
JULIA_NOSYSIMAGE=1 julia --project="$ENV_DIR" bench/view_warmup.jl webgl    # :webgl warmup
julia --project="$ENV_DIR" bench/webgl_payload_size.jl      # :webgl envelope
julia --project="$ENV_DIR" bench/vs_cairo.jl                # cross-backend head-to-head
julia bench/encoding_experiment.jl                          # own temp env (MsgPack.jl)
(cd frontend && npm run bench)                              # JS hit-test microbenchmark
```

`payload_envelope.jl` and `stress.jl` both `seed!(0)`, so their PNG and manifest sizes reproduce
exactly; render milliseconds are wall-clock and vary run to run. Three kinds of number here are
one-off measurements with no committed harness, so they are dated snapshots: the live click
round trip, the `@bind` view-commit baseline, and the WGL context-lifecycle sweep (a local e2e
tool, `test/e2e/ctx_growth.mjs`, not CI).

**When to re-run** (the standing practice in `CLAUDE.md`): on every manifest-shape change (a new
interactable kind or geometry layout, a new payload field, an encoding change, an animation or
frames slot) and, for `:webgl`, on any scene wire-format change. Re-run `payload_envelope.jl` and
`stress.jl` (plus the `:webgl` benches for a scene change), update the affected tables and their
dates, and say in the PR what moved. A field that only some layers carry and no bench fixture
sets gets a row in "Per-layer fields" instead, measured by inspecting a manifest directly.

## The payload terms

A rendered cell ships these. The click's return value (`{layer, index}`) is tiny and not a factor.

| Term | Backend | Carried by | Cost driver | Shipped |
|------|---------|-----------|-------------|---------|
| **base64 PNG** | `:cairo` | HTML `<img src="data:…">` | output pixel area × visual density | every render |
| **WGLMakie bundle** | `:webgl` | `published_to_js` → blob URL → `import()` | fixed (vendored bundle, three.js, atlas) | once per notebook |
| **scene** | `:webgl` | `published_to_js` (MsgPack) | #plots × (shader source + geometry) + glyph atlas | every render or gesture frame |
| **manifest** | both | `published_to_js` (MsgPack) | #hit-elements × per-element payload | every render or gesture frame |
| **overlay bundle** | both | inlined in the cell, idempotent | fixed | per cell, parsed once per page |
| **WGLMakie shim** | `:webgl` | `published_to_js` → blob URL on `window.__MasqueWGL` | fixed | once per notebook |

The PNG is what makes a large cell slow to load in the editor; the manifest is the term new
features inflate (tooltips, animation frames, multi-select). At `cc160c7` the overlay bundle,
`assets/overlay.js`, is **69 534 B** and the shim, `assets/masque-webgl.js`, is **7 762 B**, both
minified, with esbuild's `mangleProps: /_$/` shortening internal property names
(`frontend-delivery.md`, Bundle row). `d3-format`, the only runtime JS dependency, is bundled into
`overlay.js`.

## `:cairo` envelope

Measured by `bench/payload_envelope.jl` on CairoMakie 0.15, Julia 1.12, default 700 px column
(`px_per_unit` 2); sizes re-confirmed byte-for-byte on 2026-09-20. PNG is the decoded size,
manifest the MsgPack size.

| Plot | PNG | manifest | note |
|------|----:|---------:|------|
| line, 10 pts | 51 KB | 0.6 KB | ~50 KB antialiasing and text floor for any plot |
| scatter, 100 | 35 KB | 4 KB | |
| scatter, 1 000 | 188 KB | 38 KB | typical interactive plot |
| scatter, 10 000 | 717 KB | 379 KB | manifest approaches PNG; both O(N) |
| heatmap, 50×50 | 30 KB | 13 KB | |
| heatmap, 200×200 | 190 KB | 197 KB | edges are compact; `values[]` is O(cells) |
| heatmap, 50×50, cell labels | 30 KB | 54 KB | `payloads = (i, j) -> (; row, col)` (2026-10-08, #290) |
| heatmap, 200×200, cell labels | 190 KB | 897 KB | ~18 B/cell of payload on top of `values[]` |

A realistic single interactive plot is **50–400 KB total**. Editor lag is not expected there; it
becomes a risk only at the extremes in "Stress".

### Outside Pluto

Outside Pluto (#298), `show` writes one block per widget: the PNG as base64 (4/3 of the
decoded size), the manifest as a JS literal, and about 1.1 KB of loader. A registered
install's loader fetches the 81,883-byte `assets/overlay.js` from jsDelivr once per page
(#311); a git checkout inlines it in every block instead. Measured with
`sizeof(sprint(show, MIME"text/html"(), masque(fig)))` on CairoMakie 0.15, Julia 1.13,
default figure size unless noted (2026-10-08, PR #311):

| Plot | block, registered | block, checkout | PNG (base64) | manifest |
|------|------:|------:|-----:|---------:|
| scatter, 4 pts, 400×260 (the Backends page example) | 16 KB | 97 KB | 14 KB | 0.7 KB |
| line, 10 pts | 84 KB | 165 KB | 82 KB | 0.8 KB |
| scatter, 100 | 71 KB | 152 KB | 62 KB | 7.5 KB |
| scatter, 1 000 | 423 KB | 504 KB | 351 KB | 71 KB |

Documenter warns at 100 KiB per page and fails at 200 KiB. With a registered install the
PNG sets the budget: two default-size widgets warn, three fail. From a checkout (this
repo's own docs build) one widget already warns and two fail.

### What scales the manifest

- **Element count**, linearly: ~38 B/element (three integer-pixel coordinates at 1–3 B each,
  [§9](architecture/09-wire-encoding.md), plus a payload whose `x`/`y` stay Float64). The payload,
  not the geometry, now dominates the per-element cost.
- **A heatmap's value matrix** (`:grid` `values[]`, O(cells)) while each cell is at least one
  screen pixel: 200×200 is 197 KB. Below one pixel per cell the manifest carries one value per
  screen pixel of the axis viewport instead ("Stress"). Tooltip templates add nothing per cell.
- **Per-cell grid payloads** (`payloads`, #290, 2026-10-08): one payload per cell, shipped on both
  the `values[]` and the sub-pixel branch, since hover needs the cell's own entry. A short
  `(; row, col)` label pair is ~18 B/cell, so a labelled 200×200 heatmap is 897 KB against 197 KB
  unlabelled; that is O(cells), where row and column label vectors would be O(rows + columns).
  A grid without `payloads` ships the same bytes as before.
- **Slice series**, which stay Float64 (section H, one series, no other layers): 100 vertices is
  1.8 KB of `xy` in a 2.2 KB manifest, 1 000 vertices 17.6 KB in 18.0 KB (~18 B/vertex). The
  raster stays the empty-axis floor (9.8 KB). A view gesture rebuilds the manifest every frame,
  so a slice on a panned axis pays this again per camera move.
- **Line samples** for the hover readout (`points`, section I, 2026-10-03, #262): a 2D line also
  carries each sample as two Float32s (~10 B/sample), beside its integer-pixel geometry
  (~6 B/vertex). That makes a line layer about 2.7× its geometry alone: 100 samples is 1.0 KB of
  `points` in a 2.0 KB manifest, 1 000 is 9.8 KB in 15.8 KB, 10 000 is 98 KB in 156 KB. That stays
  under a 10 000-point scatter's 379 KB. Date and category axes carry text instead, which is larger
  per sample. Axis3 lines carry none.
- **Not display width.** `px_per_unit` scales the PNG roughly with the square of the width but
  leaves the manifest alone: scatter-1000's PNG is 90 KB at 300 px and 188 KB at 700 px, its
  manifest 38 KB at both.

### Per-kind manifest costs

Section F, polygons (2026-06-30; the holed contourf row 2026-09-23). Every polygon kind costs
**~6 B/vertex**, holes included; per-element cost follows the ring's vertex count.

| Surface | elements | total verts | manifest | ~B/elem |
|---------|--------:|------------:|--------:|--------:|
| band, 100 x-pts (1 ring) | 1 | 200 | 1.5 KB | 1 494 |
| violin, 3 groups (~400 verts/ring) | 3 | 1 206 | 7.3 KB | 2 479 |
| contourf, 50×50, default levels | 20 | 1 780 | 10.5 KB | 537 |
| contourf, 40×40 Gaussian, levels=5 (four rings with one hole) | 5 | 693 | 4.4 KB | 905 |

Section G, text labels (2026-07-01). A label is a 4-int `:rects` box (~8 B) plus a
`(; text, index, x, y)` payload:

| Case | labels | manifest | ~B/label |
|------|-------:|---------:|---------:|
| scatter + 5 short labels | 5 | 0.8 KB | 51 |
| text only, 100 labels of ~4 chars | 100 | 4.9 KB | 47 |
| the same 100 labels on an `Axis3` | 100 | 6.1 KB | 59 |

On an `Axis3` (2026-10-09, #292, Julia 1.13.1) each label's payload adds its anchor's `z` (~11 B)
and the layer adds a front-to-back `order`, one small integer per drawn label (~1 B each).

Section J, surface on Axis3 (2026-10-09 at `0e764bb` plus #259, Julia 1.13.1). A `:surface`
layer ships each shipped point's integer-px `xy` and Float32 `z`, one quad index per quad in
depth order, and the source row and column indices. A matrix grid adds per-point `x` and `y`; a
separate colour matrix adds `value`. A grid larger than one point per `SURFACE_MIN_SCREEN_PX` (4)
of the axis's longer side is thinned to that stride; at 600×450 the cap is 126×126. Build is the
layer's own `hitlayers` call (projection, quantize, depth sort), best of 5, paid by the mount and
by every orbit settle frame.

| Surface (600×450 figure) | shipped | vector grid | matrix grid | with `value` | build |
|---|---:|---:|---:|---:|---:|
| 50×50 | 50×50 | 34.7 KB | 58.6 KB | 46.9 KB | ~2 ms |
| 100×100 | 100×100 | 137.5 KB | 234.2 KB | 186.3 KB | ~8 ms |
| 200×200 | 101×101 | 140.4 KB | 239.0 KB | 190.2 KB | 8–15 ms |
| 500×500 | 126×126 | 218.3 KB | 372.1 KB | 295.9 KB | 13–19 ms |
| 1000×1000 | 126×126 | 218.4 KB | 372.2 KB | 295.9 KB | 13–14 ms |

~14 B/point for a vector grid, ~24 B for a matrix grid, ~19 B with `value`. Thinning holds every
surface inside the 50–400 KB envelope at this size; a 700-px-wide axis reaches the 168×168 cap
(387 KB vector, 661 KB matrix, measured for the design in #259). In-drag frames leave the layer
out (see "`:cairo` gesture frames").

Bars, spans, and text are low-N by nature (tens to hundreds of elements), so their per-element
payloads never move the envelope. A high-cell `voronoiplot!` (1 000 cells) would reach
scatter-scale manifests, a few hundred KB.

### Per-layer fields

Optional fields that ride once per layer or once per manifest, not per element. No bench fixture
sets them, so each was measured by inspecting a built manifest with the same MsgPack byte model
`bench/payload_envelope.jl` uses.

| Field | Where | Cost |
|-------|-------|------|
| `tol` | each `:segments`/`:polyline`/`:lines` layer | 1–3 B |
| `label` | a layer with `label` set | key 6 B + the string (`"Scatter"` is 14 B total) |
| `background` | once per manifest | 28 B for `"rgb(255,255,255)"` |
| `colors`, uniform | a `Scatter`-derived `:circles` layer | ~22 B |
| `colors`, colormapped | same | a fixed 32-stop palette + ~1–2 B/element for the index |
| `links` | each `LegendInteractable` layer | ~9–11 B/entry (a 3-entry legend layer is 341 B, 32 B of it `links`) |
| `clip` + `fill` | each 2-D pan view layer | under 50 B |
| `is3d`, `valueaxis` | each axis transform | 6 B and 11 B |
| `selects` | each selector ROI layer | one short string |

A `:view` layer is one viewport bbox plus a mode and two angles, the same order as an ROI layer.

### Tooltips

Shipping a tooltip string per element would grow the manifest by the sum of those strings:
1 000 elements × 200 B is +196 KB (73 → 269 KB), and 50 000 × 200 B is a **13.17 MB** manifest
that takes ~1.5–2.2 s to render (STRESS D). So per-element strings are not shipped. A layer with
a tooltip carries a `template` (a small segment array evaluated on hover) and the manifest one
`tipStyle` dict, both O(1) per layer; the default envelope above is unchanged by them.

Both benches build the scatter twice (`masque(fig)`'s own layer plus the passed one), so half the
elements carry the payload. Since #308 (2026-10-09) a key-value payload is merged onto the
point's own `x` and `y`, which adds ~21 B per element: section B's rows each grew by 21.5 KB per
1 000 points (51.6 → 73.1 KB at length 0) and STRESS D by 1.04 MB (12.13 → 13.17 MB), measured
against `main` at `0e764bb` on the same machine.

### Render latency

`@elapsed masque(fig)`, warmed, best of 3: the Julia half of a click that re-renders.

| Plot | render + encode |
|------|----:|
| scatter 1 000 | ~70 ms |
| scatter 10 000 | ~280 ms |
| heatmap 200×200 | ~45 ms |

### Full click round trip

A live Pluto kernel and headless Chromium: commit the overlay's bond value by hand
(`host.value = …` and an `input` event, what the overlay does on click) and time until the
downstream cell's re-rendered `<img>` lands. The downstream cell bakes the index into its figure,
so every sample renders, ships, decodes, and paints a new ~40 KB PNG. 15 samples, scatter-50:

| median | min | p90 | max |
|---:|---:|---:|---:|
| **65 ms** | 61 ms | 121 ms | 241 ms |

The round trip is the Julia render floor (~45–70 ms) plus a few tens of ms of transfer, decode,
and paint: render time, not the browser, is the bottleneck. Localhost only, so no network
latency. Re-highlighting a selection is cheaper still, since the overlay draws it with no round
trip.

## Stress — where it stops being render-bound

**Live round trip against payload.** Same method as above with a heavier downstream cell:

| Downstream re-render | PNG | manifest | round trip (median) | render floor | non-render |
|----------------------|----:|---------:|--------------------:|-------------:|-----------:|
| scatter 50 | 40 KB | ~3 KB | 65 ms | ~50 ms | ~15 ms |
| scatter 10 000 | 768 KB | 459 KB | 335 ms | ~280 ms | ~55 ms |
| heatmap 1000×1000 | 2.13 MB | 4.78 MB | 553 ms | ~260 ms | ~290 ms |

These two heavy rows predate integer-pixel geometry and the heatmap screen-pixel sample, so their
manifests are larger than what ships today (scatter-10 000 is now 379 KB; the 1000² heatmap ships
896 KB). They still show what a payload of that size costs. Below ~1 MB total the round trip is
render-bound, with a near-constant 15–55 ms of overhead; above a few MB it is payload-bound, the
time going to MsgPack-serializing the manifest and shipping it. It degrades into the half-second
range without failing. Today high-N scatter is what reaches that regime by default.

**The manifest is the high-N wall** (`bench/stress.jl`, commit `226d9f2`, re-confirmed 2026-09-23
for the heatmap sample sizes). Render times are a range across repeated runs on a shared machine:

| Case | PNG | manifest | render |
|------|----:|---------:|-------:|
| scatter 50 000 | 791 KB | 1.88 MB | 810–935 ms |
| scatter 100 000 | 303 KB | 3.83 MB | 1 499–1 552 ms |
| scatter 200 000 | 71 KB | **7.72 MB** | 3 117–3 369 ms |
| heatmap 300×300 (cells visible) | 388 KB | 442 KB | 33–84 ms |
| heatmap 500×500 (cells sub-pixel) | 1 009 KB | 906 KB | 47–206 ms |
| heatmap 1000×1000 (cells sub-pixel) | 2.26 MB | **896 KB** | 97–227 ms |
| scatter 50 000 + 200 B payload/element | 47 KB | **13.17 MB** | 1 491–2 153 ms (2026-10-09, #308) |

- **The PNG is not monotonic in N.** Past saturation a dense scatter compresses to a near-solid
  mass (200 000 points → 71 KB) while the manifest grows linearly to 7.7 MB.
- **The heatmap render times are not resolved.** Seven runs plus two independent samples spread
  widely, and heatmap 500² shows two distinct regimes (most runs ~201–206 ms, two near 47–57 ms)
  whose cause this bench does not measure. Read them as "far cheaper than high-N scatter",
  not as point estimates. Cairo blits the raster.
- **A sub-pixel heatmap ships a viewport sample**, one source value per screen pixel (536×345 at
  500², 528×345 at 1000²), so the two manifests are almost the same size and a larger source does
  not grow them. Cells stop being individually targetable between 300² and 500² at this figure's
  width.
- **Resolution is not a driver for sparse content**: a 3200×2000 figure of 2 000 points produced a
  smaller PNG (132 KB) than a 600×400 one. Density drives PNG size.

## Wire encoding decisions

`published_to_js` always serializes MsgPack. Its binary fast path applies to a typed numeric
vector (`Vector{Float32}`, `Vector{Int32}`, and Pluto's other typed-array eltypes) at any depth,
including as a value in a `Dict{String,Any}`. The manifest's geometry is an `Any[]` of scalars, not
a typed vector, so it serializes as generic MsgPack arrays.
`bench/encoding_experiment.jl` measured the options on a real 50k-circle geometry:

| Encoding | bytes/coord | 50k circles | |
|----------|------------:|------------:|---|
| Float32 | 5.00 | 732 KB | baseline |
| **integer pixels** (shipped) | **2.10** | **307 KB** | −58%, no manifest-shape change |
| Int16 typed array (fast path) | 2.00 | 293 KB | ~5% more, for a manifest rewrite |

Integer pixels shipped ([§9](architecture/09-wire-encoding.md)); on a whole realistic manifest,
where the Float64 payload dilutes it, that is ~17% (scatter-1000 46 → 38 KB). The typed-array
fast path is not worth its rewrite. Float16 is out (MsgPack has none, and it is lossy above
2048 px). `AxisTransform` limits stay Float64 for drag inversion. For heatmaps, shipping the 1000²
source matrix costs 4.78 MB; the viewport sample that replaced it is the 896 KB in the STRESS
table.

## JS hit-test microbenchmark

`frontend/bench/hit_test.bench.ts` (`npm run bench`) times `hitTest` directly: one `HitLayer` of N
random elements on a 4000×4000 px canvas, 2000 queries after a discarded warm-up, two ways:
**mixed** (random points) and **miss** (a point that misses everything). `circles` and `rects`
return on the first hit, so as density rises mixed measures the early return, not the scan;
**miss** is the O(n) worst case, and the realistic one for hovering empty space. `segments` and
`polyline` have no early exit. `grid` is a binary search over edges. Run 2026-09-14, Node 24, one
core:

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
| grid, 100×100 cells | — | 100% | 0.5 | 0.1 |
| grid, 1000×1000 cells | — | 100% | 0.3 | 0.1 |

Even the worst case, 200 000 circles on a miss, is **~0.38 ms** a call, three orders of magnitude
below the render floor and the transfer cost of a multi-MB manifest. A spatial index is not
justified: the wall a user feels is payload size.

## Animation ceiling

Pre-baked frames cost **frames × per-frame artifact**. Measured on `:cairo`: a 187 KB plot × 30
frames is **5.5 MB**, × 120 is **22 MB**; a 1200×800, 5 000-point frame is 492 KB, so 300 frames
is 144 MB. A full-resolution scrub is not viable; animation has to shrink the per-frame cost
(smaller canvas, lower `px_per_unit`, fewer frames). The ~50 KB PNG floor above is also what an
SVG output path would have to beat for sparse plots.

## `:webgl` envelope

Measured by `bench/webgl_payload_size.jl` on 2026-10-03 at `b204758`, WGLMakie 0.13.15, Makie
0.24.15, Pluto 0.20.28, Julia 1.13. **packed** is `Pluto.pack` of `scene_payload`: the MsgPack
Pluto sends over the websocket and base64-encodes into a static export (`bench/pluto_packed.jl`).
**shaders** and **atlas** are the parts of it under the GLSL source and glyph-atlas keys.
**numeric** is the raw bytes of the scene's numeric vectors alone, with no maps, keys, or strings;
it is a lower bound, and it is the figure this section reported as the wire before #178. Sizes
move by a few tens of bytes from run to run.

| | shipped | packed | shaders | atlas | numeric | gzip-packed | gzip-json | JSON proxy |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| WGLMakie bundle | once per notebook | **1.09 MB** | — | — | — | — | — | — |
| scene, 2D lines (200 pts) | per cell | **0.24 MB** | 0.14 | 0.05 | 0.07 | 0.05 | 0.05 | 0.33 |
| scene, 2D scatter + text (40) | per cell | **0.29 MB** | 0.16 | 0.09 | 0.10 | 0.07 | 0.08 | 0.44 |
| scene, 3D helix (300 pts) | per cell | **0.35 MB** | 0.18 | 0.13 | 0.14 | 0.09 | 0.11 | 0.56 |

The first `:webgl` cell ships the bundle plus its scene; each later cell, and each re-render,
ships only its scene. Pluto's MsgPack ships each typed numeric vector as its raw bytes plus a short
header, so the numeric data packs at about its raw size, and the packed scene is still 2.5–3.6×
the numeric column. **Shader source is the largest part**: every plot, the axis decorations
included, carries its own vertex and fragment shader as text, which is 50–60% of each packed
scene (143 631 B for the lines scene's eight plots). Glyph-atlas tiles are 22–36%. Keys, the
other numeric vectors, and scalars are the remaining 41–51 KB. The JSON proxy is an upper bound.

**Glyph tiles.** Makie ships each new glyph as `atlas_updates[hash] => [uv, sdf, width,
minimum]`. On these scenes one tile's packed entry is 3.9–22.1 KB, a mean of 10–12 KB, and the
scenes carry 5, 7, and 10 tiles.

**The bundle ships once per notebook.** `published_to_js` ids are content-addressed, so the one
cached bundle string has a stable id: Pluto keeps one copy across cells and skips already-known
ids when a cell re-runs. The browser caches the bundle and shim blob URLs on `window.__MasqueWGL`,
so WGLMakie imports once.

**Compression is deferred.** gzip cuts the packed scene ~4–5× (0.05 MB against 0.24 MB on the
lines row), but using it means bypassing `published_to_js` and writing a MsgPack decoder in JS;
gzip of JSON through the browser's `DecompressionStream` lands at about the same size. Shader
source and glyph-atlas tiles repeat across scenes and could be shared like the bundle; the shaders
are the larger share. Revisit only if per-frame scene re-shipping shows up as the bottleneck;
every `:webgl` view-gesture frame re-ships the full scene (#86, closed not planned).

## Backend comparison

`bench/vs_cairo.jl` builds the same seeded figures on both backends (WebGL in-process, Cairo in a
subprocess, since one session loads one backend extension). The subprocess runs with
`--project=<repo root>`, so `CairoMakie` must be loadable from there, for example through your
default `@v1.x` env or `JULIA_LOAD_PATH="@:$ENV_DIR:@stdlib"`; if it is not, every Cairo column
reads `UNSUPPORTED` and the script warns. Sizes are exact; ms are wall-clock. Last run 2026-10-03
at `b204758`, WGLMakie 0.13.15, CairoMakie 0.15.15, Pluto 0.20.28, Julia 1.13. KB = bytes/1024,
MB = bytes/1 000 000.

**Cairo /render** is PNG + manifest, re-shipped every render. **WebGL scene** is the per-render
scene, packed as in the envelope above; the 1.09 MB bundle rides on the first cell only. **ms**
is the server work to turn a fresh figure into a shippable payload.

| figure | Cairo /render | Cairo ~ms | WebGL scene | WebGL ~ms | crossover N* |
|---|--:|--:|--:|--:|--:|
| line, 10 | 51 KB (51+0) | ~61 | 286 KB | ~26 | never |
| scatter, 1 000 | 225 KB (187+38) | ~75 | 275 KB | ~27 | never |
| scatter, 10 000 | 1 103 KB (724+379) | ~267 | 345 KB | ~27 | **1.4** |
| scatter, 100 000 | 3 973 KB (53+**3 920**) | **~1 954** | 1 049 KB | ~32 | **0.4** |
| heatmap, 200² | 386 KB (190+197) | ~64 | 2 137 KB | ~35 | never |
| heatmap, 500² | 1 915 KB (1 009+906) | ~117 | 12 024 KB | ~61 | never |
| 3D helix, 300 | 166 KB (164+2) | ~68 | 345 KB | ~32 | never |

\*Renders after which cumulative `:webgl` (bundle + N·scene) is below cumulative `:cairo`
(N·(PNG + manifest)). The scatter rows use `markersize=6`, matching `payload_envelope.jl`;
`stress.jl`'s scatter-100 000 uses `markersize=4`, which is why its PNG and render time are lower.

- **Cairo's server time scales with the data** (~61 → ~1 954 ms from line-10 to scatter-100 000),
  because it rasterizes. **WebGL stays at ~26–35 ms** (61 ms for the 500² heatmap), because it
  only serializes; the client GPU draws.
- **A WebGL scene has a floor of ~275–345 KB**, mostly shader source, so up to scatter-1 000 a
  Cairo render ships less and `:webgl` never catches up.
- **Cairo's interactive cost is the manifest, not the PNG.** At 100 000 points the PNG collapses
  to 53 KB while the manifest is 3.9 MB, re-shipped every render.
- **Dense rasters favour Cairo.** A heatmap ships to WebGL as a value grid: 500² is 12.0 MB against
  a 1.0 MB PNG.

The regimes that follow. Static small-to-mid 2D: `:cairo`, smaller per render and no bundle.
Large, animated, or repeatedly updated 2D: `:webgl` (scatter-10 000 crosses over after 1.4
renders; scatter-100 000 wins on the first cell and costs ~60× less server time). 3D: `:webgl`
for a scene you rotate or animate, `:cairo` for a static 3D figure with hover and click. First
paint is `:cairo`'s: a PNG decodes at once, while `:webgl`'s first cell downloads and compiles the
bundle and initializes three.js before it draws. The interaction contract is the same on both;
only these costs differ ([§2](architecture/02-backends.md)).

## View gestures

### Before the gesture channel: the `@bind` view commit

The baseline the gesture channel replaced. Measured 2026-09-19 at `e9a71f3`, Julia 1.12.7, Pluto
1.0.3, CairoMakie 0.15.14, headless Chromium, with no committed driver. Scene: `Axis3`, a 240-point
helix and 12 markers, `[ViewInteractable(ax), PointInteractable(ax, pts)]`, 480×360, driven
through a cell that reads its own previous bond value back (the shape #83 investigated, which
Pluto does not support). 12 drag releases:

| metric | p50 | p95 |
|---|---:|---:|
| release → bond value committed | 105.7 ms | 214.6 ms |
| release → final DOM update | 201.5 ms | 294.6 ms |

Every trial remounted the widget twice (#83).

### `:cairo` gesture frames

`bench/gesture_channel.jl`, 2026-09-20 at `a9855b4`, Julia 1.12.7, CairoMakie 0.15.14: the shipped
`Masque._view_render_frame` closure called directly, best of 20 after one discarded warm-up.
Julia side only; #102's spike put websocket transfer and browser decode and paint at a ~31–34 ms
floor on top. Ranges are two runs.

| scene | in-drag (`ppu=1`) p50 | settle (mount `ppu`) p50 | PNG in-drag → settle | manifest in-drag → settle |
|---|---:|---:|---:|---:|
| `Axis3` helix + 12 markers, orbit | 11.1–11.3 ms | 24.2–25.5 ms | 56.5 KB → 139.2 KB | 3.3 KB → 3.3 KB |
| the same + an 80×80 `surface!`, orbit | 80.8–87.4 ms | 124.7–125.5 ms | 63.0 KB → 161.8 KB | 3.4 KB → 91.1 KB |
| `Axis`, 6-point scatter, 2-D pan | 4.1–5.3 ms | 13.2–13.4 ms | 9.0 KB → 19.1 KB | 1.1 KB → 1.1 KB |

Dropping to `ppu=1` during the drag roughly halves the heavy scene's cost: the render, not the
manifest rebuild, is what it pays for.

The manifest column is from 2026-10-09 at `0e764bb` plus #259, Julia 1.13.1. Since #259 the
heavy scene's surface is a default `:surface` layer: in-drag frames ship it suspended (no
geometry, and it is not built), and the settle frame ships its 88 KB. The timings above predate
it. Re-timed on the cloud box, which runs this bench about 1.5× slower and noisier than the
columns above, an interleaved A/B of the heavy scene with and without the surface layer (30
frames each, same process) gave in-drag 112.8 vs 113.1 ms and settle 162.7 vs 172.2 ms: the
layer costs the settle frame its build (~10 ms) and the drag nothing.

### `:webgl` gesture frames

`bench/gesture_channel_webgl.jl`, 2026-09-22, Julia 1.10.12, WGLMakie 0.13.15, same scenes and
method. No PNG: `render` serializes the figure once per frame and records `pxPerUnit` for the
browser framebuffer. The scene is the same size at both resolutions. Scene sizes are packed as in
the `:webgl` envelope, re-measured 2026-10-03 at `b204758` on Julia 1.13 and Pluto 0.20.28; the
numeric column matches the timing run's, so the scenes have not changed shape.

| scene | in-drag p50 | settle p50 | scene packed | scene numeric | scene JSON |
|---|---:|---:|---:|---:|---:|
| helix + 12 markers, orbit | 3.4–3.5 ms | 4.4–4.5 ms | 357.3 KB | 132.3 KB | 545.9 KB |
| + 80×80 `surface!`, orbit | 3.4–3.5 ms | 4.5–4.6 ms | 761.6 KB | 522.2 KB | 1392.0 KB |
| 6-point scatter, 2-D pan | 1.1–1.2 ms | 1.1–1.2 ms | 324.9 KB | 136.8 KB | 521.3 KB |

The frame's manifest adds 1–3 KB packed. The heavy scene is not render-bound here: it costs what
the light one does and pays in payload instead. Transfer and three.js deserialize and paint are
not timed; `test/e2e/kind_sweep.mjs` confirms a frame lands on both backends but does not time it.

### View warmup

`bench/view_warmup.jl`, 2026-09-22, Julia 1.10.12, `OPENBLAS_NUM_THREADS=1`, two fresh processes
per backend, no browser. `masque` is the mount render; `show` writes the HTML and returns; the
discarded frames (orbit: an azimuth nudge, an elevation nudge, a farther pose, a settle; pan: an x
shift, a y shift, a settle) run after the HTML is written. "cold" is the first widget of that
scene in the process; scenes run light orbit, heavy orbit, then pan. Milliseconds, as a range
across the two processes.

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

The first discarded orbit frame is the gesture path's compile, ~1.5 s on Cairo and 1.3–1.4 s on
WebGL, and it runs after the HTML is written. The mount compile stays in `masque`: the first
`Axis3` in a process is 1.5–1.6 s on Cairo and 2.2 s on WebGL before the HTML exists. A drag that
arrives during warm warmup waits for the discarded frames and then renders (one sample each:
Cairo light 59–72 ms, Cairo heavy 380 ms, WebGL light 25–39 ms, WebGL heavy 38 ms). Drag and
settle here are a p50 of 5, not the best of 20 in the tables above.

## Axis3 projection hinge (2026-07-01, 2026-07-02)

Not a size, but a measured figure that needs one home. Build-time
`Makie.project(ax.scene, Point3f)` lands on the rendered CairoMakie `Axis3` raster with **0.0 px**
deviation, on a static camera and after an `azimuth`/`elevation` change, through the shared
projection closure with `transform_func` applied. `Point2f(x, y)` and `Point3f(x, y, 0)` are
byte-identical through it, so the 3-D path cannot regress 2-D. On the live `:webgl` canvas
(headless Chromium, SwiftShader) every build-time projected marker centre is a rendered marker
pixel, also **0.0 px**, with a blank-canvas guard so a GL-init failure cannot pass.
`test/e2e/alignment.mjs` checks this.

## WGL context lifecycle (2026-07-02)

**Re-rendering a `:webgl` cell does not leak GL contexts.** Measured at PR #37, WGLMakie 0.13.12:
a live Pluto kernel, a `@bind` slider driving `azimuth` into `masque(fig)`, and
`HTMLCanvasElement.getContext` instrumented to count creations and `webglcontextlost` events.
After mount and each of five steps, exactly **one** context is live (6 created, 5 lost).
WGLMakie's `check_screen`, run every animation frame, disposes any screen whose canvas has left
the document, and Pluto detaches the old canvas when it replaces a cell's output. Deleting a cell
detaches it the same way; that half is inferred, not measured, because Pluto's delete control is
not directly clickable from the tool.

Each slider step still pays context and scene initialization, a cost rather than a leak. View
gestures avoid it: they swap a serialized scene into the live canvas. Reproduce with
`test/e2e/ctxgrowth_notebook.jl` and `test/e2e/ctx_growth.mjs` (local tools, not CI); re-run on a
WGLMakie major bump, since this is upstream behaviour.

## Not measured

- **The editor-lag knee**, where the Pluto editor (not the kernel) stutters on large cell output.
  Pinning it means loading heavier and heavier cells in a live notebook; worth doing if MB-scale
  features such as animation get built.
- **Gesture-frame transfer and paint.** Both gesture benches time the Julia closure only.
