# Docs clips

A docs player records every state a reader can reach: every click, and every box a
`selects` brush can draw (`brush_states` in `docs/player_pipeline.jl`). An example whose
brush has more distinct boxes than `BRUSH_STATES_MAX` cannot be a player, so its page shows
a clip of the live notebook instead.

| Clip | Page | Notebook | Recorder |
|---|---|---|---|
| `docs/src/assets/example-cluster.mp4` | Examples › Compare a cluster | `cluster_notebook.jl` | `test/e2e/cluster_clip.mjs` |

Re-record from `test/e2e`, with a Pluto server whose notebooks can load this checkout
(`serve.jl` with `MASQUE_DEV_ENV` set to a warmed env, see `CLAUDE.md`) and `ffmpeg` on
PATH:

```sh
MASQUE_DEV_ENV=~/.julia/environments/masque-dev julia serve.jl 1240 &
# poll curl http://localhost:1240 → 200
node cluster_clip.mjs http://127.0.0.1:1240 "$PWD/../../docs/dev/clips/cluster_notebook.jl" /tmp/cluster-clip
../../docs/dev/clips/assemble_mp4.sh /tmp/cluster-clip ../../docs/src/assets/example-cluster.mp4
```

The recorder drags the box three times (set it down on the upper cluster, move it to the
lower one, pull a corner in to half of it) and waits after each release until Julia has
redrawn the histogram, so every histogram in the clip is a real recomputation.
`assemble_mp4.sh` keeps the captured pacing and writes H.264 at 720 px wide.
