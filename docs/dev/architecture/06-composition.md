# 6. How it composes — the three interaction tiers

This architecture supports exactly the three tiers from the latency analysis, and the interface maps to
them cleanly:

- **Tier 0 (overlay, 60 fps, no Julia):** hover, live coordinate readout, and dragging *overlay*
  geometry. Enabled by shipping `AxisTransform` to JS. `events(i)` with only `:hover` keeps it local.
- **Tier 1 (precomputed):** `hitlayers(i, ctx)` *is* this tier — Julia computes regions once after
  `update_state_before_display!`. Animation = a precomputed frame sequence (a future `frames` slot on
  the manifest; the format is designed not to preclude it). **It is the one payload-unbounded feature**
  (total = frames × per-frame PNG): ~5.5 MB (187 KB × 30) to ~22 MB (× 120) for a typical plot, 100s of MB
  at scale. The `frames` slot must shrink per-frame cost (downscale / fewer frames) before it ships — [§8](08-scaling.md#8-payload-scaling--robustness-to-large-inputs).
- **Tier 2 (round-trip):** `:click` events → `@bind`. Discrete server re-render from new state is
  in scope on **both** backends for the *committed* value — a click, a keyboard commit, a slider-
  or widget-driven view change — each lands through `@bind` exactly as any other Tier 2 value,
  backend-symmetric. A view-manipulation gesture's own camera/`limits` value is **not** among
  them: camera state is operational, not analysis, and never enters notebook state ([§12.3](12-gesture-channel.md#123-what-commits-and-when)).
  Landing through `@bind` commits the value; it does not by itself force a server re-render — a
  click's own selection highlight is drawn client-side with no round trip ([§5](05-bond-value.md#5-the-bond-value)), so a re-render
  happens only if the notebook's own reactive graph feeds the committed value into a new cell.
  What differs when a re-render *does* happen is **cost**: `:webgl` re-serializes (~flat) while
  `:cairo` re-rasterizes (scales with the scene) — see `backend-comparison.md`. The **in-drag
  frames** of a view-manipulation gesture are not Tier 2 traffic at all — they never touch
  `@bind`, never re-execute a cell, and the two backends implement them by completely different
  mechanisms; see [§12](12-gesture-channel.md#12-the-gesture-channel-102) for the contract those frames follow. *Per-frame* faithful redraw
  (smooth-drag-as-a-guarantee) is a shared latency wall on both, not a `:cairo`-only exclusion.

**Named tensions (accepted, not bugs):**
1. `AxisInteractable` returns no region geometry — it rides the `:axis` channel as an unbounded
   catch-all. `ColorbarInteractable` (M3) also uses `:axis` but ships a bbox so the hit region is
   bounded to the colorbar's pixel extent. Worth the shared channel: both collapse into the
   `AxisTransform` already shipped, with no new JS primitive.
2. No general z-order/`Consume` model for overlapping custom regions — JS is first-match-wins in
   manifest order. `build_manifest` now imposes one fixed precedence on that order (not a general
   layering model): `LegendInteractable` layers sort first (a legend drawn over plot geometry
   must win the pixels under it, or it's unhoverable — M3 Legend,
   [§7](07-scope.md#7-v1-scope)), `:view`
   layers sort last (an ordinary drag wins over the catch-all pan/orbit gesture without a
   modifier — resolves the v1 ScatterLines points-over-segments collision too), everything else
   keeps its original relative order. We adopt Makie's `events` *vocabulary* now for
   forward-compat, not its propagation machinery. A general Consume/z-order model for
   user-stacked custom regions stays YAGNI until someone actually needs to control ordering
   between two of their OWN overlapping interactables — the two cases handled by the fixed rule
   above are structural (a legend/view layer's role, not the caller's choice).

