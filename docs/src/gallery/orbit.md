# Drag to orbit

Drag an `Axis3` that has a [`ViewInteractable`](@ref) to turn the
camera around the plot. In a running notebook, `azimuth` and
`elevation` change as you drag, and the `@bind` value does not change,
as with a 2D pan.

CairoMakie is enough for this; you do not need WGLMakie. The clip shows
the drag. See [Pan and orbit](@ref).

```@raw html
<video id="masque-gal-orbit" title="Drag to orbit three markers on an Axis3"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-orbit");
  if (!el) return;
  el.src = (pretty ? "../../assets/" : "../assets/") + "gallery-orbit.mp4";
})();
</script>
```

```julia
begin
    fig = Figure(size = (500, 380))
    ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "drag to orbit")
    scatter!(
        ax,
        Makie.Point3f[(1, 2, 3), (4, 5, 6), (7, 8, 2)];
        color = :crimson,
        markersize = 16,
    )
    view = ViewInteractable(ax)
    nothing
end
```

```julia
@bind pick masque(fig, view)
```

## Variations

The other way to orbit is a slider that sets `azimuth` and `elevation`
and rebuilds the figure. That re-runs the cell; dragging does not. To
keep a camera angle when the figure rebuilds, store the two angles
yourself and pass them to `Axis3`. `selected=` does not store a camera.

!!! note

    On both backends, orbiting leaves the `@bind` value unchanged and
    needs a running notebook, because Julia redraws the view while you
    drag. The clip uses CairoMakie. Use `:webgl` to orbit on WGLMakie's
    live canvas. A `PolarAxis` and a `Colorbar` cannot orbit.
