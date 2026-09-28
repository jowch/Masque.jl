# Read coordinates

Sometimes the value you want isn't a mark but a position on the plot:
the data coordinates under the pointer, the value a color stands for,
or a cutoff you set by dragging a line. `masque(fig)` makes every
colorbar a readout for you. For the other two, pass an
[`AxisInteractable`](@ref) or a [`ThresholdInteractable`](@ref) to
`masque` yourself.

## Read `(x, y)` from the axis

With an [`AxisInteractable`](@ref), a tooltip follows the pointer
anywhere on the axis and shows the data coordinates under it. A click
sets `pick` to an [`AxisEvent`](@ref) with `pick.x` and `pick.y`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-readouts-player" data-masque-embed="readouts_axis" title="Sine plot. Hover to see the coordinates under the pointer." style="width:100%;height:1100px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("readouts_axis")
```

Use an axis readout to mark a position where there is no mark, such as
the start of a time window or a point to fit from. It works on linear,
log, and categorical axes. On a categorical axis, the tooltip shows the
category under the pointer. A click returns the category's position
(Makie places categories at `1, 2, …, n`) and puts its label in
`pick.xcat` or `pick.ycat`. For a numeric `x` or `y`, that field is
`nothing`.

The example above shows only the tooltip, because this site does not
record clicks on a position ([Static exports and this site](@ref)). In
your notebook, a click sets `pick`.

## Read a colorbar value

Hover over a colorbar to see the value its color stands for. A click
sets `pick` to a [`ColorbarEvent`](@ref) with `pick.value`. `masque(fig)`
adds a [`ColorbarInteractable`](@ref) for every `Colorbar` in the
figure. Create one yourself when you want the colorbar without the
heatmap's cells in the same widget:

```julia
begin
    z = [Float64(i + 3j) for i in 1:4, j in 1:3]
    fig = Figure(size = (560, 280))
    ax = Axis(fig[1, 1])
    hm = heatmap!(ax, 1:4, 1:3, z)
    cb = Colorbar(fig[1, 2], hm)
    cbint = ColorbarInteractable(cb)
    nothing
end
```

```julia
@bind pick masque(fig, cbint)
```

A later cell could use `pick.value` as a contour level or a threshold
for the heatmap.

## Drag a threshold

[`ThresholdInteractable`](@ref) draws a line across the axis that you
drag. Use it for a cutoff you would otherwise set with a slider: you set
it against the data itself. `value` is where the line starts.
`:horizontal` gives a line at constant `y` that you drag up and down,
and `:vertical` gives one at constant `x`:

```julia
begin
    ys = [0.2, 0.8, 0.4, 0.9, 0.3, 0.6, 0.1, 0.7]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1])
    scatter!(ax, 1:8, ys; markersize = 16)
    cutoff = ThresholdInteractable(ax; orientation = :horizontal, value = 0.5)
    nothing
end
```

```julia
@bind level masque(fig, cutoff)
```

The line follows your drag. When you release it, `level` becomes a
[`ThresholdEvent`](@ref), and `level.value` is the line's new position
in data coordinates. Before the first drag, `level` is `nothing`, so use
the starting value:

```julia
begin
    t = isnothing(level) ? 0.5 : level.value
    "$(count(>(t), ys)) of $(length(ys)) points above $(round(t; digits = 2))"
end
```

On a categorical axis, the line shows the category while you drag.
When you release it, it snaps onto that category, `level.value` is the
category's position, and `level.category` is its label.

If the axis also has a [`ViewInteractable`](@ref), a plain drag moves
the threshold and Shift+drag pans.

When the cell that creates the figure runs again, for example because a
slider it uses changed, the line goes back to `value` and `level` goes
back to `nothing`. The cell above then falls back to the starting
value, so its count still matches the line. To keep a cutoff you like,
write its number as `value` in the figure code. Writing
`value = level.value` there does not work, for the same reason as
`selected = pick`; see [Selection](@ref).

## Where these work

The axis readout and the threshold need a 2D `Axis`; see
[Supported plots and axes](@ref) for which axes and scales.

To drag a box instead of a line, see [Brush a region](@ref).
