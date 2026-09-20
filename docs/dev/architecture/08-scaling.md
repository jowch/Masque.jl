# 8. Payload scaling & robustness to large inputs

Measured in the Phase 0 spike (`perf-findings.md` is the single source of every number here; cite it,
don't restate). A rendered cell ships **two** payloads — the JS→Julia click return is negligible:

| Term | Carried by | Bounded by |
|---|---|---|
| **base64 PNG** | HTML `<img>` | the **display** (DPI/`max_width` policy → output px), *not* source resolution |
| **manifest** | `published_to_js` (MsgPack) | **unbounded by display** — O(#hit-elements) + O(source-cells) for grids |

**The manifest is the scaling wall** — not the PNG, not render, not hit-test CPU. A realistic single
plot is **50–400 KB total and render-bound** (~65 ms round-trip). High element counts reach multi-MB and
flip to **payload-bound** (~553 ms total measured at a 4.78 MB manifest). Since the `values[]` cap (§8)
keeps even a 1 M-cell heatmap render-bound, the case that reaches this regime by default is now **high-N
scatter** (200k pts → 7.72 MB manifest). Nothing crashes — it degrades into the half-second range — but
tens of MB would lag the Pluto editor.

**M2.3 (tooltip wire format):** shipping per-element tooltip strings as a retired `tooltips[]` array
would have added O(N × string-bytes) — the dominant inflation term at high element counts (see
`perf-findings.md` §"Scope bounds for downstream phases" for the measured upper bounds). M2.3 avoids
this: tooltip content ships as two O(1)-per-layer fields — `template` (pre-parsed segments, present when
`tooltip` is a `Markup`) and a top-level `tipStyle` dict — leaving the per-element envelope unchanged.
See [§10](10-tooltips.md) Tooltips for the wire shape and authoring API.

**Robustness to large inputs (assume a user *will* do this) — implemented.** We ship a tool to
Pluto/Makie users, so assume someone overlays `masque` on a 2000²–4000² `heatmap!`/`image!` *because they
can*. The PNG is safe (display-bounded), but the `:grid` `values[]` matrix is **source-bounded**, so that
routine input ships tens of MB of redundant numbers on top of the PNG that already shows them — and the
user's matrix already lives in their Julia session. `values[]` exists only to power the no-round-trip
`(i,j)=value` hover, so it is dropped when the hover can't target a cell:

**The cap criterion: compute the cell's *expected on-screen* size on the fly, and drop `values[]` when it's
sub-pixel.** A Pluto output cell is only so wide — the display is **bounded by the column** (`max_width`,
700 px default), so the on-screen size is known at manifest-build. Everything needed is already in hand:
`display_css = min(scene_width, max_width)` (the column-bounded display width), the axis viewport in image
px (we project the edges anyway), and the output image width. So
`cell_screen_px = (viewport_image_px / ncols) × (display_css / image_width)`. Under today's DPI policy the
PNG is rendered at 2× the display width (`px_per_unit = 2·min(scene, max_width)/scene`), so that ratio is
0.5 and it reduces to `cell_image_px / 2` — but compute the ratio rather than hardcode ÷2, so it tracks the
policy / wide-mode `max_width`. **Ship `values[]` only when `min(cell_screen_px) ≥ τ`** (τ ≈ 1–2 px); below
that the user *cannot* put the cursor over an individual cell, so the per-cell value is useless and is
dropped. This is an *expected* size (it assumes the default column; the overlay still hit-tests against the
true runtime scale via `getBoundingClientRect`, so the estimate only gates ship/drop). Self-tuning: for a
600-wide figure a 50² heatmap is ~12 px/cell (keep), 200² is ~3 px (keep), **1000² is ~0.6 px (drop)**,
2000²–4000² are 0.3–0.15 px (drop) — and it **subsumes the special `Image` case** (images are source-res >
display-res → sub-pixel → auto-dropped), so no separate rule is needed. When dropped, the payload falls back
to `{i,j}` (the click still localizes the region) and a one-time `@warn` fires (fail-loud). Measured size
benefit: 499× smaller at 1000² (`perf-findings.md`). M2.3 owns the `{i,j,value}` payload shape, but the cap
is decoupled and ships independently. *Implemented:* `src/interactables.jl` (`GRID_VALUES_MIN_SCREEN_PX`,
the `:grid` hitlayer) gated on `InteractionContext.display_scale` (= `display_css / image_width`, set in
`context()`); the overlay tolerates an absent `values[]` (hover shows `(i,j)` only).

