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

`masque(fig)` does not add panning on its own, so pass a
`ViewInteractable` for the axis you want to move. The plots on the axis
still respond as they do with `masque(fig)`:

```julia
begin
    xs = Float64[1, 2, 3, 4, 5, 6]
    ys = Float64[1, 4, 9, 16, 25, 36]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
    s = scatter!(ax, xs, ys; color = :dodgerblue, markersize = 18)
    pan = ViewInteractable(ax)
    nothing
end
```

```julia
@bind pick masque(fig, pan)
```

Drag the plot to pan, and scroll to zoom around the pointer. The axis
frame stays in place while the data moves inside it, and you can hover
over and click the points wherever they move to. `pick` changes only
when you click a point.

Panning and orbiting need a running notebook, so in a static HTML
export the view does not move. The two backends show the moving view
differently; see [Pan and orbit preview](@ref).

If the same axis has a threshold line or a brushing box, a plain drag
moves the line or box, and Shift+drag pans.

To pan from the keyboard, press Tab until the view has focus, then use
the arrow keys, and `+` / `-` to zoom. See
[Keyboard and screen readers](@ref).

## Orbit an `Axis3`

On an `Axis3`, dragging turns the camera around the plot (azimuth and
elevation) instead of panning. It works on both backends, and you can
hover over and click the marks as the view turns.

```@raw html
<video id="masque-view-orbit" title="Dragging an Axis3 to orbit three markers, with CairoMakie"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-view-orbit");
  if (!el) return;
  el.src = (pretty ? "../assets/" : "assets/") + "view-orbit.mp4";
})();
</script>
```

```julia
begin
    fig = Figure(size = (500, 380))
    ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "drag to orbit")
    s = scatter!(
        ax,
        Makie.Point3f[(1, 2, 3), (4, 5, 6), (7, 8, 2)];
        color = :crimson,
        markersize = 16,
    )
    orbit = ViewInteractable(ax)
    nothing
end
```

```julia
@bind pick masque(fig, orbit)
```

Scroll to zoom in or out around the middle of the axis box, and
Shift+drag to pan. The box keeps its size while the data grows or slides
inside it, and marks that leave the box are hidden and no longer respond
to hover or clicks. A line that crosses the edge of the box still
responds along the part you can see. A sphere from `meshscatter` stops
responding once its center leaves the box, even if part of it is still
showing. From the keyboard, `+` / `-` zoom and Shift with an
arrow key pans.

## When the figure is rebuilt

Dragging changes the axis itself: its limits, and its azimuth and
elevation on an `Axis3`. So if only the cell with `masque` runs again,
the plot stays at the view you dragged to.

When the cell that creates the figure runs again, for example because a
slider changed the data, it creates a new `Axis`, which starts from the
limits or angles in your code. To control where it starts, set them in
that code, for example from a PlutoUI `Slider` in another cell:

```julia
@bind xmax Slider(2:12; default = 6)
```

```julia
begin
    xs = Float64[1, 2, 3, 4, 5, 6]
    ys = Float64[1, 4, 9, 16, 25, 36]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; limits = (0, xmax, 0, 40))
    s = scatter!(ax, xs, ys; color = :dodgerblue, markersize = 18)
    pan = ViewInteractable(ax)
    nothing
end
```

For an `Axis3`, set `azimuth`, `elevation`, and `limits` the same way.

## Where it works

Panning needs a 2D `Axis` and orbiting an `Axis3`; see
[Supported plots and axes](@ref) for which axes and scales.
