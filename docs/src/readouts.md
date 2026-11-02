# Read coordinates

Sometimes the value you want isn't a mark but a position on the plot:
the data coordinates under the pointer, the value a color stands for,
or a cutoff you set by dragging a line. `masque(fig)` makes every
colorbar a readout for you. For the other two, pass an
[`AxisInteractable`](@ref) or a [`ThresholdInteractable`](@ref) to
`masque` yourself.

## Read `(x, y)` from the axis

With an [`AxisInteractable`](@ref), a tooltip follows the pointer
anywhere on the axis and shows the data coordinates under it. A click
sets the readout's field, `sel.axis`, to an [`AxisEvent`](@ref) with
`x` and `y`. With `bind = ints`, where `ints` is the readout, `pick`
is that event:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-readouts-player" data-masque-embed="readouts_axis" title="Sine plot. Hover to see the coordinates under the pointer." style="width:100%;height:640px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("readouts_axis")
```

Use an axis readout to mark a position where there is no mark, such as
the start of a time window or a point to fit from. It works on linear,
log, and categorical axes. On a categorical axis, the tooltip shows the
category under the pointer, and a click returns the category's position
(Makie places categories at `1, 2, …, n`) with its label in `pick.xcat`
or `pick.ycat`. On a numeric axis, that field is `nothing`.

The example above shows only the tooltip, because this site does not
record clicks on a position ([Examples on this site](@ref this-site)). In
your notebook, a click sets `pick`.

On a `PolarAxis`, the readout is the angle and radius under the
pointer, in the same order as your data: `pick.x` is the angle in
radians and `pick.y` the radius, swapped when the axis has
`theta_as_x = false`. On an axis that shows only part of the circle, a
point drawn below zero degrees reads back as a negative angle. Past the
edge of the circle the readout keeps going, as it does past the limits
of an ordinary axis.

## Read a colorbar value

Hover over a colorbar to see the value its color stands for, and click
it to set `sel.colorbar` to a [`ColorbarEvent`](@ref) with `value`.
`masque(fig)` adds a [`ColorbarInteractable`](@ref) for every
`Colorbar` in the figure, and the heatmap's cells take clicks too, into
`sel.cells`. To have the value be only the colorbar's, create the
`ColorbarInteractable` yourself and pass it as `bind`:

```julia
begin
    z = [Float64(i + 3j) for i in 1:4, j in 1:3]
    fig = Figure(size = (560, 280))
    ax = Axis(fig[1, 1])
    hm = heatmap!(ax, 1:4, 1:3, z)
    cb = Colorbar(fig[1, 2], hm)
    cbint = ColorbarInteractable(cb)
    nothing
end
```

```julia
@bind pick masque(fig; bind = cbint)
```

```@raw html
<video id="masque-readout-colorbar-clip" title="Hovering a colorbar, then clicking two values while the readout shows each, with CairoMakie"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-readout-colorbar-clip");
  if (!el) return;
  el.src = (pretty ? "../assets/" : "assets/") + "readout-colorbar.mp4";
})();
</script>
```

`pick` is `nothing` until the first click on the colorbar. The cells
still show their tooltips, but clicking them does not change `pick`.

A later cell could use `pick.value` as a contour level or a threshold
for the heatmap.

## Drag a threshold

A [`ThresholdInteractable`](@ref) draws a line across the axis for you
to drag. Use it for a cutoff you would otherwise set with a slider, so
that you set it against the data itself. The line starts at `value`.
With `orientation = :horizontal` it sits at constant `y` and you drag
it up and down, and with `:vertical` it sits at constant `x`:

```julia
begin
    ys = [0.2, 0.8, 0.4, 0.9, 0.3, 0.6, 0.1, 0.7]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1])
    scatter!(ax, 1:8, ys; markersize = 16)
    cutoff = ThresholdInteractable(ax; orientation = :horizontal, value = 0.5)
    nothing
