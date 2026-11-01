# Live interaction **and** visual playbook

A user-facing change is not done until this playbook has been driven in a real Pluto + browser
on **every supported backend** (today `:cairo` and `:webgl`) **across the interactable kinds**
below. A 2-plot kitchen-sink (scatter wash + line ring) is a chrome smoke, not verification.

This playbook is **interaction and visual**. Both halves are required. Do not treat
`KIND SWEEP OK` as visual fidelity, and do not treat kitchen-sink chrome as the kind sweep.

## Visual language (settled)

Two cues, each with one meaning (since 0.4.2): **a fade means a set is
in focus** (a line, which is a whole series; a legend entry; the picks of a plot), and **the halo
means "this one"** (a point, bar, cell or region, a line's sample, keyboard focus). Hovering one
point, bar or cell never fades the rest: it would strobe while skimming, hide the cells a heatmap
is for, and redraw on every pointer move.

Recipes: hover highlight is a split, a brightening color-dodge fill plus the halo, not a
mark-derived colour. `colors` (today `scatter!`'s `color=`) feeds only the tooltip accent and the
selected look's repaint and outline (below), never the hover highlight. The shadow root holds
THREE sibling top-level overlay svgs with identical box/viewBox, each with its own `g.hi`/`g.sel`:
`svg.masque-fill` (`mix-blend-mode: color-dodge`, both light and dark figures) draws the fill
half of a hover highlight and of a grid cell's or region's selected highlight
(`masque-hi masque-fillshape`, computed fill `rgb(20, 20, 20)` / `#141414`, fill-opacity 1, no
stroke); `svg.masque-edge` (no blend) draws the halo. Firefox only honours `mix-blend-mode` on a
top-level svg, not nested SVG content, which is why the dodge fill is its own sibling svg; the
edge svg stays a sibling so the halo paints above that fill and below the plain chrome. Dodge
against the near-black `#141414` source was, across a measured 10-colour palette, the only fill
candidate that never rotated hue more than 8° and never dimmed a mark.

The halo is a `g.masque-halo` of three strokes of the mark's own geometry: a casing band
(`masque-halo-case masque-halo-outer`), the ink core (`masque-hi masque-hover` for hover and
focus, `masque-hi masque-wash` for a pick), and an inner casing band (`masque-halo-inner`). The
ink is Pluto's off-black `#1f1f1f` (hsl 0 0% 12%) on a light plot area and off-white `#fafafa`
(hsl 0 0% 98%) on a dark one, the casing the other; it stays at least 3.97:1 against any colour,
where any single grey falls to 1:1 somewhere on every colormap. overlaystyle `color` sets the
core; a layer's `hoverstyle` stroke still takes the plain path below. Each band is
`--masque-halo-u` = `max(1 / devicePixelRatio, 0.5)` CSS px (one device pixel; a resolution
media query keeps it current on zoom or a move to another screen). Hover and focus are 1/1/1
bands (casing, ink, casing), a pick 1/2/1: hover 1.5 px and pick 2 px on a 2× screen, 3 and 4 px
on 1×. overlaystyle `hover_width` and `selected_width` set the core. Where the bands sit follows
the element: **inside** an area's edge (cell, bar, polygon, region; `masque-halo-in`, clipped to
the shape), so neighbouring outlines never overlap; **outside** a point's (`masque-halo-out`,
masked off the mark), so a small marker keeps its own colour; **centred** on an area under 12
image px on a side (`masque-halo-mid`); and **outside a line's drawn width** on both sides
(`masque-halo-line`, masked off the line's stroke, sized in image px from the manifest's
`linewidth` and `--masque-k`), so the series keeps its colour.

