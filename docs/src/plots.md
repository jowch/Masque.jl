# Plot types

Each page below shows one kind of plot with Masque: what `masque(fig)`
gives you, what a click returns, how to show your own data, and what to
add for the parts that don't respond on their own.

| Plot | Kind of plot | What responds |
|---|---|---|
| [`scatter!`](plots/scatter.md) | points | each marker |
| [`meshscatter!`](plots/meshscatter.md) | points | each sphere |
| [`text!`](plots/text.md) | labels | each label |
| [`annotation!`](plots/annotation.md) | labels | each annotation's text |
| [`violin!`](plots/violin.md) | distribution | each violin |
| [`boxplot!`](plots/boxplot.md) | distribution | each box |
| [`rainclouds!`](plots/rainclouds.md) | distribution | each raindrop, violin and box |
| [`density!`](plots/density.md) | distribution | each curve |
| [`qqplot!`, `qqnorm!`](plots/qqplot.md) | distribution | each point, and the reference line |
| [`barplot!`](plots/barplot.md) | bars | each bar, and each segment of a stacked bar |
| [`hist!`](plots/hist.md) | bars | each bin |
| [`waterfall!`](plots/waterfall.md) | bars | each bar |
| [`crossbar!`](plots/crossbar.md) | bars | each crossbar |
| [`hspan!`, `vspan!`](plots/hspan.md) | bars | each span |
| [`lines!`](plots/lines.md) | lines | each line, and the point nearest the pointer |
| [`series!`](plots/series.md) | lines | each curve, and the point nearest the pointer |
| [`stairs!`](plots/stairs.md) | lines | the staircase, and the step nearest the pointer |
| [`scatterlines!`](plots/scatterlines.md) | lines | each point, and the line's tooltip |
| [`ecdfplot!`](plots/ecdfplot.md) | lines | the curve, and the step nearest the pointer |
| [`contour!`](plots/contour.md) | lines | all contours as one line, and each label |
| [`heatmap!`, `image!`](plots/heatmap.md) | grid | each cell |
| [`contourf!`](plots/contourf.md) | grid | each filled region |
| [`hexbin!`](plots/hexbin.md) | grid | each hexagon |
| [`datashader!`](plots/datashader.md) | grid | each pixel |
| [`spy!`](plots/spy.md) | grid | each nonzero entry |
| [`scatter!`, `lines!` on an `Axis3`](plots/points3d.md) | 3D | each marker, sphere and line |
| [`surface!`](plots/surface.md) | 3D | the point nearest the pointer |
| [`arrows3d!`](plots/arrows3d.md) | 3D | each arrow |
| [`linesegments!`](plots/linesegments.md) | segments | each segment |
| [`errorbars!`](plots/errorbars.md) | segments | each error bar |
| [`rangebars!`](plots/rangebars.md) | segments | each range bar |
| [`hlines!`, `vlines!`](plots/hlines.md) | segments | each line |
| [`ablines!`](plots/ablines.md) | segments | each line |
| [`arrows2d!`](plots/arrows2d.md) | segments | each arrow |
| [`poly!`](plots/poly.md) | areas | each polygon |
| [`band!`](plots/band.md) | areas | the whole band |
| [`pie!`](plots/pie.md) | areas | each slice |
| [`voronoiplot!`](plots/voronoiplot.md) | areas | each cell |
| [`tricontourf!`](plots/tricontourf.md) | areas | each filled region |
| [`triplot!`](plots/triplot.md) | areas | each triangle |
| [`streamplot!`](plots/streamplot.md) | several parts | each arrowhead, and the stream lines |
| [`stem!`](plots/stem.md) | several parts | each point, and each stem |

For every plot Masque supports, and the axes each one works on, see
[Supported plots and axes](@ref).
