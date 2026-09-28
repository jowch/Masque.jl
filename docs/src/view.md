# Pan and orbit

Add a [`ViewInteractable`](@ref) to an axis to look closer: drag a 2D
plot to pan it, scroll to zoom, or drag an `Axis3` to turn it. Moving
the view does not change the `@bind` value, so cells that use it do not
respond.

```@raw html
<video id="masque-view-clip" title="Dragging a 2D scatter to pan it, with CairoMakie"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-view-clip");
  if (!el) return;
  el.src = (pretty ? "../assets/" : "assets/") + "view-pan.mp4";
})();
</script>
```

## Pan and zoom a 2D axis

`masque(fig)` does not add panning on its own. Pass a
`ViewInteractable` for the axis you want to move, along with any other
interactables:

```julia
begin
    xs = Float64[1, 2, 3, 4, 5, 6]
    ys = Float64[1, 4, 9, 16, 25, 36]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
    s = scatter!(ax, xs, ys; color = :dodgerblue, markersize = 18)
    pan = ViewInteractable(ax)
    pts = PointInteractable(ax, s)
    nothing
end
```

```julia
@bind pick masque(fig, [pan, pts])
```

Drag the plot to pan, and scroll to zoom around the pointer. The axis
frame stays in place while the data moves inside it. You can hover over
and click the points wherever they move to. `pick` changes only when you
click a point.

Julia redraws the figure as you drag, so panning needs a running
notebook. With CairoMakie the page shows each new image, and with
WGLMakie the canvas updates. In a static HTML export, the view cannot
move. See [Pan and orbit preview](@ref) for how the two backends
differ.

If the same axis has a threshold line or a brushing box, a plain drag
moves the line or box, and Shift+drag pans.

## Orbit an `Axis3`

On an `Axis3`, dragging turns the camera around the plot (azimuth and
elevation) instead of panning. It works on both backends, and you can
hover over and click the marks as the view turns.

```julia
begin
    fig = Figure(size = (560, 360))
    ax = Axis3(fig[1, 1])
    s = scatter!(ax, Makie.Point3f[(1, 2, 3), (4, 5, 6), (7, 8, 2)]; markersize = 16)
    orbit = ViewInteractable(ax)
    nothing
end
```

```julia
@bind pick masque(fig, [orbit, PointInteractable(ax, s)])
```

## When the figure is rebuilt

Dragging changes the axis itself: its limits, or its azimuth and
elevation on an `Axis3`. So a new `masque` call on the same figure
starts at the view you dragged to. A rebuilt figure has a new `Axis`,
which starts from the limits or angles in your code. To keep a view
across a rebuild, set those values in the figure code, for example from
a slider bound to the limits.

## Where it works

Panning needs a 2D `Axis` with numeric limits on an `identity`,
`log10`, or `log` scale. Orbiting needs an `Axis3`. A `PolarAxis`, a
`Colorbar`, a categorical axis, or another scale raises an
`ArgumentError` when `masque` runs. An `LScene` is not supported. See
[Supported plots and axes](@ref).

For complete examples, see [Drag to pan](@ref) and [Drag to orbit](@ref).
