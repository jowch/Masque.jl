# Home feature loops

Source for `docs/src/assets/home/{hover,click,legend}.webp` (lossless animated WebP) and
`orbit.mp4`, recorded at 2× (see `docs/dev/clips/README.md` § Formats).

Hover, click, and legend are Playwright recordings against a
harvested docs player (static overlay HTML), not a live Pluto kernel.
Orbit is a live Pluto drag: `ViewInteractable` streams PNG frames over
`with_js_link`, which is dead on a static overlay-only harvest. The
recorder opens `orbit_notebook.jl` and drives a pointer drag with a
visible cursor. The static-export Home section is a harvested embed,
not a loop.

Prerequisites: a docs build served at `http://localhost:8765/`
(`python3 -m http.server` from `docs/build`, or the deployed
`https://jowch.github.io/Masque.jl/dev` when `main` shows what you want), Playwright in `test/e2e`,
`python3` with Pillow, and `ffmpeg` for the orbit loop. Orbit also needs a live
Pluto server (`test/e2e/serve.jl`).

```sh
MASQUE_DEV_ENV=~/.julia/environments/masque-dev \
  julia test/e2e/serve.jl 1240
# poll curl http://localhost:1240 → 200

docs/dev/home-gifs/record-all.sh http://localhost:8765
```

`record-all.sh` records hover/click/legend from the docs server
and orbit from `MASQUE_ORBIT_PLUTO` (default `http://localhost:1240`).

Or one overlay scenario from `test/e2e`:

```sh
node home_feature_gifs.mjs http://localhost:8765 hover /tmp/home-gifs/hover
python3 ../../docs/dev/clips/assemble_webp.py /tmp/home-gifs/hover ../../docs/src/assets/home/hover.webp --length-ms 8000
```

Orbit:

```sh
node home_orbit_gif.mjs http://localhost:1240 \
  ../../docs/dev/home-gifs/orbit_notebook.jl /tmp/home-gifs/orbit
../../docs/dev/clips/assemble_mp4.sh /tmp/home-gifs/orbit ../../docs/src/assets/home/orbit.mp4
```

`--length-ms 8000` rescales each overlay capture to 8 s; the orbit loop keeps its captured
pacing. The frames keep their 2× size.

| Loop | Player / source | Motion |
|---|---|---|
| `hover.webp` | `home_hover_stars.html` | Pointer over Sirius, Rigel, Betelgeuse; tooltips |
| `click.webp` | `getting_started.html` | Hover Tokyo, click São Paulo; readout |
| `legend.webp` | `home_legend_classes.html` | Hover Adelie, click Gentoo; fade + readout |
| `orbit.mp4` | live Pluto `orbit_notebook.jl` | Cursor-drag orbit of a trefoil-knot tube |
