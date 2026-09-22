# Home feature GIFs

Source for `docs/src/assets/home/{hover,click,brush,legend,orbit}.gif`.
Hover, click, brush, and legend are Playwright recordings against a
harvested docs player (static overlay HTML), not a live Pluto kernel.
Orbit is CairoMakie camera frames: `ViewInteractable` streams PNG over
`with_js_link`, which is dead on a static overlay-only harvest, so
`record-orbit.jl` steps `Axis3` azimuth and writes frames itself.
The static-export Home section is a harvested embed, not a GIF.

Prerequisites: a docs build served at `http://localhost:8765/`
(`python3 -m http.server` from `docs/build`), Playwright in `test/e2e`,
and `ffmpeg` / `ffprobe` / `python3` on PATH. Orbit needs the docs Julia
project (`CairoMakie`) and does not need the docs server.

```sh
docs/dev/home-gifs/record-all.sh http://localhost:8765
```

Or one scenario from `test/e2e`:

```sh
node home_feature_gifs.mjs http://localhost:8765 hover /tmp/home-gifs/hover
../../docs/dev/readme-demo/assemble.sh /tmp/home-gifs/hover ../../docs/src/assets/home/hover.gif
```

Orbit:

```sh
julia --project=docs docs/dev/home-gifs/record-orbit.jl /tmp/home-gifs/orbit
docs/dev/readme-demo/assemble.sh /tmp/home-gifs/orbit docs/src/assets/home/orbit.gif
```

`assemble.sh` rescales each capture to 8 s and 720 px wide.

| GIF | Player / source | Motion |
|---|---|---|
| `hover.gif` | `home_hover_stars.html` | Pointer over Sirius, Rigel, Betelgeuse; tooltips |
| `click.gif` | `getting_started.html` | Hover Tokyo, click São Paulo; readout |
| `brush.gif` | `home_brush_stations.html` | Drag the ROI onto the Cascadia stations |
| `legend.gif` | `home_legend_classes.html` | Hover Adelie, click Gentoo; fade + readout |
| `orbit.gif` | `record-orbit.jl` (trefoil on `Axis3`) | Azimuth orbit of a trefoil-knot tube |
