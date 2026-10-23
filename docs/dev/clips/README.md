# Docs clips

A docs player records every state a reader can reach: every click, and every box a
`selects` brush can draw (`brush_states` in `docs/player_pipeline.jl`). Some examples can't
be a player, so their page shows a clip of the live notebook instead:

- the example redraws the figure (a control, `onchange`, a linked camera or pan), and the
  docs site has no Julia to redraw it;
- it holds several picks at once (`select = :many`), and a player records one change at a
  time;
- its brush has more distinct boxes than `BRUSH_STATES_MAX`.

| Clip | Page | Notebook | Recorder |
|---|---|---|---|
| `docs/src/assets/example-cluster.mp4` | Examples › Compare a cluster | `cluster_notebook.jl` | `test/e2e/cluster_clip.mjs` |
| `docs/src/assets/controls.mp4` | Sliders and toggles | `controls_notebook.jl` | `test/e2e/docs_clip.mjs controls` |
| `docs/src/assets/onchange.mp4` | Update the figure | `onchange_notebook.jl` | `test/e2e/docs_clip.mjs onchange` |
| `docs/src/assets/view-linkaxes.mp4` | Pan and orbit › Pan and zoom a 2D axis | `linkaxes_notebook.jl` | `test/e2e/docs_clip.mjs linkaxes` |
| `docs/src/assets/view-linkcameras.mp4` | Pan and orbit › Turn several panels together | `linkcameras_notebook.jl` | `test/e2e/docs_clip.mjs linkcameras` |
| `docs/src/assets/selection-many.mp4` | Selection › Select several marks | `selection_many_notebook.jl` | `test/e2e/docs_clip.mjs selection-many` |
| `docs/src/assets/grid-many.mp4` | Inspect a grid › Select several cells | `grid_many_notebook.jl` | `test/e2e/docs_clip.mjs grid-many` |
| `docs/src/assets/grid-regions.mp4` | Inspect a grid › Pick whole regions | `grid_regions_notebook.jl` | `test/e2e/docs_clip.mjs grid-regions` |
| `docs/src/assets/grid-brush.mp4` | Inspect a grid › Brush a block of cells | `grid_brush_notebook.jl` | `test/e2e/docs_clip.mjs grid-brush` |
| `docs/src/assets/view-pan.mp4` | Pan and orbit (top) | `view_pan_notebook.jl` | `test/e2e/docs_clip.mjs view-pan` |
| `docs/src/assets/view-orbit.mp4` | Pan and orbit › Orbit an `Axis3` | `view_orbit_notebook.jl` | `test/e2e/docs_clip.mjs view-orbit` |

The Home page's four loops have their own recorders: see `docs/dev/home-gifs/README.md`.

## Formats

Every clip is recorded at `deviceScaleFactor: 2` and kept at that size, so a Retina screen
shows the UI text sharp. Pages show a guide clip at most 640 px wide and a Home loop at most
720 px.

- **MP4** for the guide clips (15–25 s), which a reader pauses and replays, and for the short
  loops where the whole figure moves (the two `view-*` loops, Home's orbit). `assemble_mp4.sh`
  writes H.264 at CRF 22 with `-tune animation`.
- **Lossless animated WebP** for the Home loops where only the overlay changes (hover, click,
  legend): sharper than a GIF and shown with a plain markdown image. `assemble_webp.py` writes
  them with libwebp's animation encoder through Pillow, which stores only what changed between
  frames. Where the whole figure moves, lossless WebP is 5–18× the MP4 (view-pan: 2.8 MB
  against 155 KB), and ffmpeg's own WebP encoder, which stores whole frames, is worse still.

Re-record from `test/e2e`, with a Pluto server whose notebooks can load this checkout
(`serve.jl` with `MASQUE_DEV_ENV` set to a warmed env, see `CLAUDE.md`) and `ffmpeg` on
PATH:

```sh
MASQUE_DEV_ENV=~/.julia/environments/masque-dev julia serve.jl 1240 &
# poll curl http://localhost:1240 → 200
node cluster_clip.mjs http://127.0.0.1:1240 "$PWD/../../docs/dev/clips/cluster_notebook.jl" /tmp/cluster-clip
../../docs/dev/clips/assemble_mp4.sh /tmp/cluster-clip ../../docs/src/assets/example-cluster.mp4
# the guide clips: docs_clip.mjs <url> <notebook> <frames-dir> <clip>
node docs_clip.mjs http://127.0.0.1:1240 "$PWD/../../docs/dev/clips/grid_many_notebook.jl" /tmp/grid-many grid-many
../../docs/dev/clips/assemble_mp4.sh /tmp/grid-many ../../docs/src/assets/grid-many.mp4
node docs_clip.mjs http://127.0.0.1:1240 "$PWD/../../docs/dev/clips/view_pan_notebook.jl" /tmp/view-pan view-pan
../../docs/dev/clips/assemble_mp4.sh /tmp/view-pan ../../docs/src/assets/view-pan.mp4 40
```

`cluster_clip.mjs` drags the box three times (set it down on the upper cluster, move it to the
lower one, pull a corner in to half of it) and waits after each release until Julia has
redrawn the histogram, so every histogram in the clip is a real recomputation.
`assemble_mp4.sh` keeps the captured pacing; its optional third argument sets how long the
last frame holds (1500 ms, or 40 for the `view-*` loops, which end where they start).

`docs_clip.mjs` aims from the widget's manifest, which each guide notebook writes into a
hidden cell, and after each move it waits until Julia has redrawn the figure or the readout
below it. Its notebooks keep the guide page's code, with a title that says what to do.
