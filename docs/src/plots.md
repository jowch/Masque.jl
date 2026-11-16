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

For every plot Masque supports, and the axes each one works on, see
[Supported plots and axes](@ref).
