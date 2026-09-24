# Drag to pan

`ViewInteractable` on a 2D axis pans while you drag. The wheel zooms
about the cursor. The axis frame stays put while the data inside it
slides. The bond does not update when the camera moves. A click on a
marker still reports that point. The camera is not an analysis value.

In-drag frames need a live kernel. They travel on `with_js_link`, not
on `@bind`. See [Pan and orbit](@ref). The clip is that drag.

```@raw html
<video id="masque-gal-pan" title="Drag to pan a 2D scatter"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-pan");
  if (!el) return;
  el.src = (pretty ? "../../assets/" : "../assets/") + "gallery-pan.mp4";
})();
</script>
```

```julia
begin
    data = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0), (4.0, 16.0), (5.0, 25.0), (6.0, 36.0)]
    fig = Figure(size = (500, 320))
    ax = Axis(fig[1, 1]; limits = (0, 8, 0, 40), title = "drag to pan")
    s = scatter!(ax, first.(data), last.(data); color = :dodgerblue, markersize = 18)
    pts = PointInteractable(ax, s)
    view = ViewInteractable(ax)
    nothing
end
```

```julia
@bind pick masque(fig, [pts, view])
```

## Variations

Shift+drag pans when an ROI or a threshold is on the same axis.
`PolarAxis`, a `Colorbar`, a categorical axis, and a scale other than
`identity`, `log10`, or `log` raise `ArgumentError` at `masque` time.
A second figure whose limits are computed from this bond does not
follow the drag: the bond never carries `:view`.

!!! note

    The gesture commits nothing on both backends. On a live kernel,
    `:cairo` ships a PNG each frame and `:webgl` ships a serialized scene
    onto the canvas already on the page. The clip above is that Cairo
    drag. Reach for `:webgl` when those frames have to stay on the GPU.

