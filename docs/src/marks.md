# Click marks

Click a bar, a polygon, or a polar point. Each notebook is the tutorial.
Paste its cells into your own notebook, including the notes. On this site
the **Simulating `@bind`** chip is a listed snapshot. In Pluto, the
readout cell re-runs.

This page does not reuse `fig` or `sel` from [Getting started](@ref).

## Click a bar

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-bars" data-masque-embed="marks_bars" title="Four-bar plot. Click a bar and the readout names its value." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_bars")
```

`barplot!` on a `PolarAxis` is skipped with `@warn`. Keyboard arrows reach
bars. A heatmap cell is a different job. For more information, see
[Inspect a grid](@ref).

## Click polygons

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-poly" data-masque-embed="marks_poly" title="Three polygons. Click one and the readout names it." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_poly")
```

`poly!` on a `PolarAxis` is skipped with `@warn`. Band, density, contourf,
violin, and voronoiplot are clickable the same way. For more information,
see [Polygons](@ref).

## Click a line

A `lines!` path is one element: the whole line. Four vertices still draw
three edges, but a click anywhere along the path binds that one line.

```julia
begin
    fig = Figure()
    ax = Axis(fig[1, 1])
    lines!(ax, [0, 1, 2, 3], [0, 1, 0, 1])
    nothing
end
```

```julia
@bind pick masque(fig)
```

`stairs!` is the same whole-line kind. `series!` is one line layer with
one element per series. Line segments, errorbars, rangebars, hlines, and
vlines stay one element per piece.

## Click points on a polar axis

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-polar" data-masque-embed="marks_polar" title="Four polar points. Click one and the readout reads its radius." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_polar")
```

Scatter, lines, line segments, and `series!` work on a `PolarAxis`.
`AxisInteractable`, `ThresholdInteractable`, `ROIInteractable`,
`SliceInteractable`, and `ViewInteractable` on polar raise
`ArgumentError`. `heatmap!`, `barplot!`, and `poly!` on polar are
skipped with `@warn`.
