# Overlay, bind, and the host

Each gesture on a `masque` widget changes something different. Hovering
a mark shows its tooltip. Clicking it changes the `@bind` value.
Panning moves the view and changes neither. What a gesture does also
depends on where the notebook runs: in Pluto, in a static HTML export,
or on this site. [Concepts](@ref) covers the everyday case.

The three-point scatter on [Getting started](@ref) shows the first two
on one plot. Hovering a point shows its name, and clicking it sets
`sel`.

## Pluto cells in these docs

Put each code block in its own Pluto cell. A cell holds one expression,
so wrap several statements in `begin ... end`. Showing `fig` on its own
gives a plain picture; `masque(fig)` gives the interactive one. To
install Masque, see [Install](@ref).

## What each gesture changes

A figure with several axes is still one widget, from one `masque` call.
Tooltips and highlights appear in the browser, without running Julia.
The figure's image stays the same when you hover or click: highlights
are drawn on top of it. The `@bind` value changes only on a click, or
when you release a box or threshold line.

```@raw html
<div class="masque-diagram">
  <img class="masque-diagram-light" src="assets/diagrams/channels-timing.svg"
       alt="A table of gestures against what each one changes: on the figure, the @bind value, Julia redrawing the view, and cells that use @bind. Hovering shows a tooltip and highlight only. The highlight after a click needs no Julia. Clicking a mark or pressing Enter highlights it and sends one event to @bind, none if a box brushes that layer, and cells that use it respond. Dragging an ROI box or threshold line moves it on the figure only. Releasing it highlights the enclosed marks with selects, sends the box, the marks, or a value to @bind, and cells respond. Dragging to pan or orbit shows a tooltip while Julia redraws the view with CairoMakie or WGLMakie. Releasing a pan leaves @bind unchanged and the redrawing stops. Clicking empty space changes nothing.">
  <img class="masque-diagram-dark" src="assets/diagrams/channels-timing-dark.svg"
       alt="A table of gestures against what each one changes: on the figure, the @bind value, Julia redrawing the view, and cells that use @bind. Hovering shows a tooltip and highlight only. The highlight after a click needs no Julia. Clicking a mark or pressing Enter highlights it and sends one event to @bind, none if a box brushes that layer, and cells that use it respond. Dragging an ROI box or threshold line moves it on the figure only. Releasing it highlights the enclosed marks with selects, sends the box, the marks, or a value to @bind, and cells respond. Dragging to pan or orbit shows a tooltip while Julia redraws the view with CairoMakie or WGLMakie. Releasing a pan leaves @bind unchanged and the redrawing stops. Clicking empty space changes nothing.">
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

The table below holds the same information as the diagram.

| Gesture | On the figure | `@bind` value | Julia redraws the view | Cells that use it |
|---|---|---|---|---|
| Hover (tooltip and highlight) | Yes | No | No | No |
| Highlight after a click | Yes | No | No | No |
| Click or Enter on a mark | Highlight | One event (none if a box brushes the mark's layer) | No | Respond to the click |
| ROI or threshold, while dragging | Box or line moves | No | No | No |
| ROI or threshold, release | Highlight, with `selects` | The box, the enclosed marks, or the line's value | No | Respond |
| Pan or orbit, while dragging | Tooltip with the new limits or angles | No | Yes, on both backends | No |
| Pan or orbit, release | — | Unchanged | Stops | No |
| Click empty space | No | Unchanged | No | No |

An ROI box or threshold line moves in the browser while you drag it,
and nothing reaches Julia until you release it. A pan or orbit works
differently: Julia redraws the view for each step of the drag.
CairoMakie sends a new image, and WGLMakie updates the canvas already on
the page. The `@bind` value does not change, during the drag or after
it.

A click in empty space does not change the value and keeps the current
selection. Enter or Space on a focused mark does what a click does.

Right-clicking the figure opens the browser's context menu for the
image (CairoMakie) or the canvas (WGLMakie). On macOS, Control-click
does the same. It does not start a drag, and the `@bind` value stays
unchanged.

## [Where the notebook runs](@id gestures-where)

In a live Pluto notebook, every gesture works as the table above shows.
A static HTML export (from Pluto's export menu, or
`Pluto.generate_html`) and the examples on this site have no Julia
behind them. Tooltips and highlights still work there, and you can
still click marks and drag boxes.

Most examples on this site replay recorded results, including the quick
start on [Getting started](@ref). The docs build records every mark,
legend entry, and heatmap cell you can click, and every box a brush can
draw. A click or release then shows the matching result in every cell
below the figure. For an axis, a threshold line, or a box without
`selects`, only a few chosen positions are recorded, if any. A few
examples show hover only, and their cells keep their starting values.

```@raw html
<div class="masque-diagram">
  <img class="masque-diagram-light" src="assets/diagrams/overlay-vs-host.svg"
       alt="Where the notebook runs: live Pluto, a recorded example on this site, a hover-only example on this site, and a static HTML export. Hover and the highlight after a click work in all four. Clicking a mark updates @bind and cells respond in live Pluto, shows a recorded result in a recorded example, and leaves cells unchanged in a hover-only example or a static export. Releasing a brush box, or picking a recorded axis or threshold position, follows the same split. Other drag positions update @bind on release in live Pluto, and elsewhere cells keep the last recorded, starting, or exported value. Clicking a heatmap cell shows a tooltip everywhere, and a result in live Pluto or a recorded example. Pan and orbit need live Pluto; this site shows them as video clips, and they never change @bind.">
  <img class="masque-diagram-dark" src="assets/diagrams/overlay-vs-host-dark.svg"
       alt="Where the notebook runs: live Pluto, a recorded example on this site, a hover-only example on this site, and a static HTML export. Hover and the highlight after a click work in all four. Clicking a mark updates @bind and cells respond in live Pluto, shows a recorded result in a recorded example, and leaves cells unchanged in a hover-only example or a static export. Releasing a brush box, or picking a recorded axis or threshold position, follows the same split. Other drag positions update @bind on release in live Pluto, and elsewhere cells keep the last recorded, starting, or exported value. Clicking a heatmap cell shows a tooltip everywhere, and a result in live Pluto or a recorded example. Pan and orbit need live Pluto; this site shows them as video clips, and they never change @bind.">
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

