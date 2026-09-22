# Home feature GIFs

Source for `docs/src/assets/home/{hover,click,brush,legend}.gif`. Each GIF is a
Playwright recording against a harvested docs player (static overlay HTML), not a live
Pluto kernel. The static-export Home section is a harvested embed, not a GIF.

Prerequisites: a docs build served at `http://localhost:8765/` (`python3 -m http.server`
from `docs/build`), Playwright in `test/e2e`, and `ffmpeg` / `ffprobe` / `python3` on PATH.

```sh
docs/dev/home-gifs/record-all.sh http://localhost:8765
```

Or one scenario from `test/e2e`:

```sh
node home_feature_gifs.mjs http://localhost:8765 hover /tmp/home-gifs/hover
../../docs/dev/readme-demo/assemble.sh /tmp/home-gifs/hover ../../docs/src/assets/home/hover.gif
```

`assemble.sh` rescales each capture to 8 s and 720 px wide.

| GIF | Player | Motion |
|---|---|---|
| `hover.gif` | `home_hover_stars.html` | Pointer over Sirius, Rigel, Betelgeuse; tooltips |
| `click.gif` | `getting_started.html` | Hover Tokyo, click São Paulo; readout |
| `brush.gif` | `home_brush_stations.html` | Drag the ROI onto the Cascadia stations |
| `legend.gif` | `home_legend_classes.html` | Hover Adelie, click Gentoo; fade + readout |
