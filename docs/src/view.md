# Pan and orbit

Sometimes the point of interaction is just to look closer: drag a 2D
plot to pan it, scroll to zoom, or drag an `Axis3` to turn it. A
[`ViewInteractable`](@ref) on an axis enables that. Moving the view is
about looking, not choosing, so it never changes a `@bind` value and
never re-runs a cell.

```@raw html
<video id="masque-view-clip" title="CairoMakie in-drag pan frames on a 2D scatter"
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

`masque(fig)` does not add panning on its own; pass a `ViewInteractable`
for the axis you want to move, along with any other interactables:

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

Drag the plot to pan and use the scroll wheel to zoom about the pointer.
The axis frame stays put while the data slides inside it, and the
points stay hoverable and clickable wherever they end up. `pick` still
changes only when you click a point.

While you drag, Julia re-renders the view and streams it to the page, so
panning needs a running notebook: CairoMakie sends images, WGLMakie
updates its live canvas. In a static HTML export the view cannot move.
[Backends](@ref) has the details.

If the same axis has a threshold line or a brushing box, a plain drag
moves that handle and Shift+drag pans.

## Orbit an `Axis3`

On an `Axis3`, dragging turns the camera around the plot (azimuth and
elevation) instead of panning. It works on both backends, and marks on
the 3D axis stay hoverable and clickable as the view turns.

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

The view you panned or turned to lives only in the widget. When a cell
upstream re-runs and `masque` builds a new widget, the axis starts again
from the limits (or azimuth and elevation) in your figure code. If a
view needs to survive, set it in Julia — for example from a slider that
controls the axis limits, as in the [Limits](@ref) example.

## Where it works

Panning needs a 2D `Axis` with numeric limits on an `identity`, `log10`,
or `log` scale; orbiting needs an `Axis3`. A `PolarAxis`, a categorical
axis, or another scale raises an `ArgumentError` when `masque` runs, and
an `LScene` is not supported. See [Supported plots and axes](@ref).
