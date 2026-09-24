# Home feature GIFs

Source for `docs/src/assets/home/{hover,click,brush,legend,orbit}.gif`.
Hover, click, brush, and legend are Playwright recordings against a
harvested docs player (static overlay HTML), not a live Pluto kernel.
Orbit is a live Pluto drag: `ViewInteractable` streams PNG frames over
`with_js_link`, which is dead on a static overlay-only harvest. The
recorder opens `orbit_notebook.jl` and drives a pointer drag with a
visible cursor. The static-export Home section is a harvested embed,
not a GIF.

Prerequisites: a docs build served at `http://localhost:8765/`
(`python3 -m http.server` from `docs/build`), Playwright in `test/e2e`,
and `ffmpeg` / `ffprobe` / `python3` on PATH. Orbit also needs a live
Pluto server (`test/e2e/serve.jl`).

```sh
MASQUE_DEV_ENV=~/.julia/environments/masque-dev \
  julia test/e2e/serve.jl 1240
# poll curl http://localhost:1240 → 200

docs/dev/home-gifs/record-all.sh http://localhost:8765
```

`record-all.sh` records hover/click/brush/legend from the docs server
and orbit from `MASQUE_ORBIT_PLUTO` (default `http://localhost:1240`).

Or one overlay scenario from `test/e2e`:

```sh
node home_feature_gifs.mjs http://localhost:8765 hover /tmp/home-gifs/hover
../../docs/dev/readme-demo/assemble.sh /tmp/home-gifs/hover ../../docs/src/assets/home/hover.gif
```

Orbit:

```sh
node home_orbit_gif.mjs http://localhost:1240 \
  ../../docs/dev/home-gifs/orbit_notebook.jl /tmp/home-gifs/orbit
../../docs/dev/readme-demo/assemble.sh /tmp/home-gifs/orbit ../../docs/src/assets/home/orbit.gif
```

`assemble.sh` rescales each capture to 8 s and 720 px wide.

| GIF | Player / source | Motion |
|---|---|---|
| `hover.gif` | `home_hover_stars.html` | Pointer over Sirius, Rigel, Betelgeuse; tooltips |
| `click.gif` | `getting_started.html` | Hover Tokyo, click São Paulo; readout |
| `brush.gif` | `home_brush_stations.html` | Drag the ROI onto the Cascadia stations |
| `legend.gif` | `home_legend_classes.html` | Hover Adelie, click Gentoo; fade + readout |
| `orbit.gif` | live Pluto `orbit_notebook.jl` | Cursor-drag orbit of a trefoil-knot tube |
