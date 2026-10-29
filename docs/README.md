# Docs index

User docs are the [Documenter site](https://jowch.github.io/Masque.jl), built from
[`docs/src/`](src/). Maintainer notes are [`docs/dev/`](dev/):

Building the site harvests cell-series players (`docs/export_embeds.jl`) into
`docs/src/embeds/*.html`, so a local build takes several minutes on a warm depot and
longer cold. A player records every click its figure offers, read from the widget's
manifest (`player_states` in `docs/player_pipeline.jl`); its TOML lists only brushes.
A player records one field at a time, so a reader who clicks two plots sees only the latest
click; `pairs = true` in the TOML also records each click on one field with each click on
another, for a page about a value with several fields.
Identical snapshots are stored once, and a player over 2 MiB of snapshots fails the
build: give the notebook fewer marks or a coarser grid. Set `MASQUE_SKIP_EMBED_EXPORT=true` to reuse players already in
`docs/src/embeds/` when iterating on prose.

A page can show one notebook in several parts with prose between them. The player TOML names
each part under `[player.segments]` as `name = [cell ids]`, covering every cell in `cells`
once, and each part goes in its own iframe with `data-masque-segment="<name>"` and its own
text twin, `Main.masque_fallback("<name>"; segment = "<part>")`. The parts share the
notebook's `@bind` value: a click in the part showing the widget updates the cells in the
others. `docs/src/roi.md` is the example.

A player also records every setting of the widget's controls (`control_states`, at most 200).
When the widget has `onchange`, harvest runs its frame callback for each recorded value and
writes the redrawn picture and its manifest to `<name>.frames/`, named by content; the page
fetches a frame only when the reader reaches that value. CairoMakie only. A value the harvest
skipped (picks and moved controls together, say) leaves the figure and cells as they were and
says it wasn't computed. Every player links a copy of its notebook, `embeds/downloads/<name>.jl`,
without the player TOML and the manifest that points Masque at this checkout.
`docs/src/controls.md` is the example.

A Pluto-export player carries none of its overlay script, pictures or recorded cells. Harvest
writes each to `embeds/shared/`, named by its content, so a file two players or two states
share is one download the browser caches across pages. The page loads the overlay script from
`<head>` and fetches a state's cells the first time the reader reaches it.

Each Pluto-export player is followed by its text twin: a `details` block built from the same
notebook by an `@eval Main.masque_fallback("<name>")` cell (`docs/player_fallback.jl`), so
search indexes the tutorial code and a reader still gets it when Pluto's frontend cannot load
from jsDelivr (`assets/masque-embed.js` then hides the iframe and opens the twin). Harvest adds
the idle figure and plain-text readouts as `<name>.png` / `<name>.fallback.toml`.

Every player iframe needs an `id`. Before it deploys, the CI docs build opens each page with
players at several window widths and writes each player's height for the column it sits in
(`test/e2e/measure_players.mjs`, run by `docs/make.jl` when `MASQUE_MEASURE_PLAYERS=true`).
It fails on an iframe without an `id`. The `height:` in the Markdown is only a first guess,
and a local build keeps it.

| Doc | What it covers |
|---|---|
| [`architecture.md`](dev/architecture.md) | The design contract: `AbstractBackend`/`AbstractInteractable`, the geometry primitives between them, the manifest shape, tooltips wire format. |
| [`frontend-delivery.md`](dev/frontend-delivery.md) | Browser-side build/delivery decisions: bundling, manifest transport, DPI/sizing, JS testing, CI. |
| [`live-interaction-checklist.md`](dev/live-interaction-checklist.md) | The live-verification playbook run against a real Pluto + browser before any user-facing change is called done. |
| [`perf-findings.md`](dev/perf-findings.md) | The measured payload-size and latency envelope of both backends, and how they compare; the single source of those numbers for the rest of the docs. |
| [`roadmap.md`](dev/roadmap.md) | What is left to build, by topic, and what we decided not to build. Release plans are GitHub milestones. |