end
```

```julia
@bind level masque(fig; bind = cutoff)
```

`bind = cutoff` makes `level` the line's value: the points still show
their tooltips, but clicking them does not change `level`. `level` is a
[`ThresholdEvent`](@ref), and `level.value` is the line's position in
data coordinates. It starts at `value`, and changes when you release
the line after a drag:

```julia
"$(count(>(level.value), ys)) of $(length(ys)) points above $(round(level.value; digits = 2))"
```

```@raw html
<video id="masque-readout-threshold-clip" title="Dragging a horizontal threshold down and then up while the readout counts the points above it, with CairoMakie"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-readout-threshold-clip");
  if (!el) return;
  el.src = (pretty ? "../assets/" : "assets/") + "readout-threshold.mp4";
})();
</script>
```

On a categorical axis, the line shows the category while you drag.
When you release it, it snaps onto that category, `level.value` is the
category's position, and `level.category` is its label.

If the axis also has a [`ViewInteractable`](@ref), a plain drag moves
the threshold and Shift+drag pans. To move the line from the keyboard,
press Tab until it has focus, then use the arrow keys; see
[Keyboard and screen readers](@ref).

When the cell that creates the figure runs again, for example because a
slider it uses changed, the line and `level` both go back to `value`.
To keep a cutoff you like,
write its number as `value` in the figure code. Writing
`value = level.value` there does not work, for the same reason a widget
cannot take its own value as `selected=`; see [Selection](@ref).

## Set a range with two thresholds

One widget can hold several thresholds, boxes, and plots you click, each
in its own field. Give each a name with a named tuple, so you know which
field is which:

```julia
low = ThresholdInteractable(ax; orientation = :horizontal, value = 0.2)
high = ThresholdInteractable(ax; orientation = :horizontal, value = 0.8)
@bind band masque(fig; bind = (low = low, high = high))
```

```julia
"$(count(y -> band.low.value < y < band.high.value, ys)) of $(length(ys)) points between $(round(band.low.value; digits = 2)) and $(round(band.high.value; digits = 2))"
```

```@raw html
<video id="masque-readout-band-clip" title="Dragging the lower line up and the upper line down while the readout counts the points between them, with CairoMakie"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-readout-band-clip");
  if (!el) return;
  el.src = (pretty ? "../assets/" : "assets/") + "readout-band.mp4";
})();
</script>
```

Then `band.low.value` and `band.high.value` are the two lines'
positions, and moving one leaves the other's field as it was.

To drag one band with both edges at once, see [Drag a band](@ref).
To drag a box instead of a line, see [Brush a region](@ref).

## Drag a cutoff on a colorbar

Give [`ThresholdInteractable`](@ref) a `Colorbar` instead of an axis to
drag a line across the bar. Its value is on the colorbar's scale, so
you set a cutoff against the colors the heatmap shows:

```julia
begin
    z = [sin(x / 3) * cos(y / 4) for x in 1:30, y in 1:20]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1])
    hm = heatmap!(ax, z)
    cb = Colorbar(fig[1, 2], hm)
    cut = ThresholdInteractable(cb; value = 0.5)
    nothing
end
```

```julia
@bind level masque(fig; bind = cut)
```

```julia
"$(count(>(level.value), z)) of $(length(z)) cells above $(round(level.value; digits = 2))"
```

```@raw html
<video id="masque-readout-colorbar-threshold-clip" title="Dragging a cutoff down and then up a colorbar while the readout counts the heatmap cells above it, with CairoMakie"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-readout-colorbar-threshold-clip");
  if (!el) return;
  el.src = (pretty ? "../assets/" : "assets/") + "readout-colorbar-threshold.mp4";
})();
</script>
```

The line runs across the bar, so leave `orientation` out: it is
horizontal on a vertical colorbar and vertical on a horizontal one.
`value` must lie inside the colorbar's limits. Hovering the bar away
from the line still shows the value under the pointer. With `onchange`
(see [Update the figure](@ref)), a redraw that moves the colorbar's
limits past the line leaves the line at the end of the bar until you
drag it.

## Drag a band

[`SpanInteractable`](@ref) is a range you drag as one piece: two
edges, with the plot outside them faded. Drag an edge to move that
end, or drag inside the band to move both:

```julia
window = SpanInteractable(ax; span = (2.0, 5.0))
@bind win masque(fig; bind = window)
```

```julia
"$(count(x -> win.lo <= x <= win.hi, xs)) points from $(round(win.lo; digits = 2)) to $(round(win.hi; digits = 2))"
```

`win.lo` is always the lower value and `win.hi` the higher one;
an edge you drag stops at the other edge. The edges are vertical lines
across the axis, so the band picks out a range of `x`. Pass
`orientation = :horizontal` for a range of `y`. Hovering or clicking a
point inside the band still works as it does elsewhere.

On a colorbar, the band picks out a range of the colorbar's values,
and `span` must lie inside its limits:

```julia
cb = Colorbar(fig[1, 2], hm)
@bind levels masque(fig; bind = SpanInteractable(cb; span = (-0.5, 0.5)))
```

Hovering the bar inside the band still shows the value under the
pointer.

## Supported axes

The axis readout and the threshold need a 2D `Axis`; a threshold can
also go on a `Colorbar`. See
[Supported plots and axes](@ref) for which axes and scales.
