# Inspect a grid

Hold the pointer over a heatmap or image cell to read `(i, j)` and its
value. Click the cell to write that pick into Julia. The cell is a
highlight in the overlay; the PNG does not change.

The following clip shows the pointer over cells, then a click. The
tooltip is `(i,j) = value`.

```@raw html
<video id="masque-grids-clip" title="Hold the pointer over heatmap cells, then click one"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-grids-clip");
  if (!el) return;
  el.src = (pretty ? "../assets/" : "assets/") + "grids-heatmap.mp4";
})();
</script>
```

**On this site:** GIF/MP4 plus overlay-only. For overlay versus `@bind`
versus the docs player, see [Overlay, Julia, and the host](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-grids-player" title="Tiny heatmap with overlay cell inspection"
        style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-grids-player");
  if (!el) return;
  function isDocDark() {
    var c = document.documentElement.className || "";
    if (!c) return false;
    if (/(^|\s)theme--(documenter-light|catppuccin-latte)(\s|$)/.test(c)) return false;
    return /(^|\s)theme--/.test(c);
  }
  function pushTheme() {
    var doc = el.contentDocument;
    if (!doc) return;
    doc.documentElement.classList.toggle("pluto-dark", isDocDark());
  }
  el.addEventListener("load", pushTheme);
  new MutationObserver(pushTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  el.src = (pretty ? "../embeds/" : "embeds/") + "grids_heatmap.html";
})();
</script>
```

Prerequisites: [Install](@ref) and [Getting started](@ref) cells in your
notebook. The layer kind is `:grid`, not `:rects`. Bars from `barplot!`
are `:rects` and are a different job.

## Overlay a heatmap

**1.** Draw a small heatmap and pass the plot object to
   [`RectInteractable`](@ref). The plot-object method takes `id` only
   (default `:cells`):

```julia
begin
    z = [Float64(i + 3j) for i in 1:4, j in 1:3]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "column", ylabel = "row")
    p = heatmap!(ax, 1:4, 1:3, z)
    cells = RectInteractable(ax, p; id = :cells)
    nothing
end
```

`image!` uses the same method. `masque(fig)` walks a `Heatmap` or
`Image` and installs this layer for you.

**2.** Bind a click:

```julia
@bind pick masque(fig, cells)
```

Or pass edges and values yourself. Edges must be monotonic. `values`
must have shape `(length(xedges) - 1, length(yedges) - 1)`:

```julia
cells = RectInteractable(
    ax;
    grid = (0.5:1:4.5, 0.5:1:3.5, z),
    id = :cells,
)
```

`payloads=` on the `grid=` constructor is accepted and discarded. Cell
payloads are always `(; i, j, value)` in the browser, not a Julia lookup
table. `RectInteractable(ax, p::Makie.Heatmap; payloads = …)` is a
`MethodError`.

A colorbar next to a heatmap is a value readout, not a cell pick. For
more information, see [Read coordinates](@ref).

## Read a cell

Hold the pointer over a cell. The tooltip is `(i,j) = value`, or `(i,j)`
when a cell is smaller than about one screen pixel (Masque then drops
`values[]` from the manifest and warns). That is not the auto name/value
table used on scatter and bars. For more information, see
[Tooltips](@ref).

Click the cell. In live Pluto, `pick` is a [`GridCellEvent`](@ref):
`layer` is `:cells`, `pick.i` and `pick.j` are 1-based (column, then
row), and `A[pick]` is `A[pick.i, pick.j]`. `pick.value` is the cell
value when it was shipped, or `nothing` when values were dropped from the
manifest (the click still carries the cell). The cell is a highlight in
the overlay. A click in empty space does not write the bond.

Tab and arrow keys skip `:grid`. Keyboard focus walks bars and scatter
marks, not heatmap cells. For more information, see
[Keyboard and screen readers](@ref).

For `selected=` on `:grid`, see
[Tried `selected=` on a kind that cannot hydrate](@ref).

## Brush cells with an ROI

Pair [`ROIInteractable`](@ref) with `selects = :cells`. On release, the
bond is one [`GridWindowEvent`](@ref): `A[win]` is
`A[win.i1:win.i2, win.j1:win.j2]`. A brush that misses the grid has
empty ranges, not `[]`. The overlay fills the enclosed block and leaves
the ROI box as the outline.

`selects` accepts `:circles` or `:grid`. Pointing it at a `:rects` bar
layer raises `ArgumentError`.

## Polar heatmaps

`heatmap!` on a `PolarAxis` is skipped with `@warn` in
`auto_interactables`. An explicit axis-aligned grid on polar is
misaligned. Use scatter or lines on polar instead.

`Axis3` heatmaps are skipped the same way.