The table below holds the same information as the diagram.

| Gesture | Live Pluto | Recorded example on this site | Hover-only example on this site | Static HTML export |
|---|---|---|---|---|
| Hover | Tooltip and highlight | Tooltip and highlight | Tooltip and highlight | Tooltip and highlight |
| Highlight after a click | Yes | Yes | Yes | Yes |
| Click a mark (all cells below) | `@bind` updates, and cells that use it respond | Every cell shows the recorded result | Cells keep their starting values | Cells keep the values they had at export |
| Release a brush box, or pick a recorded axis or threshold position | `@bind` updates on release | The recorded result, for every box or recorded position | Cells keep their starting values | Cells keep the values they had at export |
| Drag to another position | The box or line moves, and `@bind` updates on release; a pan never changes it | Cells keep the last recorded result (every brush box is recorded, so this applies to an axis or threshold position) | Cells keep their starting values | Cells keep the values they had at export |
| Click a heatmap cell | Tooltip; `@bind` updates on click | Tooltip; every cell click shows its recorded result | Tooltip; cells unchanged | Tooltip; cells unchanged |
| Pan or orbit | Julia redraws the view; `@bind` never changes | Shown as a video clip instead | A tooltip shows the limits; the view does not move | The view does not move; this site uses video clips |

A colorbar click, and a click on a heatmap that a box brushes, is not
recorded on this site. A pan never produces a `@bind` value anywhere.
For a box that filters a table, see [Brush a region](@ref). For
heatmaps, see [Inspect a grid](@ref). For pan and orbit, see
[Pan and orbit](@ref).

## Common mistakes

- A cell that uses `pick` does not respond when you hover over a mark.
  Click the mark, or press Enter on it.
- An example on this site is not a live notebook. In your own notebook,
  clicking an axis or releasing a box or threshold line updates the
  `@bind` value. On this site, those show a recorded result when one
  exists. A pan has no `@bind` value anywhere.
- If you contribute an example to these docs, keep its clickable marks
  few. The docs build records every mark, legend entry, and heatmap cell
  a reader can click, and fails when the recordings get too large. Use a
  coarser grid or fewer marks.
- PlutoSliderServer does not know the values a `masque` widget can
  take, so it cannot precompute them.

For other problems, see [Troubleshooting](@ref).
