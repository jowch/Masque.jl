# Overlay, bind, and the host

[Getting started](@ref) and the Guides teach how to overlay a figure and
use the pick. This page is the overlay, `@bind`, and the docs-site
player — for when a hover does not re-run Julia, or a docs embed is not
a live notebook.

Masque splits pointer work across four channels: overlay chrome, the `@bind`
bond, the gesture channel, and a downstream Julia cell. Holding the pointer
over a mark is not a click. A click is not a pan.

!!! note

    Hover stays in the overlay. A click writes `@bind`. Pan uses the
    gesture channel and does not write `@bind`. This docs site swaps
    listed snapshots; it does not run a Julia kernel. A static
    `generate_html` export keeps overlay inspection only.

The eight-city scatter on [Getting started](@ref) already shows two of those
channels on one plot. Holding the pointer over a city reads population in the
overlay. A click writes `pick`. This page names every channel so a docs-site
embed or a static export is not a Masque bug.

## Pluto cells in these docs

Paste each snippet into its own Pluto cell. Pluto runs one top-level
expression per cell. Wrap multiple statements in `begin ... end`. Showing
`fig` alone does not mount the overlay; `masque` returns the HTML that
does. For clone, `Pkg.develop`, and `Pkg.add(url=…)` cells, see
[Install](@ref).

## One figure, one overlay

At `masque()` time, one Makie `Figure` plus its interactables produces a
backend image (PNG or GPU canvas) and hit geometry for every axis, then one
manifest, then HTML: one image and one overlay. Several axes still share that
overlay. They are not several `masque` calls.

The overlay is a stateless view: tooltips, highlight in the overlay, and
drag chrome. Authoritative analysis state lives in Julia as the `@bind`
bond when a cell reads it.

## Four channels

These four are separate channels, not speeds of one channel.

- **Overlay chrome.** Tooltips, highlight in the overlay, an ROI box, a
  threshold line, and a view readout. No Julia round trip.
- **Bond (`@bind`).** The analysis value a cell reads: a click, an Enter
  commit, an ROI release, or a threshold release.
- **Gesture channel (`with_js_link`).** CairoMakie frames while you pan or
  orbit. Not a bond. Not a faster `@bind`.
- **Downstream Julia cell.** Re-runs only when it reads a bond that changed.

A Dash hover callback is a **click** in Masque. Altair `.interactive()`
pan is overlay motion, not `@bind`. Holding the pointer over a mark
never writes `@bind`.

## Gesture timing

Holding the pointer over a mark never assigns the bond. The highlight after a
click also runs in the overlay. The PNG does not change. An in-drag ROI box
or threshold line stays in the overlay until release. A view drag commits
nothing: camera state is not analysis data.

```@raw html
<div class="masque-diagram">
  <img class="masque-diagram-light" src="assets/diagrams/channels-timing.svg"
       alt="Swimlanes for overlay chrome, the bind bond, the gesture channel, and a downstream Julia cell for each gesture: hover tooltip and highlight, click-echo wash, click or Enter commit, ROI or threshold in-drag, ROI or threshold release, view pan or orbit in-drag, view release, and empty-space click.">
  <img class="masque-diagram-dark" src="assets/diagrams/channels-timing-dark.svg"
       alt="Swimlanes for overlay chrome, the bind bond, the gesture channel, and a downstream Julia cell for each gesture: hover tooltip and highlight, click-echo wash, click or Enter commit, ROI or threshold in-drag, ROI or threshold release, view pan or orbit in-drag, view release, and empty-space click.">
</div>
<script>
(function () {
  var wrap = document.currentScript.previousElementSibling;
  if (!wrap || !wrap.classList.contains("masque-diagram")) return;
  var link = document.querySelector('link[href*="masque-embed.css"]');
  var base = "assets/";
  if (link) {
    base = (link.getAttribute("href") || "assets/masque-embed.css")
      .replace(/masque-embed\.css(?:\?.*)?$/, "");
  }
  var imgs = wrap.querySelectorAll("img");
  for (var i = 0; i < imgs.length; i++) {
    var src = imgs[i].getAttribute("src") || "";
    imgs[i].src = base + src.replace(/^.*?assets\//, "");
  }
})();
</script>
```

Each pointer gesture uses a different mix of overlay chrome, the `@bind`
bond, the gesture channel, and a downstream Julia cell.

The following table is the same data, so the figure is not the only
source.

| Gesture | Overlay | Bond | Gesture channel | Downstream cell |
|---|---|---|---|---|
| Hover tooltip / highlight | Yes | No | No | No |
| Click-echo wash | Yes | No | No | No |
| Click / Enter commit | Echo yes | Scalar `ElementEvent` | No | Re-runs if it reads the bond |
| ROI / threshold **in-drag** | Box / line moves | No | No | No |
| ROI / threshold **release** | Echo if `selects` | Bounds, scalar, or `Vector` | No | Re-runs |
| View pan / orbit **in-drag** | Readout; new frames | No | Yes | No |
| View **release** | — | **Nothing** | Stops | No |
| Empty-space click | No | Unchanged | No | No |

