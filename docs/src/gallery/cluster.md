# Compare a cluster

A brush is the natural way to ask "what is different about these
points?". The clip below is a live notebook: the box is set down on one
cluster, dragged to the other, then pulled in to half of it, and after
each release the histogram under the scatter compares the `z` of the
points in the box with every sample.

```@raw html
<video id="masque-cluster-clip" title="Dragging a box between two clusters in a live notebook; the histogram below recomputes after each release"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:720px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-cluster-clip");
  if (!el) return;
  el.src = (pretty ? "../../assets/" : "../assets/") + "example-cluster.mp4";
})();
</script>
```

This page is a clip rather than a player: with 150 points there are far
too many different boxes to record each one. In the clip, the count
beside the box is the overlay's own while the box moves; the histogram
changes only when the box is released and Julia re-runs the last cell.
In your notebook, hovering a point also shows its three measurements.

Copy the three cells to try it. Draw the scatter and build the box:

```julia
begin
    # Deterministic noise, so the example looks the same every time it runs.
    u(k) = mod(sin(k * 12.9898) * 43758.5453, 1.0)
    g(k) = sqrt(-2log(u(k) + 1.0e-9)) * cos(2π * u(k + 0.5))
    n = 150
    xs = [i <= 80 ? 3.0 + 0.9g(i) : 7.0 + 0.9g(i) for i in 1:n]
    ys = [i <= 80 ? 3.0 + 0.9g(i + 1000) : 6.0 + 0.8g(i + 1000) for i in 1:n]
    zs = [i <= 80 ? 1.2 + 0.3g(i + 2000) : 2.8 + 0.35g(i + 2000) for i in 1:n]
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y", title = "drag the box over a cluster")
    s = scatter!(ax, xs, ys; color = zs, colormap = :viridis, markersize = 9)
    samples = [(; sample = i, x = round(xs[i]; digits = 2), y = round(ys[i]; digits = 2), z = round(zs[i]; digits = 2)) for i in 1:n]
    pts = PointInteractable(ax, s; id = :pts, payloads = samples)
    roi = ROIInteractable(ax; bounds = (5.2, 9.2, 4.4, 7.8), selects = :pts)
    nothing
end
```

Bind the box:

```julia
@bind picks masque(fig, [pts, roi])
```

Compare what is inside with every sample:

```julia
begin
    edges = range(minimum(zs), maximum(zs); length = 21)
    inside = picks === nothing ? Float64[] : zs[picks]
    cmp = Figure(size = (560, 260))
    cax = Axis(
        cmp[1, 1]; xlabel = "z", ylabel = "samples",
        title = isempty(inside) ? "all samples" : "$(length(inside)) samples in the box, against all $(length(zs))"
    )
    hist!(cax, zs; bins = edges, color = (:gray, 0.45), label = "all")
    isempty(inside) || hist!(cax, inside; bins = edges, color = (:darkorange, 0.85), label = "in the box")
    axislegend(cax; position = :rt)
    cmp
end
```

## How it works

Each point's payload carries its three measurements, so the tooltip
shows them without any extra code. The [`ROIInteractable`](@ref) names
the points' layer with `selects = :pts`, so releasing the box makes
`picks` a vector with one event per point inside. That vector indexes
your data directly — `zs[picks]` is the `z` of the points in the box —
and the last cell draws an ordinary Makie figure from it.

## Variations

- Keep your samples in a `DataFrame` and pass it as `payloads`; then
  `df[picks, :]` is the rows inside the box, ready for any summary.
  Guard it for the state before the first release, when `picks` is
  `nothing`:
  `picks === nothing || isempty(picks) ? df[1:0, :] : df[picks, :]`.
- Replace the histogram with whatever the comparison needs: a table of
  means, a second scatter of two other columns, or a model fitted to the
  selected points only.

[Brush a region](@ref) covers the box itself; [Linked views](@ref)
covers driving other plots from a selection.
