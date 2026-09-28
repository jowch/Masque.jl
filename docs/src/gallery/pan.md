# Drag to pan

Drag a 2D axis that has a [`ViewInteractable`](@ref) to pan it, and use
the scroll wheel to zoom about the pointer. The axis frame stays put
while the data slides inside it. Moving the view does not change the
`@bind` value, but clicking a marker still gives you that point.

Panning needs a running notebook, and other cells cannot read the view.
See [Pan and orbit](@ref). The clip shows the drag.

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

When an ROI or a threshold is on the same axis, Shift+drag pans.
`PolarAxis`, a `Colorbar`, a categorical axis, and a scale other than
`identity`, `log10`, or `log` raise `ArgumentError` when `masque` runs.
A second figure cannot follow the drag through `pick`, because the
`@bind` value never includes the view.

!!! note

    On both backends, panning leaves the `@bind` value unchanged. While
    you drag in a running notebook, CairoMakie sends a new image for each
    frame and WGLMakie updates its live canvas. The clip uses CairoMakie.
    Use `:webgl` when the redraw should stay on WGLMakie's canvas.
