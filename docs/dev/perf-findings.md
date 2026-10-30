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
julia --project="$ENV_DIR" bench/payload_envelope.jl        # :cairo envelope (sections A–L)
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

Section L, points on Axis3 (2026-10-15 at `c2fc49f` plus #331, Julia 1.13.1). So that the point
drawn on top answers an overlap, a `meshscatter!` layer on an `Axis3` ships a top-first `order`
(one small integer per drawn point, ~2.7 B each), and on WebGL a `scatter!` layer on an `Axis3`
ships the same. Any `meshscatter!` layer also ships each sphere's outline ellipse, three integers
in image px² (`ellipses`, ~3 B per point). A Cairo `scatter!` on an `Axis3`, and every 2D layer,
ship neither: the overlay already treats the last point listed as the one on top.

| Case (600×450 figure, Cairo) | manifest | geometry | order | ellipses |
|---|---:|---:|---:|---:|
| scatter, 1 000 points | 49.0 KB | 6.8 KB | – | – |
| meshscatter, 100 points | 5.5 KB | 0.7 KB | 0.1 KB | 0.3 KB |
| meshscatter, 1 000 points | 54.6 KB | 6.8 KB | 2.7 KB | 2.9 KB |

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
| `linewidth` | each `:segments`/`:polyline`/`:lines` layer (0.4.2) | 19 B (key 10 B + a float64) |
| `label` | a layer with `label` set | key 6 B + the string (`"Scatter"` is 14 B total) |
| `background` | once per manifest | 28 B for `"rgb(255,255,255)"` |
| `colors`, uniform | a `Scatter`-derived `:circles` layer | ~22 B |
| `colors`, colormapped | same | a fixed 32-stop palette + ~1–2 B/element for the index |
| `links` | each `LegendInteractable` layer | ~9–11 B/entry (a 3-entry legend layer is 341 B, 32 B of it `links`) |
| `clip` + `fill` | each 2-D pan view layer | under 50 B |
| `is3d`, `valueaxis` | each axis transform | 6 B and 11 B |
| `selects` | each selector ROI layer | one short string |
| `occluders` | once per manifest, only when an opaque legend overlaps an axis (0.4.3) | key 10 B + 4 numbers (~37 B) per such legend; absent otherwise |
| `fields`, `initial` | once per manifest (#335) | ~10–20 B per field: its id twice, plus its start (`null` for a pick; a box's four bounds) |
| `brush` | the target of a `selects` box | ~15 B |
| `many` | each `select = :many` layer (#335) | 13 B (`payload_envelope.jl` §K) |
| `draw` | each layer whose plot `masque` knows (#462) | 6–8 B (key 5 B + a small integer); `payload_envelope.jl` at `d31f6e1` moved only the 1 000-point scatter manifest, by 6 B, and the two `:many` scatters by 0.1 KB |
| `groups`, `group` | once per `linked(...)` group, and a tag on each member layer (#346) | under 0.1 KB by position; with `key`, `rows` adds one small integer per mark (`payload_envelope.jl` §M) |
| `regions` | each grid layer given `regions = R` (#359) | `[id, n, …]` runs over the row-major cells, one pair per region edge crossed along a row (`payload_envelope.jl` §L) |

Re-running `payload_envelope.jl` for the composite bind value (#335, 2026-10-10) moved no
manifest in the tables above by more than 0.1 KB; `fields` and `initial` replace the old
`bondOwner`, `selection`, `selectionTarget` and per-layer `selected`.

A `select = :many` field's `@bind` value travels from the browser as `{items: [...]}`, one
`{layer, index}` per pick. `bench/payload_envelope.jl` §K (2026-10-10) measures it for a layer
named `scatter`: 2.2 KB for 100 picks and 23.2 KB for 1 000, about 22–24 B a pick, so even a
reader holding every point of a 1 000-point scatter sends less per click than one rendered
PNG. No other fixture sets `select`, so the tables above are unchanged by it.

`bench/payload_envelope.jl` §L (#359, 2026-10-15) measures `regions` on a heatmap. The runs cost
about one `[id, n]` pair per region edge crossed along each row, so the cost follows the outlines,
not the cell count, and is large when regions are small next to the grid. A 512×512 label image
with 200 round objects grows from 1283.3 KB to 1303.6 KB (+20 KB), the same at 2048×2048 from
1417.2 KB to 1512.5 KB (+95 KB), and a 121×121 crop cut into 961 fragments of 4×4 cells from
72.6 KB to 86.3 KB (+14 KB). A whole 2048×2048 image cut into fragments is the expensive case:
16 384 fragments of 16×16 cells take it from 1417.2 KB to 2437.3 KB (+1.0 MB), and 65 536 of 8×8
to 3975.3 KB (+2.5 MB), more than the rest of the manifest. Such a grid ships no `values[]` (it
takes the sampled path), so the runs are most of what it sends. Crop to the part being edited
before cutting it into fragments, as the mask-editor pattern does.

A pick in a region sends the same cell mask as below, holding every cell of the regions picked.
Julia turns each value into a `GridSelection` and names the regions it holds whole by walking the
runs against the mask: for half of a 2048×2048 grid, 5.4 ms and 1.6 MB with 16 384 fragments, and
12.2 ms and 4.9 MB with 65 536 (§L, one run on the 4-core cloud container). In the browser, the
first hover or pick after a mount decodes the runs for every cell, about 0.4 s on a 2048×2048
grid with 16×16 fragments (timed in review of #360); after that a region costs its own size.

A `select = :many` grid's value is a cell mask, `{runs: [j, i0, n, ...]}`, so its size follows the
shape's outline, one triple per row it crosses, not its area. On a 512×512 image (JSON bytes,
counted by script on 2026-10-10; MsgPack packs the small integers tighter): one cell 18 B, a
300×300 block 3.6 KB, the same block minus a corner 3.6 KB. Past 1 KB of runs the browser sends
`{bits: base64}` when that is shorter, which caps any shape at 43.7 KB for 512×512 (a
checkerboard; clicks and boxes can't reach it in practice). The browser holds the mask as one byte
per cell, 0.26 MB at 512×512.

Each click or marquee step on such a grid copies the mask, encodes it and redraws its outline, so
it costs time in proportion to the cell count. Measured in Node 22 on the 4-core cloud container
(2026-10-10, median of 9, a block covering half the grid plus one cell): 4.0 ms at 512×512,
43 ms at 2048×2048 and 157 ms at 4096×4096, with the value at 3.1, 14.4 and 30.0 KB (runs) and
the outline path at 5.4, 24.2 and 50.6 KB. Up to about 2048×2048 a click stays within a few
frames; a photo-sized image past that pauses visibly on each click.

`bench/payload_envelope.jl` §M (#346, 2026-10-24, at `108344d`) measures a `linked(...)` group
over two 10 000-point scatters. By position it adds 0.1 KB to the 756.2 KB of two `:many`
fields. Keyed by a payload `id`, it ships each mark's row, 58.1 KB for the 20 000 marks (about
3 B a mark), on top of the payloads the keys come from (813.1 KB → 871.4 KB). The value is
`{rows: [...]}`, 3 B a row at 5 000 rows (14.4 KB), against about 23 B a pick for `{items}`.
Julia rebuilds the key table from the payloads on each decode, so a keyed value costs about
11 ms whatever its size (one run on the 4-core cloud container); a group by position decodes in
microseconds.

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

### Re-drawing a selection (#394)

The overlay's half of a click on a plot that holds many picks, with no round trip. Headless
Chromium against a live Pluto kernel on the warmed env; one click dispatched on the surface,
`sync` is the handler and `total` runs until two frames later. Medians of 12, measured
2026-10-23 on the cloud container: the old look at `f181c12` (a dodge fill and a 2 px edge per
pick, as SVG), the new look on the #394 branch (one canvas per axis), back to back.
`bench/selection_look/click.mjs` reproduces the table (how to run it is at its top).

| Case | `:cairo` old | `:cairo` new | `:webgl` old | `:webgl` new |
|------|---:|---:|---:|---:|
| click, 5 000 picks of 10 000 marks per panel, 2 panels | 105 / 277 ms | 33 / 114 ms | 113 / 2 177 ms | 43 / 1 965 ms |
| click, 5 000 picks of 100 000 marks | 53 / 126 ms | 40 / 80 ms | 60 / 1 997 ms | 41 / 1 897 ms |
| legend hover over one of 8 clusters (~1 250 marks a panel), on and off | 19 / 380 ms | 8 / 32 ms | 28 / 2 259 ms | 14 / 1 935 ms |

(`sync` / `total`.) The `:webgl` totals sit near 2 s in every row because headless Chromium draws
the WGLMakie canvas in software each frame; the overlay's share is the `sync` column. The new
look draws the cover of every mark of a plot once and, per click, copies it and punches out the
picks, so its cost follows the picks: a first version that redrew every mark on each click took
124 / 531 ms on `:cairo` at 100 000 marks.

The same script times a `linked(...)` group (#346) over the same two panels, 5 000 rows held
(2026-10-24, same container, sync / total): a click that adds or takes out one row in both
panels is 44 / 96 ms on `:cairo` and 49 / 1 973 ms on `:webgl`, the same as two separate
`:many` fields in the same run (43 / 128 ms and 43 / 1 957 ms), and hovering a mark to outline
its partner is 2 / 29 ms and 2 / 1 886 ms. A linked click redraws the picks of both panels,
which the two separate fields' click doesn't, and still costs no more, because the fade's
cover is drawn once and the picks are punched out of it.

That holds for closed marks only. Segments, the one linkable kind still drawn as SVG, redraw
every held shape on each click. Timed in review of #417 with the same script and 5 000 rows
held per panel: a linked click is 127 / 281 ms on `:cairo` and 204 / 2 100 ms on `:webgl`,
two separate `:many` segment fields 163 / 509 and 143 / 2 053 ms, and one 61 / 178 and
67 / 1 753 ms. The same review timed the round trip that #346's spike put at 6 to 7 s for
about 2 500 marks: a legend click that picks one cluster of a keyed group (1 229 rows) reaches
the value cell in about 0.1 s on `:cairo`, as fast as the unlinked legend's 2 458 events.

### Fading lines on hover (#464)

Since #459, hovering a line fades the axis's other lines, and the fade redraws whenever the
pointer moves onto a different line; moving along one line redraws nothing. Headless Chromium
against a live Pluto kernel on the warmed env, `deviceScaleFactor` 1, at `253d372` (0.4.2),
measured 2026-10-30 on the cloud container. `bench/line_fade/hover.mjs` reproduces the table
(how to run it is at its top). *swap* moves the pointer onto a line from another one (the fade
redraws), *along* moves it one pixel along a line (no redraw: no run of any row redrew), *off*
moves it off the plot (the fade is taken away); each is the handler's median of 6, ending on
the last line plotted, which is the slower end for separate plots (below). *sweep* moves the
pointer across every line, one move per frame for 60 frames: the handler's median and worst
time, and how many frames' handlers took longer than a 60 Hz frame (16.7 ms).

| Figure | vertices | `:cairo` swap / along / off | `:webgl` swap / along / off | `:cairo` sweep | `:webgl` sweep |
|--------|---:|---:|---:|---:|---:|
| `series!`, 10 lines × 100 | 1 000 | 2.2 / 0.6 / 2.0 ms | 2.5 / 0.4 / 2.7 ms | 0.8 / 10 ms, 0 | 0.8 / 24 ms, 3 |
| `series!`, 10 × 1 000 | 10 000 | 3.5 / 2.5 / 2.2 ms | 4.0 / 4.1 / 3.9 ms | 1.9 / 12 ms, 0 | 3.0 / 18 ms, 3 |
| `series!`, 100 × 100 | 10 000 | 3.7 / 0.9 / 2.4 ms | 3.0 / 1.3 / 3.1 ms | 2.8 / 9 ms, 0 | 3.9 / 19 ms, 1 |
| `lines!` ×10, 1 000 each | 10 000 | 3.6 / 3.0 / 2.2 ms | 4.4 / 3.9 / 4.7 ms | 1.7 / 12 ms, 0 | 2.5 / 21 ms, 2 |
| `series!`, 10 × 10 000 | 100 000 | 8.3 / 8.1 / 6.3 ms | 11.9 / 17.0 / 15.3 ms | 7.2 / 23 ms, 2 | 9.7 / 25 ms, 9 |
| `series!`, 100 × 1 000 | 100 000 | 7.7 / 10.2 / 6.3 ms | 13.1 / 13.6 / 8.7 ms | 8.1 / 13 ms, 0 | 8.8 / 32 ms, 7 |
| `series!`, 1 000 × 100 | 100 000 | 10.5 / 6.5 / 7.0 ms | 11.9 / 10.2 / 10.4 ms | 7.4 / 18 ms, 1 | 12.0 / 35 ms, 11 |
| `lines!` ×100, 1 000 each | 100 000 | 8.8 / 9.4 / 6.8 ms | 13.4 / 10.0 / 7.9 ms | 6.8 / 13 ms, 0 | 6.8 / 14 ms, 0 |

Up to 10 000 vertices a hover takes under 5 ms on both backends, well inside a frame. At 100 000
vertices it takes 6 to 17 ms whether the fade redraws or not. That cost is finding the line
under the pointer and reading out its sample, which predates the fade: the `:lines` hit test
measures the distance to every edge of every path in the layer, and the manifest lists
separate plots in order, so on the first of 100 `lines!` plots it stops after one plot
(2.8 / 1.8 ms on `:cairo`, 3.7 / 2.5 ms on `:webgl`) and on the last it has tested them all.
The fade's own cost, *swap* less *along* at the same end, is up to about 3 ms below 100 000
vertices and a few ms at 100 000, as large as the run-to-run noise there (*along* came out
above *swap* in five rows, two on `:cairo` and three on `:webgl`); the largest gap is the 1 000-line `series!` on
`:cairo`, 4 to 7 ms. Crossing lines on a 100 000-vertex figure then drops a frame now and then.
Across the table, the slow frames were mostly frames in which the fade redrew: 3 of 3 on `:cairo` and 30
of 36 on `:webgl`. The `:webgl` sweep has slow frames even at 1 000 vertices, where the whole
handler takes under 3 ms, so part of its count is the page's other work, not the hover. The
fix that keeps the 100 000-vertex figures inside a frame is the hit test (#469), not the fade;
see below.

Run-to-run noise on the container is large: across three runs the 100 000-vertex handler
times moved by up to 2 times, and the slow-frame counts more. The `:webgl` handler times
follow `:cairo`'s, as they should with the same overlay code; its frames are slow for another
reason, headless Chromium drawing the WGLMakie canvas in software, which puts each pair of
frames near 1 s and is not part of a hover.

**After #469.** The `:lines` hit test now keeps a bounding box for each run of 64 edges of a
path and skips any run farther from the pointer than the nearest edge found so far, or than the
layer's `tol`; the sample readout and the tooltip's walk along the hovered line use the same
boxes. The same run, same container, on the 100 000-vertex rows (the smaller rows did not
change beyond noise):

| Figure | vertices | `:cairo` swap / along / off | `:webgl` swap / along / off | `:cairo` sweep | `:webgl` sweep |
|--------|---:|---:|---:|---:|---:|
| `series!`, 10 × 10 000 | 100 000 | 3.5 / 2.8 / 2.9 ms | 5.8 / 3.5 / 3.1 ms | 1.9 / 12 ms, 0 | 1.8 / 23 ms, 1 |
| `series!`, 100 × 1 000 | 100 000 | 2.8 / 2.4 / 2.2 ms | 3.1 / 5.4 / 3.6 ms | 2.9 / 10 ms, 0 | 2.4 / 23 ms, 1 |
| `series!`, 1 000 × 100 | 100 000 | 3.2 / 0.9 / 3.1 ms | 2.8 / 1.3 / 2.6 ms | 3.2 / 11 ms, 0 | 5.0 / 15 ms, 0 |
| `lines!` ×100, 1 000 each | 100 000 | 4.1 / 2.9 / 2.5 ms | 4.1 / 5.2 / 2.5 ms | 3.4 / 10 ms, 0 | 3.2 / 13 ms, 0 |

A hover on these figures now takes 1 to 6 ms, the same as on a 10 000-vertex one, and the
sweeps have 0 slow frames on `:cairo` and 1 or 0 on `:webgl`, against 0 to 11 before.

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

### Outside Pluto

Measured by the outside-Pluto section of `bench/webgl_payload_size.jl` on 2026-10-15 at
`c47f40d`, WGLMakie 0.13.15, Makie 0.24.15, Julia 1.13. Outside Pluto (#300) a widget writes its
scene into the page as a JS literal, with typed arrays as base64 and each string of 256 B or more
written once (`_scene_js`), and fetches the WGLMakie bundle (1.09 MB, above) once per page from
the Makie tag. **scene JSON** is the scene as JSON, for scale; **scene JS** is the literal;
**page** is the whole widget as a registered install writes it (overlay script and bundle loaded
from the CDN); **checkout** adds the overlay script a git checkout inlines.

| figure | scene JSON | scene JS | page | checkout |
|---|---:|---:|---:|---:|
| 2D lines (200 pts), 600×450 | 324.5 KB | 176.3 KB | **193.1 KB** | 292.6 KB |
| 2D scatter + text (40), 600×450 | 424.9 KB | 243.0 KB | **257.0 KB** | 356.5 KB |
| 3D helix (300 pts), 600×450 | 544.4 KB | 266.1 KB | **279.7 KB** | 379.2 KB |
| 4-pt scatter, 400×260 | 482.0 KB | 274.1 KB | **285.5 KB** | 385.0 KB |
| heatmap + colorbar + legend, 600×450 | 882.5 KB | 455.2 KB | **470.4 KB** | 569.9 KB |

The literal is about half the JSON. What is left is mostly glyph bitmaps, Float32 distance
fields sent as base64 (about 260 KB of a 504 KB kind-sweep scatter page, by the #364 review's
count), then shader source written once per widget. So nearly every page with a WebGL figure
passes Documenter's 200 KiB limit and needs `size_threshold_ignore`. Sending the distance
fields as `u8` and widening them in `rewrap` would cut that part about 4×; not done yet.

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

### `onchange` frames

`bench/onchange_frames.jl`, 2026-10-15, at #366's round-1 fixes on `7b2f959`, Julia 1.13.1,
the cloud box, p50 of 10 after one discarded frame. The figure is a 10k-point scatter with a
line the function refits from a threshold; on `:webgl` two 300×300 heatmaps sit beside it.
Since #334 an `onchange` widget's manifest carries `onchange` and a `bind` list, and its frames
send the whole state. Julia side only, as above.

| backend | `onchange` in-drag | `onchange` release | pan in-drag / release | manifest | picture |
|---|---:|---:|---:|---:|---:|
| cairo | 175 ms | 263 ms | 175 / 245 ms | 381 KB | PNG 91 KB → 219 KB |
| webgl | 150 ms | 113 ms | 90 / 99 ms | 996 KB | scene 1480 KB packed |

An `onchange` frame costs what a pan frame on the same figure costs, plus the function and a
rebuild of the plan. Each frame sends the whole picture and manifest even when only the
2-point line changed: on `:webgl` that is about 2.5 MB per click. That is the settled
pipeline; sending only what changed is on the roadmap.

### Slider grid layer

A `SliderGrid`'s `:control` layer (#430) carries each slider's geometry plus its value label's
text for every value, written by the grid's `format` in Julia. That text rides every
`onchange` frame, so it stops at 101 values for a slider and 210 lo ≤ hi pairs (20 values)
for an interval slider; past that the browser writes the value. Measured on the PR #454 fix
commit (Julia 1.13.1, cloud box) as the layer's geometry in compact JSON, one slider per grid:

| slider | geometry |
|---|---:|
| 21 values, default format | 654 B |
| 101 values, format string | 1436 B |
| 10 001 values (past the cap) | 521 B |
| interval, 20 values (210 pairs) | 2663 B |
| interval, 21 values (past the cap) | 532 B |

Before the cap, one `0:0.001:10` slider made the manifest about 100 KB.

### Menu layer

A `Menu`'s `:control` layer (#429) carries what Makie draws for the open list: the cell height,
four cell and two text colours, the arrow's two paths, size and colour, and the search
placeholder. That adds about 410 B per menu whatever its length, on every `onchange` frame.
Measured on the PR's first commit (fc185e8, Julia 1.13.1, cloud box) as the layer's geometry in
compact JSON, before and after:

| menu | before | after |
|---|---:|---:|
| 3 options | 238 B | 645 B |
| 100 options | 1399 B | 1806 B |

### Control fonts

A `Menu`, `Button`, `Textbox` or grid value label also carries the font Makie draws its text in
(#476): 331 B of compact JSON for one of Makie's own fonts (family, two URLs, `sha384`), less
for a font of the author's (family only). The font file itself never rides the manifest: the
browser fetches it once per page, only when it draws one of these controls. Measured with Makie
0.24.16 (2026-10-30): `TeXGyreHerosMakie-Regular.otf` is 171 KB raw, 44 KB gzip, 33 KB brotli
as jsDelivr serves it; Bold, Italic and Bold Italic are 172–179 KB raw each, and each is a
separate fetch (a bold button next to a regular menu loads two). Makie's repo is past
jsDelivr's 50 MB limit, so jsDelivr serves only the files it has cached: on 2026-10-30 that
was Regular and Italic, then also Bold, and never Bold Italic. A file it refuses comes from
GitHub raw, uncompressed. Hashing the file in Julia is cached per file; a later call is 0.2 ms.
WGLMakie sends no font file of its own (figure text is a glyph atlas built in Julia), so there
is none on the page to reuse.

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

### First use in a session

`bench/first_use.jl`, 2026-10-29, Julia 1.13.3, cloud (4 cores), one fresh process per backend,
no browser, on base `2e31b72` ("before") and with PR #456 ("after"). Each step is the first of
its kind in the process; the workload is the `@compile_workload` each backend extension runs
from `src/precompile.jl`. Seconds, as the range of two runs: the higher "before" figures came
from a run with other work on the machine, the lower from a back-to-back rerun on an idle one.
Nearly all of each "before" figure is compile (96–100%).

| step | cairo before | cairo after | webgl before | webgl after |
|---|---:|---:|---:|---:|
| `using Masque, <backend>` | 4.8–7.1 | 4.7–8.2 | 4.8–7.9 | 5.4–9.0 |
| first `masque` (a pick) | 15.5–24.0 | 0.4–0.7 | 16.4–27.1 | 0.4–0.8 |
| first `show` | 0.5–1.2 | 0.01 | 1.0–2.5 | 0.02–0.05 |
| first bond value (a pick) | 0.9–1.5 | 0.1–0.4 | 0.8–1.3 | 0.1 |
| view warmup, pan + orbit | 5.6–8.5 | 0.3–0.5 | 4.8–8.8 | 0.2–0.4 |
| first `onchange` frame | 0.9 | 0.5 | 0.4 | 0.3–0.4 |
| any step, second figure | ≤ 0.24 | ≤ 0.24 | ≤ 0.22 | ≤ 0.22 |

Makie's own first render of the same figure is 1.8 s, so the "before" column is Masque's own
compile. Plot kinds the workload does not build still compile on first use: a figure that adds
stairs, violin and image to kinds it does build took 31 s before and 5.4 s after (Cairo; WebGL
the same). The kind-sweep notebook outside Pluto builds all its cells in 264 s before and 181 s
after, and its 11 view warmups, run back to back as the server does after the last cell, take
10.1 s before and 3.1 s after on Cairo (10.5 s and 2.4 s on WebGL). These three are from the
busier run only.

The cost: each backend extension precompiles in 1.5–2.5 min instead of 9–10 s (the two run in
parallel), its pkgimage grows from 0.06–0.2 MB to 47–50 MB (about the size of CairoMakie's own,
38 MB, and WGLMakie's, 60 MB), and loading is 0–1 s slower. The `precompile_workload` preference
on Masque turns the workload off.

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
