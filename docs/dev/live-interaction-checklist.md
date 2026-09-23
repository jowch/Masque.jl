# Live interaction **and** visual playbook

A user-facing change is not done until this playbook has been driven in a real Pluto + browser
on **every supported backend** (today `:cairo` and `:webgl`) **across the interactable kinds**
below. A 2-plot kitchen-sink (scatter wash + line ring) is a chrome smoke, not verification.

This playbook is **interaction and visual**. Both halves are required. Do not treat
`KIND SWEEP OK` as visual fidelity, and do not treat kitchen-sink chrome as the kind sweep.

## Visual language (settled)

Recipes: highlight is a split — a brightening color-dodge fill plus a flat chrome stroke, not a
mark-derived colour — `colors` (today `scatter!`'s `color=`) no longer touches the highlight at
all, only the tooltip accent (below). The shadow root holds THREE sibling top-level overlay
svgs with identical box/viewBox, each with its own `g.hi`/`g.sel`: `svg.masque-fill`
(`mix-blend-mode: color-dodge`, both light and dark figures) draws the fill half of a closed
mark's hover/selected highlight (`masque-hi masque-fillshape`, computed fill `rgb(20, 20, 20)`
/ `#141414`, fill-opacity 1, no stroke); `svg.masque-edge` (no blend) draws the stroke half
(`masque-hi masque-hover` at 1.5px hover, `masque-hi masque-wash` at 2px selected, no fill) in
one flat chrome grey — `#7a7a7a` on a light figure, `#c8c8c8` on a dark one, the same colour
for hover and selected — Firefox only honours `mix-blend-mode` on a top-level svg, not nested
SVG content, which is why the dodge fill is its own sibling svg; the edge svg stays a sibling
so the stroke paints above that fill and below the plain chrome. Dodge against the near-black `#141414` source was, across a measured
10-colour palette, the only fill candidate that never rotated hue more than 8° and never dimmed
a mark; a single darkening layer alone made a highlighted mark read muddy on a light figure,
which is why the highlight split into two layers. Because the fill is identical between hover
and selected (fill strength alone is sub-JND), the 1.5px-vs-2px edge-stroke width carries the
entire hover-vs-selected distinction. **Hovering a mark that is already selected draws no
highlight at all** — both layers are already opaque from the selected wash, so a 1.5px hover
stroke over the 2px selected stroke would read as weaker, not stronger; the tooltip and `@bind`
still fire for that hit, only the highlight is skipped. Per geometry: a closed mark
(circle/rect/polygon) draws BOTH shapes, identical geometry; an open seg (a line has no
interior) draws the edge shape only, no fill shape; a `selects`-ROI's grid cell-block union rect
(`"rectfill"` geom tag) draws the fill shape only, since the ROI box itself is already the
rect's outline. The third svg, `svg.masque-plain` (unblended), holds ROI/threshold, the
selected-seg ring (inner 2px + outer 4px @ 0.25, chrome grey), and hover/selected highlights
for a layer with an explicit `hoverstyle` stroke — single element, stroke verbatim + 18%/35%
tint in that colour (the pre-split recipe, unchanged), open shapes staying stroke-only there (no
`masque-hover`, `fill: none`); browsers without `mix-blend-mode` draw the fill as chrome grey
at 0.18 opacity, and the edge stroke stays the flat chrome grey. A scatter
circle's highlight `r` is the marker's DRAWN radius, not `markersize / 2` — flush against the
visible disc (default `:circle` marker ≈0.3525×`markersize`; a `Circle`/`Rect` geometry marker
draws at `markersize`; anything else falls back to `markersize / 2`; the fill and edge shapes
share identical geometry, so `r` is checked on both). Hover is not selected. Motion is an
80–120 ms opacity fade on tip / highlight — a plain opacity fade on each shape itself (the blend
lives on `svg.masque-fill`, so a fading child doesn't isolate it); no pulse on a same-hit remount.
Tooltip dark follows OS `prefers-color-scheme` — official Pluto has **no notebook light/dark
toggle** (Settings → Dark mode is help text; Pluto itself uses the same media query).

These decisions are settled: cite the recipes above rather than re-litigating identity,
wash vs ring, first-PR scope, or Pluto coupling.

## How to run

Exactly one Makie backend per notebook process. Do not attach to an existing Try Live Pluto
session — start a separate one.

```text
# Fast loop when masque-dev already has Masque + both Makies:
MASQUE_DEV_ENV=$HOME/.julia/environments/masque-dev julia test/e2e/serve.jl 1237 &
# poll curl http://127.0.0.1:1237 → 200 (not the log)

cd test/e2e
# interaction + per-kind visual (wash/ring/hover-outline/pin/fade/no-red/color-scheme)
node kind_sweep.mjs http://127.0.0.1:1237 "$PWD/kind_sweep_cairo.jl" cairo
# required visual-chrome sibling (same notebooks; not optional)
node polish_verify.mjs http://127.0.0.1:1237 "$PWD/kind_sweep_cairo.jl" cairo
# keyboard nav + ARIA (focus ring/tooltip, Enter bind, Escape/Tab-away, live region)
node keyboard_a11y.mjs http://127.0.0.1:1237 "$PWD/kind_sweep_cairo.jl" cairo

# second Pluto process — WGLMakie cannot share a session with Cairo
MASQUE_DEV_ENV=$HOME/.julia/environments/masque-dev JULIA_NOSYSIMAGE=1 julia test/e2e/serve.jl 1238 &
node kind_sweep.mjs http://127.0.0.1:1238 "$PWD/kind_sweep_webgl.jl" webgl
node polish_verify.mjs http://127.0.0.1:1238 "$PWD/kind_sweep_webgl.jl" webgl
node keyboard_a11y.mjs http://127.0.0.1:1238 "$PWD/kind_sweep_webgl.jl" webgl
```

Portable notebooks (`Pkg.develop` via `@__DIR__`) work without `MASQUE_DEV_ENV`; first open
re-resolves the Makie stack (~6 min). All three drivers also run in CI on the `kind-sweep` job
(matrixed `cairo`/`webgl`), but only **advisorily** (`continue-on-error: true`) — agents still
run this playbook locally before calling a user-facing change done, until the job is promoted
to a required check.
`polish_verify.mjs` is **required** and still **not sufficient** alone (one wash + one ring
+ fade + color-scheme). `kind_sweep.mjs` is **required** and still **not sufficient**
alone until `polish_verify.mjs` also PASSes on that backend. `keyboard_a11y.mjs` is required
only for a change that can touch focus/keyboard/ARIA (the overlay's `keyboard.ts`/`mount.ts`
hooks, or a manifest field it reads, e.g. `label`) — it is not a general substitute for the
other two.

Through-Pluto `@bind` on one scatter is also `bind_click.mjs`. Frontend unit twins for
hover outline / overlay-on-base / wash vs ring / remount identity / `prefers-color-scheme`
CSS live in `frontend/test/overlay.test.ts`. Units are necessary, not live-verify.

## Per-kind boxes (Cairo **and** WGL)

For every **element** kind: hover tooltip, click → `@bind` (index moves), geometry sits
**on the mark** (not beside it), no unexpected console, **and** the visual recipe for that
kind. Where `selected=` is supported (`circles`, `rects`, `polygons`, `segments`,
`polyline`, `lines`): selected persists after unhover; wash ≠ hover; open geometry uses the
ring. A one-element `lines!` with a baked selection has no other mark to hover, so that
hover is the already-selected path (no highlight). The series row hovers a different line.

`selected=` on `:grid` / `:axis` / `:threshold` / `:roi` / `:view` is fail-loud — do not
bake it; hover/click or drag only.

| Kind | Layer | Selected | Must assert |
| --- | --- | --- | --- |
| Scatter | `:circles` | wash, flush drawn `r`, centered | tip, click `@bind`, persist, overlay-on-base, fade, no `#ff3b30`, dodge fill brightens the marker's interior (screenshot, hovered on a NON-selected element), hover-on-the-selected-element is a no-op (no highlight, tooltip still shows) |
| Lines | `:lines` | ring (one `<path>` through the whole polyline) | tip, click `@bind` (one element; Julia index `1`), persist, ring recipe, hover on that same selected path draws no highlight |
| Series | `:lines` | ring on series 1 | tip per series, click the second series (`@bind` Julia index `2`), hover stroke traces that whole path (edge-only, no fill shape) |
| LineSegments | `:segments` | ring | tip, click `@bind`, persist, hover edge-only (no fill shape) |
| Heatmap / Image | `:grid` | **unsupported** | cell tip `(i,j)=value`, click `@bind`, dodge fill brightens the cell's interior (screenshot, on a bright-enough cell; grid hover is a closed "rect" geom_) |
| BarPlot | `:rects` | wash | tip, click `@bind`, persist, dodge fill brightens the bar's interior (screenshot) |
| Poly | `:polygons` | wash | tip, click `@bind`, persist, dodge fill brightens the polygon's interior (screenshot) |
| Polar (`PolarAxis` scatter) | `:circles` | wash, flush drawn `r` | tip, click `@bind`, persist |
| Scatter (dark figure) | `:circles` | wash, flush drawn `r` on dark axes | tip, click `@bind`, persist, flat `#c8c8c8` edge stroke + dodge fill brightens the marker's interior (screenshot) on the dark figure too, still readable |
| Arrows3D | `:segments` | ring | tip, click `@bind`, persist |
| HLines / VLines | `:segments` | ring | tip, click `@bind`, persist |
| Threshold | `:threshold` | none | drag commit → `@bind` |
| ROI / box-select | `:roi` | none | drag commit → `@bind` (vector if `selects=`; a `selects`-ROI's grid cell-block union rect is fill-layer-only, `"rectfill"`) |
| View (2D pan / 3D orbit) | `:view` | none | **commits nothing** (§12.3) — drag readout only, no `@bind` write. On both backends, in-drag frames stream over the gesture channel (`with_js_link`, #102/#133) — the picture and hit manifest swap together on every camera move, `px_per_unit` drops to 1 mid-gesture and restores on release, a pre-existing selection on another layer survives the swap. `:cairo`'s picture is a PNG; `:webgl`'s is a serialized scene applied to the existing canvas |
| Legend | `:rects` | wash (entry row) | no default tooltip card (a `masque"..."` template still shows), screen reader announces the entry label, hover fans out linked layers into `g.link` (wash/ring on the marks, on-mark geometry, fade on leave, `g.sel` untouched), click `@bind` payload carries `targets`. A `series!` legend entry pins one path (`series:k`), not every series |
| Axis / Colorbar readout | `:axis` | none — a click is NOT a selection gesture; must leave a pre-existing selection on ANOTHER layer of the same widget untouched | hover coordinate readout inverted from the `AxisTransform` (`x=…, y=…`; a `Colorbar`'s tooltip is a bare number, no `x=`/`y=` prefix), click → `@bind` `(index=-1, payload=(;x,y)` or `(;value))`, an axis click and a colorbar click both leave a pre-existing `:pts` selection alone (#107 regression), colorbar's bounded bbox is a different hit-test branch from the axis catch-all (a pixel just outside the bbox reads as the axis catch-all, not the colorbar), cross on for both |
| Crosshair | overlay chrome on `svg.masque-plain` | none | both hairlines whenever the cursor is `crosshair` (axis, colorbar, grid, empty axis interior, a layer a slice covers); off on a discrete mark, legend, threshold, ROI, and view-grab; 80–120 ms fade on enter/leave of that state, not on each move. Hairline is quieter than the selection edge (`#b0b0b0` light, `#929292` dark) at 80% opacity, with a 3px fringe in the figure background; `--masque-chrome` stays the selection/ROI/threshold ink |
| Slice | `:slice` (not a hit target) | none | covered lines: cross on, line highlight skipped, tooltip names each series at the probe (`wide 1.000` / `narrow 3.000` at the two probes), filled dots in the series colour ringed in the figure background; covered density: both labels in the tooltip; a discrete mark beside a slice keeps `pointer`, its own tooltip, and the cross off |

### Hover (element kinds)

- Tooltip text matches the hovered payload
- Hover stroke **centered on the mark** (not offset onto the host)
- Circles: stroke sits **flush on the marker's own drawn edge** (`r` is the drawn radius,
  not `markersize / 2`)
- Hover on a closed mark (circle/rect/poly) = TWO shapes, identical geometry: a dodge fill
  (`masque-hi masque-fillshape` in `svg.masque-fill`) + a 1.5px edge stroke (`masque-hi
  masque-hover` in `svg.masque-edge`) — a wider 2px edge stroke marks selection (`masque-wash`);
  the fill itself is identical between hover and selected, so the edge-stroke width is what
  actually distinguishes the two states
- Hover on an open seg (lines/segments) draws the edge shape ONLY (`masque-hi masque-hover` in
  `svg.masque-edge`) — no fill shape, since a line has no interior (an explicit `hoverstyle`
  stroke is the one case that's genuinely unblended: single element, in `svg.masque-plain`, no
  `masque-hover`, `fill: none`)
- **Hovering an already-selected mark draws no highlight at all** — both layers are already
  opaque from the selected wash; the tooltip and `@bind` still fire, only the highlight is
  skipped. A kind with a baked `selected=` needs a DIFFERENT element to exercise the normal
  hover recipe (kind_sweep_figures.jl's `hoverIndex`/`hoverTip` vs. `selectedIndex`/`tip`)
- Hover node is the same DOM element across two moves on the same marker (no pulse)
- First insert has `.masque-enter`; a same-hit remount must **not** restart `masque-in`

### Unhover + selected persist (supported kinds)

- Leave applies `.masque-leave` (fade), then `g.hi` empties — not an instant remove
- Tooltip gone after the fade window
- `g.sel` still painted (wash or ring)
- Wash ≠ hover; open geometry is the ring recipe

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
| Hover-on-selected no-op | Hovering the baked-`selected` element draws NO highlight — `svg.masque-fill > g.hi` and `svg.masque-edge > g.hi` both empty — while `g.sel` still holds the wash and the tooltip still shows | `kind_sweep.mjs` (scatter) |
| Remount fade / no pulse | `.masque-enter` on first insert (on each highlight shape itself — no wrapper); same hover node on mousemove; `.masque-leave` on clear | both |
| Pluto dark / `prefers-color-scheme` | Tooltip light `#ffffff`/`#1a1a1a` and dark `#1e1e1e`/`#e8e8e8` via `emulateMedia`. Official Pluto has no notebook toggle — both follow the OS media query. Dark **Makie** figure (`scatter_dark`) uses the flat `#c8c8c8` edge stroke, not OS colour-scheme (highlights do not follow OS). | `polish_verify.mjs` + `kind_sweep.mjs` (`prefers-color-scheme` + `scatter_dark`) |
| No fixed steel-teal `#3A6F7C`, no alert red `#ff3b30` | Highlight colour is the dodge fill / fixed-grey edge stroke, or (for an explicit `hoverstyle`) the verbatim stroke, never a fixed literal like the old teal, in overlay CSS, hover stroke, wash, or ring | both |

`prefers-reduced-motion: reduce` stays instant (unit-tested). Live drivers use default
motion so fade is observable.

## Done means

- [ ] `kind_sweep.mjs` **PASS** on `:cairo` (every row, including `scatter_dark`, the tint-applied screenshot check on scatter/scatter_dark/barplot/heatmap/poly, the scatter hover-on-selected no-op, and axis/colorbar's click-preserves-selection + payload-shape + bounded-bbox checks)
- [ ] `kind_sweep.mjs` **PASS** on `:webgl` (every row, including `scatter_dark`, the tint-applied screenshot check on scatter/scatter_dark/barplot/heatmap/poly, the scatter hover-on-selected no-op, and axis/colorbar's click-preserves-selection + payload-shape + bounded-bbox checks)
- [ ] `polish_verify.mjs` **PASS** on `:cairo` (wash/ring/hover fill+edge/pin + flush-radius pixel check + dark-figure wash + dark-figure hover split-blend + remount fade + color-scheme + no `#ff3b30`)
- [ ] `polish_verify.mjs` **PASS** on `:webgl` (same boxes except the Cairo-only flush-radius check)
- [ ] Every row in the table above was exercised (not a subset)
- [ ] Verification was done by driving the playbook directly, not by asking someone else
      to click through plots