Per geometry: a hovered closed mark (circle/rect/polygon) draws the fill shape and the halo; an
open seg draws the halo only; a `selects`-ROI's grid cell-block union rect (`"rectfill"` geom
tag) draws the fill shape only, since the ROI box itself is already its outline. A
`select = :many` grid's held cells (`"mask"` geom tag, one hit per field) draw ONE fill shape over
every held cell and a halo on the selection's OUTLINE only, inside it, so the block reads as one
region, not a lattice. A picked point on a bound line draws a pick halo outside a circle at that
data point, radius the line's hit slack (`tol`). Hovering a line (`kind = :lines` with samples)
draws a hover halo outside a dot at the sample the tooltip reads out (radius the larger of 0.75
`tol` and the line width), never a stroke along the line, and fades the axis's other lines
(below); a line with no sample on screen is cased along its length. The third svg,
`svg.masque-plain` (unblended), holds ROI/threshold and hover highlights (and a grid cell's
selected one) for a layer with an explicit `hoverstyle` stroke: single element, stroke verbatim
+ 18%/35% tint in that colour, open shapes staying stroke-only there (no `masque-hover`,
`fill: none`). Browsers without `mix-blend-mode` draw the fill as chrome grey at 0.18 opacity. A
scatter circle's highlight `r` is the marker's DRAWN radius, not `markersize / 2` (default
`:circle` marker ≈0.3525×`markersize`; a `Circle`/`Rect` geometry marker draws at `markersize`;
anything else falls back to `markersize / 2`; the fill and halo share identical geometry, so `r`
is checked on both). Hover is not selected. Motion is an 80–120 ms opacity fade on tip /
highlight, on the halo group as one unit; no pulse on a same-hit remount.

