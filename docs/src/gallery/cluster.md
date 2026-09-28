# Compare a cluster

Drag a box around a group of points to see what is different about
it. In this clip, the box starts on one cluster, moves to the other,
then shrinks to cover half of it. The count beside the box updates as
it moves. After each release, the histogram under the scatter compares
the `z` of the points in the box with all the samples.

```@raw html
<video id="masque-cluster-clip" title="Dragging a box between two clusters. The histogram below updates after each release."
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

Create the scatter and the box:

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
    inside = isnothing(picks) ? Float64[] : zs[picks]
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

Each point's payload carries its three measurements, so hovering over
a point shows them. The [`ROIInteractable`](@ref) names the points'
layer with `selects = :pts`, so when you release the box, `picks` is a
vector with one event per point inside. Index your data with it:
`zs[picks]` is the `z` of the points in the box.

## Variations

- Keep your samples in a `DataFrame` and pass it as `payloads`. Then
  `df[picks, :]` is the rows inside the box. Before the first release,
  `picks` is `nothing`, so check for it:
  `isnothing(picks) || isempty(picks) ? df[1:0, :] : df[picks, :]`.
- Replace the histogram with whatever the comparison needs: a table of
  means, a second scatter of two other columns, or a model fitted to the
  selected points only.

Next, see [Brush a region](@ref) for more on the box, and
[Linked views](@ref) for updating other plots from a selection.
