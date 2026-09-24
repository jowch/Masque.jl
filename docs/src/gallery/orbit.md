# Drag to orbit

`ViewInteractable` on an `Axis3` orbits the camera while you drag.
`azimuth` and `elevation` change in the live session. The bond stays
empty of any view payload, same as a 2D pan.

A static `Axis3` is a valid figure on CairoMakie. You do not need
WGLMakie to draw the three markers. See [Pan and orbit](@ref). The clip
is that drag.

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

A slider that sets `azimuth` and `elevation` and rebuilds the figure is
the other way to orbit. That path re-runs the cell. This drag does not.
Persisting a pose across a remount means storing the two angles
yourself and rebuilding. `selected=` does not store a camera.

!!! note

    Orbit commits nothing on both backends. In-drag frames need a live
    kernel: a PNG from `:cairo`, a serialized scene from `:webgl`. The
    clip above is that Cairo drag. Reach for `:webgl` when you want the
    orbit on the GPU canvas. `PolarAxis` and a `Colorbar` are not orbit
    targets.