Selected closed marks and lines (circles, rects, polygons, #394; lines, 0.4.2): once a plot holds
a pick (one or many, from the first pick), its unpicked marks fade toward the plot area's colour
(the axis background over the figure's; the manifest's transform `fill`, else `background`) and
the picks keep the image's own pixels. Nothing goes in `g.sel`: each axis has a
`div.masque-fade[data-axis]` under the three svgs with two canvases in image px, each covering
only the axis viewport and clipped to it (a mark past the limits is never drawn). The
`canvas.masque-dim` covers every unpicked mark of the plot (grown 1.5 image px; a line is stroked
at its `linewidth` grown the same) in that colour, punches the picks back out (grown 0.5), and
shows at CSS opacity `1 - --masque-unpicked-opacity` (default 0.2 left showing; overlaystyle
`unpicked_opacity`). The `canvas.masque-top` repaints, in the mark's own `colors`, only a pick
that an unpicked mark drawn after it covers (a pick nothing covers keeps its stroke and marker
shape), and draws a 1 CSS px outline on a lone pick of the selection (never a preview's marks,
never a line): one with no other pick whose box is within one of its own radii (two equal
circles: centres 3 radii apart). The outline is the layer's `hoverstyle` stroke or the figure's
overlaystyle `color` when one is set, else the mark's colour moved 45% toward black on a light
plot area or white on a dark one, else (no `colors`) the chrome grey. Other plots in the axis,
grid lines and text keep their look, except where a faded mark's cover lies over them; a legend's
pick fades every series that legend names, lines included, and the picked line keeps its own
colour (no wash). A whole line picked with no other line in scope to fade (a lone line on an
Axis3) keeps a pick halo along it instead. The picks are punched out in drawing order (each
layer's `draw`, its plot's place in the backend's order), and a faded line drawn after a kept
mark it meets (or any faded mark drawn after a kept line) has its cover put back over it, so a
faded line stays faded where it crosses a kept one (#462); a line drawn under a kept one is
already hidden by it in the image. Layers listed by hand with `auto = false` carry no `draw`, and
then only a layer's own elements are put back over each other. On an Axis3 nothing is put back:
the backend's depth test, not the drawing order, decides which line is in front there. Known gaps: only a covered circle pick is
repainted (a picked bar or polygon under a later unpicked one stays faded where they overlap; on
an Axis3 a faded line in front of a kept one shows unfaded where they cross),
and a non-circular scatter marker (`:rect`, `:diamond`) is covered and punched as a circle.

Previews fade the same way, but leave more showing: `1 - --masque-preview-opacity` (default 0.35
left showing; overlaystyle `preview_opacity`; the wrapper carries `masque-preview`) on an axis
holding no picks, and the pick strength on one that does. A legend entry's hover previews its
series (kept, the legend's other series faded, no outlines on its members; a legend with one
series fades nothing, as a click on it does), and hovering a line previews it against the axis's
other lines. Hover draws over a pick like any mark (the pick has no stroke for it to thin);
hovering or focusing a faded mark lifts its fade while it is hovered. A plot with every mark
picked fades nothing either, and only lone picks show their outline. The canvases move and clip
with a live photograph like the axis's svg homes. **Hovering a mark drawn with an SVG selected
recipe (a line's picked point, a grid cell, a region) still draws no highlight**: the thinner
hover core over the pick's would read as weaker, not stronger; the tooltip and `@bind` still
fire.

Tooltip theme is derived from the FIGURE's own background (CSS relative-colour syntax,
`--masque-fig-bg`), not just OS `prefers-color-scheme` — official Pluto has **no notebook
light/dark toggle** — so a dark Makie figure gets a dark tooltip on a light page; the OS media
query is only the fallback for browsers without relative-colour support. The tooltip is anchored
ABOVE the hovered mark (not the cursor) with a 10px gap and the caret on the anchor; it flips
below on a top-clip, and shifts + moves the caret (`--masque-caret-x`) on a side-clip. The clip
edge is the browser window, not the figure: the tooltip is a top-layer popover, so a box near the
figure's edge extends onto the page (Jonathan 2026-10-29). Without the Popover API it falls back
to the figure's edge. A
resolvable per-element `colors` (today `scatter!`'s `color=`) adds a 3px tooltip accent border
in that colour (`--masque-mark-border`); the text stays neutral.

ROI chrome: 4 corner handles (7 CSS px, white fill, 1px chrome stroke, ~1.5 CSS px corner
radius); a corner resizes two axes. The sides have no grip, but the manifest `handle` on each
edge midpoint (8 logical px × scaling, at least 6 image px) still resizes that one edge, with the
matching resize cursor. The ROI outline is 1px chrome unless an explicit `hoverstyle` stroke sets
its own width and colour.

These decisions are settled: cite the recipes above rather than re-litigating identity,
wash vs ring, first-PR scope, or Pluto coupling.

## How to run

Exactly one Makie backend per notebook process. Do not attach to an existing Try Live Pluto
session — start a separate one.

```text
# From the repo root. One-time setup (cloud session or fresh machine):
#   scripts/cloud-warm.sh julia e2e   # dev env with Masque + both Makies; Playwright + Chromium
export MASQUE_DEV_ENV="${MASQUE_DEV_ENV:-$HOME/.julia/environments/masque-dev}"
julia test/e2e/serve.jl 1237 &
# poll curl http://127.0.0.1:1237 → 200 (not the log)

cd test/e2e
# interaction + per-kind visual (wash/ring/hover-outline/pin/fade/no-red/tooltip theme)
node kind_sweep.mjs http://127.0.0.1:1237 "$PWD/kind_sweep_cairo.jl" cairo
# required visual-chrome sibling (same notebooks; not optional)
node polish_verify.mjs http://127.0.0.1:1237 "$PWD/kind_sweep_cairo.jl" cairo
# keyboard nav + ARIA (focus ring/tooltip, Enter bind, Escape/Tab-away, live region)
node keyboard_a11y.mjs http://127.0.0.1:1237 "$PWD/kind_sweep_cairo.jl" cairo

# second Pluto process — WGLMakie cannot share a session with Cairo
JULIA_NOSYSIMAGE=1 julia serve.jl 1238 &   # still in test/e2e
node kind_sweep.mjs http://127.0.0.1:1238 "$PWD/kind_sweep_webgl.jl" webgl
node polish_verify.mjs http://127.0.0.1:1238 "$PWD/kind_sweep_webgl.jl" webgl
node keyboard_a11y.mjs http://127.0.0.1:1238 "$PWD/kind_sweep_webgl.jl" webgl
```

Portable notebooks (`Pkg.develop` via `@__DIR__`) work without `MASQUE_DEV_ENV` (skip the `export`
line so it stays unset); first open re-resolves the Makie stack (~6 min). All three drivers run
on every PR in CI's `kind-sweep` job (matrixed `cairo`/`webgl`), which is a required check: a
failing driver on either backend blocks the merge. CI runs the notebooks as they are, so it only
covers what they exercise. A user-facing change still runs this playbook locally before it is
pushed, and a new kind, recipe, or interaction gets a case in `kind_sweep_figures.jl` and a check
in the driver that owns it, so CI covers it on every later PR.
`polish_verify.mjs` is **required** and still **not sufficient** alone (one wash + one ring +
caret-at-anchor + fade + tooltip theme). `kind_sweep.mjs` is **required** and still **not
sufficient** alone until `polish_verify.mjs` also PASSes on that backend. `keyboard_a11y.mjs` is
required only for a change that can touch focus/keyboard/ARIA (the overlay's
`keyboard.ts`/`mount.ts` hooks, or a manifest field it reads, e.g. `label`) — it is not a general
substitute for the other two.

Through-Pluto `@bind` on one scatter is also `bind_click.mjs`. Frontend unit twins for
hover outline / overlay-on-base / wash vs ring / remount identity / `prefers-color-scheme`
CSS live in `frontend/test/overlay.test.ts`. Units are necessary, not live-verify.

## Per-kind boxes (Cairo **and** WGL)

For every **element** kind: hover tooltip, click → `@bind` (index moves), geometry sits
**on the mark** (not beside it), no unexpected console, **and** the visual recipe for that
kind. Where `selected=` is supported (`circles`, `rects`, `polygons`, `segments`,
`polyline`, `lines`): selected persists after unhover; a closed kind's pick is the fade
(unpicked marks of its plot faded, the pick at full colour, `div.masque-fade` records it) and
hovering it still draws the hover recipe; open geometry uses the ring. A one-element `lines!`
with a baked selection has no other mark to hover, so that hover is the already-selected path
(no highlight). The series row hovers a different line.

`selected=` on `:grid` / `:axis` / `:threshold` / `:roi` / `:view` is fail-loud — do not
bake it; hover/click or drag only.

| Kind | Layer | Selected | Must assert |
| --- | --- | --- | --- |
| Scatter | `:circles` | fade: pick kept, the rest faded | tip, click `@bind`, persist, overlay-on-base, fade, no `#ff3b30`, dodge fill brightens the marker's interior (screenshot, hovered on a NON-selected element), an unpicked marker is fainter than before the pick and the pick is unchanged (screenshot) |
| Lines | `:lines` | ring (one `<path>` through the whole polyline) | tip, click `@bind` (one element; Julia index `1`), persist, ring recipe, hover on that same selected path draws no highlight |
| Series | `:lines` | ring on series 1 | tip per series, click the second series (`@bind` Julia index `2`), hover stroke traces that whole path (edge-only, no fill shape) |
| LineSegments | `:segments` | ring | tip, click `@bind`, persist, hover edge-only (no fill shape) |
| Heatmap / Image (`select = :many`) | `:grid` | mask: one fill over the held cells, 2px outline edge only | a click toggles one cell (with or without Ctrl), other cells stay, `@bind` is a `GridSelection`, outline traces the held block, hover on a held cell draws nothing |
| Heatmap / Image | `:grid` | **unsupported** | cell tip `(i,j)=value`, click `@bind`, dodge fill brightens the cell's interior (screenshot, on a bright-enough cell; grid hover is a closed "rect" geom_) |
| BarPlot | `:rects` | fade | tip, click `@bind`, persist, dodge fill brightens the bar's interior (screenshot) |
| Poly | `:polygons` | fade | tip, click `@bind`, persist, dodge fill brightens the polygon's interior (screenshot) |
| Polar (`PolarAxis` scatter) | `:circles` | fade | tip, click `@bind`, persist |
| Scatter (dark figure) | `:circles` | fade toward the dark background | tip, click `@bind`, persist, flat `#c8c8c8` edge stroke + dodge fill brightens the marker's interior (screenshot) on the dark figure too, still readable |
| Arrows3D | `:segments` | ring | tip, click `@bind`, persist |
| Axis3 scatter / meshscatter | `:circles` | fade, `r` from the projected mark | tip, click `@bind`, persist, hover highlight on the projected mark |
| Axis3 lines | `:lines` | point ring (`selected = [1]`) | tip, readout `x`/`y`/`z` (#502), click `@bind` picks the point, with `z` (#518) |
| Axis3 wireframe | `:segments` (one per edge) | ring | tip, click `@bind`, persist, ring on the edge |
| Axis3 overlapping pair | `:circles` over `:circles` | none | the plot drawn last answers where both claim the pixel (its layer sorts first), highlight takes its circle |
| Text | `:rects` | fade | tip, click `@bind`, persist |
| Datashader | `:grid` | **unsupported** | cell tip, click `@bind` |
| Violin | `:polygons` | fade | tip, click `@bind`, persist |
| Stairs | `:lines` | none (one element) | tip, click `@bind` |
| HLines / VLines | `:segments` | ring | tip, click `@bind`, persist |
| Threshold | `:threshold` | none | drag commit → `@bind` |
| Threshold (categorical y) | `:threshold` | none | release commits the nearest category's 1-based position and its label (`value`, `category`, #192), and the line snaps onto that category (#199) |
| ROI / box-select | `:roi` | none | drag commit → `@bind` (vector if `selects=`; a `selects`-ROI's grid cell-block union rect is fill-layer-only, `"rectfill"`) |
| View (2D pan / 3D orbit) | `:view` | none | **commits nothing** (§12.3) — drag readout only, no `@bind` write. On both backends, in-drag frames stream over the gesture channel (`with_js_link`, #102/#133) — the picture and hit manifest swap together on every camera move, `px_per_unit` drops to 1 mid-gesture and restores on release, a pre-existing selection on another layer survives the swap. `:cairo`'s picture is a PNG; `:webgl`'s is a serialized scene applied to the existing canvas |
| Legend | `:rects` | wash (entry row) | no default tooltip card (a `masque"..."` template still shows), screen reader announces the entry label, hover previews linked layers (closed marks: the entry's series kept, the legend's other series faded; lines: the ring in `g.link`, fade on leave; `g.sel` untouched), click `@bind` payload carries `targets`. A `series!` legend entry pins one path (`series:k`), not every series |
| Axis / Colorbar readout | `:axis` | none — a click is NOT a selection gesture; must leave a pre-existing selection on ANOTHER layer of the same widget untouched | hover coordinate readout inverted from the `AxisTransform` (`x=…, y=…`; a `Colorbar`'s tooltip is a bare number, no `x=`/`y=` prefix), click → `@bind` `(index=-1, payload=(;x,y)` or `(;value))`, an axis click and a colorbar click both leave a pre-existing `:pts` selection alone (#107 regression), colorbar's bounded bbox is a different hit-test branch from the axis catch-all (a pixel just outside the bbox reads as the axis catch-all, not the colorbar), no overlay hair |
| Axis readout (categorical y) | `:axis` | none | hover card reads the category label (`y=b`); click → `AxisEvent` with the category's 1-based position and its label as `ycat` (#192) |
| Crosshair | one hair on `svg.masque-plain`, only for a slice with `crosshair=true` | none | the arm named by that slice's `orientation` (vertical or horizontal, not both); off when `crosshair=false`, and off on a plot with no slice (axis, colorbar, grid, empty interior, discrete mark, legend, threshold, ROI, view-grab); 80–120 ms fade on enter/leave of that state, not on each move. Hairline is quieter than the selection edge (`#b0b0b0` light, `#929292` dark) at 80% opacity, with a 1.5px fringe in the figure background; `--masque-chrome` stays the selection/ROI/threshold ink |
| Block controls (`Slider`, `IntervalSlider`, `Toggle`, `Checkbox`, `Menu`) | `:control` (an HTML element, not a hit target) | none | each control's box sits on its block's layout box; the picture under the box is empty (Makie's own drawing hidden on both backends); start values match the blocks; slider by keyboard and by pointer drag commits on release and redraws through `onchange` while it moves; toggle, interval slider, checkbox and menu commit their own field only; a control's pointer and key events never pan or pick |
| Slice | `:slice` (not a hit target) | none | covered lines: the one hair for `orientation`, line highlight skipped, tooltip names each series at the probe (`wide 1.000` / `narrow 3.000` at the two probes), filled dots in the series colour ringed in the figure background; covered density: both labels in the tooltip; a discrete mark beside a slice keeps `pointer`, its own tooltip, and the hair off |

### Hover (element kinds)

- Tooltip text matches the hovered payload
- Hover stroke **centered on the mark** (not offset onto the host)
- Circles: stroke sits **flush on the marker's own drawn edge** (`r` is the drawn radius,
  not `markersize / 2`)
- Hover on a closed mark (circle/rect/poly) = TWO shapes, identical geometry: a dodge fill
  (`masque-hi masque-fillshape` in `svg.masque-fill`) + a 1.5px edge stroke (`masque-hi
  masque-hover` in `svg.masque-edge`); a picked closed mark is shown by the fade instead, and
  a grid cell's or region's selection by the same two shapes with a 2px edge (`masque-wash`)
- Hover on an open seg (lines/segments) draws the edge shape ONLY (`masque-hi masque-hover` in
  `svg.masque-edge`) — no fill shape, since a line has no interior (an explicit `hoverstyle`
  stroke is the one case that's genuinely unblended: single element, in `svg.masque-plain`, no
  `masque-hover`, `fill: none`)
- **Hovering a selected line, grid cell or region draws no highlight at all** — its selected
  stroke is already there; the tooltip and `@bind` still fire, only the highlight is skipped. A
  picked closed mark has no selected stroke, so hovering it draws the hover recipe. A kind with
  a baked `selected=` uses a DIFFERENT element to exercise the normal hover recipe
  (kind_sweep_figures.jl's `hoverIndex`/`hoverTip` vs. `selectedIndex`/`tip`)
- Hover node is the same DOM element across two moves on the same marker (no pulse)
- First insert has `.masque-enter`; a same-hit remount must **not** restart `masque-in`

### Unhover + selected persist (supported kinds)

- Leave applies `.masque-leave` (fade), then `g.hi` empties — not an instant remove
- Tooltip gone after the fade window
- The selection still painted: the fade for a closed kind, `g.sel` (ring or region) otherwise
- Open geometry is the ring recipe

### Click → bond

- `@bind` / readout updates (`InteractionEvent` layer + index)
- Click a **different** element: readout index **moves**

### Drag kinds

- Threshold / ROI: gesture commits; readout changes; overlay stays pinned to the
  base (`<img>` Cairo, `<canvas>` WGL)
- View: gesture commits nothing; picture and hit manifest still swap on the same
  overlay pin

### Console

- No unexpected page errors (Bonito `decode_binary` / `fetch_binary` on `:webgl` is
  known-benign)

## Visual fidelity (required — not optional)

These are required visual-fidelity checks, not optional nice-to-haves. Drivers must
**exercise** them, not only mention them.

| Item | What “pass” looks like | Driver |
| --- | --- | --- |
| Wash / ring / hover fill+edge (flush on the mark's drawn `r`) / overlay-pin | Dodge-fill recipe on the bare shape in `svg.masque-fill`'s `g.hi`/`g.sel`, fixed-grey edge-stroke recipe in `svg.masque-edge`'s (never the fixed teal); ALL THREE of `svg.masque-fill`, `svg.masque-edge`, `svg.masque-plain` boxes match `<img>` / `<canvas>` at DPR 2 | `kind_sweep.mjs` per kind + `polish_verify.mjs` |
| Tint-applied (screenshot) | Mean luminance of a small (≤8 css-px, sampled well inside the mark's drawn edge — not across the chrome rim) `page.screenshot()` clip centred on the mark's interior RISES ≥4 (0–255) after hover, on both a light and a dark figure — the dodge fill can only brighten, so this is the same-direction check on every figure | `kind_sweep.mjs` (scatter, scatter_dark, barplot, heatmap, poly) |
| Flush-radius pixel check (Cairo only) | A pixel just outside the highlight `r` reads as the figure background; a pixel just inside reads as the marker's own colour — proves the outline sits on the drawn edge, not offset | `polish_verify.mjs` (scatter, `:cairo` — skipped on `:webgl`, canvas readback isn't reliable) |
| Selection fade | After a pick on a closed kind, `div.masque-fade` records the pick as kept, the unpicked marks of its plot read fainter in a screenshot, the pick reads unchanged, a lone pick is outlined, and hovering the pick draws the hover recipe with the tooltip | `kind_sweep.mjs` (scatter) + `polish_verify.mjs` |
| Remount fade / no pulse | `.masque-enter` on first insert (on each highlight shape itself — no wrapper); same hover node on mousemove; `.masque-leave` on clear | both |
| Tooltip theme follows the figure | The overlay CSS keeps the no-relative-colour `prefers-color-scheme` fallback (`#1e1e1e`/`#e8e8e8` dark tokens); the tooltip on the light `scatter` is light and on the dark `scatter_dark` is dark; under `emulateMedia({colorScheme: "dark"})` the light figure's tooltip stays light (the OS setting does not override the figure). Dark **Makie** figure uses the flat `#c8c8c8` edge stroke (highlights do not follow OS). | `polish_verify.mjs` + `kind_sweep.mjs` (`scatter` + `scatter_dark`) |
| Tooltip caret on the anchor | The caret apex sits on the hovered mark's anchor x (scatter element 0's centre), not the cursor | `polish_verify.mjs` (scatter) |
| Readout caret on the pointer | A cursor-following tooltip's caret apex sits on the pointer x, in open space and where the box clamps at the right edge | `polish_verify.mjs` (axis) |
| No fixed steel-teal `#3A6F7C`, no alert red `#ff3b30` | Highlight colour is the dodge fill / fixed-grey edge stroke, or (for an explicit `hoverstyle`) the verbatim stroke, never a fixed literal like the old teal, in overlay CSS, hover stroke, wash, or ring | both |

`prefers-reduced-motion: reduce` stays instant (unit-tested). Live drivers use default
motion so fade is observable.

## Done means

- [ ] `kind_sweep.mjs` **PASS** on `:cairo` (every row, including `scatter_dark`, the tint-applied screenshot check on scatter/scatter_dark/barplot/heatmap/poly, the scatter selection fade, and axis/colorbar's click-preserves-selection + payload-shape + bounded-bbox checks)
- [ ] `kind_sweep.mjs` **PASS** on `:webgl` (every row, including `scatter_dark`, the tint-applied screenshot check on scatter/scatter_dark/barplot/heatmap/poly, the scatter selection fade, and axis/colorbar's click-preserves-selection + payload-shape + bounded-bbox checks)
- [ ] `polish_verify.mjs` **PASS** on `:cairo` (fade/ring/hover fill+edge/pin + flush-radius pixel check + dark-figure fade + dark-figure hover split-blend + caret-at-anchor + remount fade + tooltip theme follows figure + no `#ff3b30`)
- [ ] `polish_verify.mjs` **PASS** on `:webgl` (same boxes except the Cairo-only flush-radius check)
- [ ] Every row in the table above was exercised (not a subset)
- [ ] Verification was done by driving the playbook directly, not by asking someone else
      to click through plots
