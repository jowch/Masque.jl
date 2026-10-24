# Threshold a mask

Drag a cutoff on a histogram and watch which pixels pass it. In this
clip, the line moves down until the background starts to leak in, up
until the dim cells drop out, then back to a cutoff that keeps every
cell. The red mask follows the line as you drag, and the cell under
the figure says how much of the picture is above the cutoff after
each release.

```@raw html
<video id="masque-threshold-clip" title="Dragging a cutoff line across a brightness histogram while the red mask over a picture of cells grows and shrinks, with CairoMakie"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:720px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-threshold-clip");
  if (!el) return;
  el.src = (pretty ? "../../assets/" : "../assets/") + "example-threshold.mp4";
})();
</script>
```

First, make a picture: a dim, noisy background with eighteen bright
cells of different sizes.

```julia
begin
    using Random
    Random.seed!(7)   # the same picture every time the notebook runs

    img = [0.15 + 0.1 * (i / 160) + 0.04 * randn() for i in 1:160, j in 1:100]
    for _ in 1:18
        ci, cj, r = rand(8:152), rand(8:92), rand(3.0:0.5:6.0)
        b = 0.45 + 0.4 * rand()
        img .+= [b * exp(-((i - ci)^2 + (j - cj)^2) / (2r^2)) for i in 1:160, j in 1:100]
    end
end
```

Then draw the picture with a mask over it, and its histogram with a
cutoff line. `onchange` redraws the mask each time the line moves:

```julia
begin
    fig = Figure(size = (720, 300))
    ax_img = Axis(fig[1, 1]; aspect = DataAspect(), title = "cells above the cutoff in red")
    hidedecorations!(ax_img)
    heatmap!(ax_img, img; colormap = :grays)
    maskplot = heatmap!(ax_img, img .> 0.4; colormap = [(:red, 0), (:red, 0.55)])

    ax_hist = Axis(fig[1, 2]; xlabel = "brightness", ylabel = "pixels",
        yscale = log10, title = "drag the cutoff")
    hist!(ax_hist, vec(img); bins = 60, color = :gray60, fillto = 0.5)
    ylims!(ax_hist, 0.8, 5000)

    cutoff = ThresholdInteractable(ax_hist; orientation = :vertical, value = 0.4)
    nothing
end
```

```julia
@bind level masque(fig, (cutoff = cutoff,); bind = :cutoff,
    onchange = state -> (maskplot[1] = img .> state.cutoff.value))
```

Finally, use the cutoff in another cell:

```julia
"$(round(100 * count(>(level.value), img) / length(img); digits = 1))% of the picture is above $(round(level.value; digits = 2))"
```

## How it works

The mask is a second heatmap of `true` and `false`, coloured clear
for `false` and see-through red for `true`. `onchange` gives it new
data with `maskplot[1] = …`, so the picture redraws while the cell
keeps the line where you left it. [Update the figure](@ref) has the
rules for what `onchange` may change.

The histogram's `y` axis is logarithmic because the background has
far more pixels than the cells. On a linear axis, the cells' part of
the histogram would be too flat to see where they start.
`fillto = 0.5` starts each bar below the axis, so the bars still
reach the bottom on a log axis.

`bind = :cutoff` makes `level` the threshold's last value, a
`ThresholdEvent`. The mask redraws as you drag, while `level` changes
only when you let go, so the cells that use it run once per release.

## Variations

- When the mask takes long to compute, build the line with
  `update_while_dragging = false`, and the mask redraws once, when
  you let go.
- Count the cells instead of the pixels: label the mask's connected
  regions, for example with `label_components` from ImageMorphology,
  in the cell that uses `level`.
- For a signal over time, plot it with `lines!` and use a
  `:horizontal` line to keep the stretches above a level.

Next, see [Update the figure](@ref) for more on `onchange`, and
[Compare a cluster](@ref) for a box that feeds the next cell.
