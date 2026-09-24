# Docs index

User docs are the [Documenter site](https://jowch.github.io/Masque.jl), built from
[`docs/src/`](src/). Maintainer notes are [`docs/dev/`](dev/):

Building the site harvests cell-series players (`docs/export_embeds.jl`) into
`docs/src/embeds/*.html`, so a local build takes several minutes on a warm depot and
longer cold. A player records every click its figure offers, read from the widget's
manifest (`player_states` in `docs/player_pipeline.jl`); its TOML lists only brushes.
Identical snapshots are stored once, and a player over 2 MiB of snapshots fails the
build: give the notebook fewer marks or a coarser grid. Set `MASQUE_SKIP_EMBED_EXPORT=true` to reuse players already in
`docs/src/embeds/` when iterating on prose.

Each Pluto-export player is followed by its text twin: a `details` block built from the same
notebook by an `@eval Main.masque_fallback("<name>")` cell (`docs/player_fallback.jl`), so
search indexes the tutorial code and a reader still gets it when Pluto's frontend cannot load
from jsDelivr (`assets/masque-embed.js` then hides the iframe and opens the twin). Harvest adds
the idle figure and plain-text readouts as `<name>.png` / `<name>.fallback.toml`.

| Doc | What it covers |
|---|---|
| [`architecture.md`](dev/architecture.md) | The design contract: `AbstractBackend`/`AbstractInteractable`, the geometry primitives between them, the manifest shape, tooltips wire format. |
| [`backend-comparison.md`](dev/backend-comparison.md) | Cost/latency comparison between the `:cairo` and `:webgl` backends. |
| [`frontend-delivery.md`](dev/frontend-delivery.md) | Browser-side build/delivery decisions: bundling, manifest transport, DPI/sizing, JS testing, CI. |
| [`live-interaction-checklist.md`](dev/live-interaction-checklist.md) | The live-verification playbook run against a real Pluto + browser before any user-facing change is called done. |
| [`perf-findings.md`](dev/perf-findings.md) | The measured payload-size and click-latency envelope; the single source of those numbers for the rest of the docs. |
| [`roadmap.md`](dev/roadmap.md) | Open work, non-goals, and the order to tackle it. |
