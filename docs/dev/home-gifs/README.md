# Home feature GIFs

Source for `docs/src/assets/home/{hover,click,brush,legend,export}.gif`. Each GIF is a
Playwright recording against a harvested docs player (static overlay HTML), not a live
Pluto kernel.

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
| `hover.gif` | `tooltips_template.html` | Pointer over three points; tooltips |
| `click.gif` | `getting_started.html` | Hover Tokyo, click São Paulo; readout |
| `brush.gif` | `roi_table.html` | Drag the ROI onto the North cluster |
| `legend.gif` | `legend_lines.html` | Hover series `a`, click `b`; wash + readout |
| `export.gif` | `grids_heatmap.html` | Hover cells on a static overlay |
