# 8. Payload scaling & robustness to large inputs

Measured in the Phase 0 spike (`perf-findings.md` is the single source of every number here; cite it,
don't restate). A rendered cell ships **two** payloads — the JS→Julia click return is negligible:

| Term | Carried by | Bounded by |
|---|---|---|
| **base64 PNG** | HTML `<img>` | the **display** (DPI/`max_width` policy → output px), *not* source resolution |
| **manifest** | `published_to_js` (MsgPack) | O(#hit-elements). A grid is O(source-cells) only while a cell is at least one screen pixel; below that, one value per screen pixel of the axis viewport |

**The manifest is the scaling wall** — not the PNG, not render, not hit-test CPU. A realistic single
plot is **50–400 KB total and render-bound** (~65 ms round-trip). High element counts reach multi-MB and
flip to **payload-bound** (~553 ms total measured at a 4.78 MB manifest). A sub-pixel heatmap no longer
ships the source matrix (§8); the case that reaches this regime by default is **high-N scatter**
(200k pts → 7.72 MB manifest). Nothing crashes — it degrades into the half-second range — but
tens of MB would lag the Pluto editor.

**M2.3 (tooltip wire format):** shipping per-element tooltip strings as a retired `tooltips[]` array
would have added O(N × string-bytes) — the dominant inflation term at high element counts (see
`perf-findings.md` §"Scope bounds for downstream phases" for the measured upper bounds). M2.3 avoids
this: tooltip content ships as two O(1)-per-layer fields — `template` (pre-parsed segments, present when
`tooltip` is a `Markup`) and a top-level `tipStyle` dict — leaving the per-element envelope unchanged.
See [§10](10-tooltips.md) Tooltips for the wire shape and authoring API.

**Robustness to large inputs (assume a user *will* do this) — implemented.** We ship a tool to
Pluto/Makie users, so assume someone overlays `masque` on a 2000²–4000² `heatmap!`/`image!` *because they
can*. The PNG is safe (display-bounded). The hover value has to survive a static export, so it is pushed
in the manifest rather than pulled per pointer move. What is pushed depends on whether a cursor can land
on one source cell:

**When the average cell is at least one screen pixel, ship the source matrix.** `values[]` is row-major,
`values[j * ncols + i]`. Hover, the tooltip, and `GridCellEvent` are the cell `findBin` hits. A
`missing` cell is stored as `NaN`. A matrix that is not real-valued ships no `values`, the same as on
the sub-pixel branch below.

**When the average cell is under one screen pixel, ship one source value per screen pixel of the axis
viewport.** The number is the cell under that pixel's center, found with the same bin search the overlay
uses, so irregular bins are exact and a fixed stride is not assumed. The array is `sample`, not
`values`: `ncols` / `nrows` stay the source shape, because a brush still slices the author's matrix.
`(i, j)` is not stored beside the value. The pixel center and the source edges name the cell. The
highlight is that screen pixel. A plain heatmap's limits are the cell edges, so the cells fill the
axis and every sample is a cell. A viewport pixel whose center misses the grid — a wider `limits`,
another plot on the axis, or a pan past the data — is `NaN` and is not a hit: no tooltip, no
highlight. A source cell that is itself `NaN`, `Inf`, or `missing` is still that cell (`missing`
is stored as `NaN`); hover shows `(i, j) = NaN` the same way the full matrix does. The overlay
tells a miss from a non-finite cell by running the bin search on the pixel center. A matrix that
is not real-valued, such as an `image!` of `RGB` / `RGBA`, ships neither `values` nor `sample` on
either branch: hover is the cell index with no numeric value. Source `xedges` / `yedges` stay at
source resolution on both branches.

The on-screen size is known at manifest-build. `cell_screen_px` is the tighter of the two average cell
sizes, in screen pixels: the projected edge span over the cell count, times `display_scale`
(`display_css / image_width`). The threshold is `GRID_VALUES_MIN_SCREEN_PX = 1`. One sample is one
screen pixel, not one PNG pixel: `sample_px = 1 / display_scale` image pixels (2 at the usual 2×
render). The geometry carries `sample_origin`, `sample_span`, `sncols`, `snrows`, and `sample_px`,
because `hitLayer` does not see the axis transform. The last sample on an edge is the remainder when
the viewport is not a whole number of pixels. A pan rebuilds the sample for the cells now on screen;
it does not make the sample finer. *Implemented:* `src/interactables.jl` (`_grid_sample`) and
`frontend/src/geometry.ts` (`hitGridSample`). The size is in `perf-findings.md`.