ROI and threshold in-drag stay in the overlay: it already has what it
needs, so the drag never leaves the browser. In-drag view frames still
leave the overlay: both backends repaint over the gesture channel.
CairoMakie ships a PNG; WGLMakie ships a serialized scene onto the
canvas already on the page. Neither path writes `@bind`. On release the
channel stops, and the bond still holds **nothing** from the pan.

A click in empty space does not write the bond and does not clear a
selection. Enter or Space on a focused mark commits the same way a click
does.

## Overlay, Julia, and the host

Live Pluto runs every `@bind` row except view. This docs site does not run
those rows live. The cities player on [Getting started](@ref) lists idle plus
every city click and swaps every cell in that embed, including extra table
cells when a notebook has them. An overlay-only player keeps tooltip and
highlight chrome. Julia stays at the default bond. Static `generate_html`
keeps overlay chrome and drops `@bind` and `with_js_link`.

```@raw html
<div class="masque-diagram">
  <img class="masque-diagram-light" src="assets/diagrams/overlay-vs-host.svg"
       alt="Four hosts compared: live Pluto, a docs player with listed idle plus N or listed items, a docs player that is overlay-only, and static generate_html. Hover and click-echo run on every host. Listed element bind and listed ROI, axis, or threshold values re-run Julia on live Pluto, swap snapshots on a listed player, stay at the default bond on overlay-only, and are dead on static HTML. Unlisted drags keep chrome. Heatmap inspect and cairo view frames use GIF or MP4 on this site, with no bind on view.">
  <img class="masque-diagram-dark" src="assets/diagrams/overlay-vs-host-dark.svg"
       alt="Four hosts compared: live Pluto, a docs player with listed idle plus N or listed items, a docs player that is overlay-only, and static generate_html. Hover and click-echo run on every host. Listed element bind and listed ROI, axis, or threshold values re-run Julia on live Pluto, swap snapshots on a listed player, stay at the default bond on overlay-only, and are dead on static HTML. Unlisted drags keep chrome. Heatmap inspect and cairo view frames use GIF or MP4 on this site, with no bind on view.">
</div>
<script>
(function () {
  var wrap = document.currentScript.previousElementSibling;
  if (!wrap || !wrap.classList.contains("masque-diagram")) return;
  var link = document.querySelector('link[href*="masque-embed.css"]');
  var base = "assets/";
  if (link) {
    base = (link.getAttribute("href") || "assets/masque-embed.css")
      .replace(/masque-embed\.css(?:\?.*)?$/, "");
  }
  var imgs = wrap.querySelectorAll("img");
  for (var i = 0; i < imgs.length; i++) {
    var src = imgs[i].getAttribute("src") || "";
    imgs[i].src = base + src.replace(/^.*?assets\//, "");
  }
})();
</script>
```

The same gesture can run in the overlay, write `@bind`, swap a listed
snapshot, or stay frozen, depending on the host.

The following table is that split.

| Gesture | Live Pluto | Docs player (listed idle+N / listed `items`) | Docs player (overlay-only) | Static `generate_html` |
|---|---|---|---|---|
| Hover | Overlay tooltip and highlight | Overlay tooltip and highlight | Overlay tooltip and highlight | Overlay tooltip and highlight |
| Click-echo | Highlight in the overlay | Highlight in the overlay | Highlight in the overlay | Highlight in the overlay |
| Listed element `@bind` (incl. extra table cells) | Bond writes; every cell that reads it re-runs | Snapshot swap for every cell in the embed | Overlay chrome; Julia stays at the default bond | Overlay chrome; `@bind` dead |
| Listed ROI `items` / a few axis or threshold values | Bond writes on release | Snapshot swap for listed sets or values | Overlay chrome; Julia stays at the default bond | Overlay chrome; `@bind` dead |
| Unlisted continuous drag | Overlay chrome during the drag; Julia on ROI or threshold release; view never writes `@bind` | Overlay chrome; Julia stays on the last listed set | Overlay chrome; Julia stays at the default bond | Overlay chrome; `@bind` dead |
| Heatmap inspect (GIF/MP4) | Overlay tooltip; Julia on click | GIF/MP4 on this site; overlay-only tooltip chrome if that player is present | Overlay tooltip chrome if that player is present | Overlay tooltip; Julia click dead; site uses GIF/MP4 |
| Cairo view frames (GIF/MP4, no `@bind`) | Gesture channel frames; no `@bind` | GIF/MP4 on this site; no `@bind` | Overlay readout; no frames; no `@bind` | Gesture channel dead; site uses GIF/MP4 |

Heatmaps are not listed cell by cell. View pan never appears as an
`InteractionEvent`. For a box that filters a table, see
[Brush a region](@ref). For a grid you inspect without enumerating cells, see
[Inspect a grid](@ref). For pan and orbit, see [Pan and orbit](@ref).

## Common mistakes

- Do not write a cell that reads `pick` expecting it to update when you hold
  the pointer over a mark. That path is overlay-only.
- Do not treat a docs player as live Pluto. Axis, ROI, and threshold commits
  write `@bind` in a notebook. On this site, a listed player snapshots those
  commits, a heatmap uses GIF/MP4, and view has no `@bind`.
- Do not design a click demo around a miss. List every mark.
- Do not expect SliderServer or `Bonds.possible_values` to enumerate Masque
  bonds.
