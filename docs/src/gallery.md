# Examples

Each example is a small notebook you can copy, with its code below it.
Hover over a figure, click a mark, or drag a box, and the cells below it
respond. [Examples on this site](@ref this-site) says how the examples
work without Julia running.

## Analyses

A click or a box feeds the next step of an analysis.

```@raw html
<div class="masque-gallery">
<a class="masque-gallery-card" data-page="cluster">
  <img alt="A scatter of two clusters with a box and a comparison histogram" src="assets/gallery/cluster.png">
  <span>Compare a cluster</span>
</a>
<a class="masque-gallery-card" data-page="threshold">
  <img alt="A picture of bright cells with the ones above a cutoff in red, beside its brightness histogram and the cutoff line" src="assets/gallery/threshold.png">
  <span>Threshold a mask</span>
</a>
<a class="masque-gallery-card" data-page="segmentation">
  <img alt="A picture of bright cells, with three objects that are cells stuck together outlined as picked" src="assets/gallery/segmentation.png">
  <span>Annotate a segmentation</span>
</a>
<a class="masque-gallery-card" data-page="linked">
  <img alt="Two scatters of the same cars, with the heaviest cars picked on both" src="assets/gallery/linked.png">
  <span>Filter one plot from another</span>
</a>
<a class="masque-gallery-card" data-page="heatmap-trace">
  <img alt="A heatmap of daily temperature by station, with one cell picked and its tooltip showing" src="assets/gallery/heatmap-trace.png">
  <span>From a heatmap cell to its trace</span>
</a>
<a class="masque-gallery-card" data-page="boxselect">
  <img alt="A two-group scatter with a selection box" src="assets/gallery/boxselect.png">
  <span>Box-select scatter</span>
</a>
<a class="masque-gallery-card" data-page="image">
  <img alt="An RGB image with a region box" src="assets/gallery/image.png">
  <span>Image ROI</span>
</a>
</div>
```

## Plot types

Each of these plots has its own page: what a click returns, how to show
your own data in the tooltip, and the options that plot has. [All plot
types](plots.md) lists every plot that has a page.

```@raw html
<div class="masque-gallery">
<a class="masque-gallery-card" data-dir="plots" data-page="scatter">
  <img alt="Homes by size and price, with one marker picked" src="assets/gallery/scatter.png">
  <span>scatter!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="meshscatter">
  <img alt="Spheres scattered on a plane, with one sphere picked" src="assets/gallery/meshscatter.png">
  <span>meshscatter!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="text">
  <img alt="City names placed by longitude and latitude, with Berlin picked" src="assets/gallery/text-plot.png">
  <span>text!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="annotation">
  <img alt="Visitors by year with two notes, with the pandemic note picked" src="assets/gallery/annotation.png">
  <span>annotation!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="violin">
  <img alt="Three violins of penguin weight, with the middle one picked" src="assets/gallery/violin.png">
  <span>violin!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="boxplot">
  <img alt="Three box plots of travel time, with the middle box picked" src="assets/gallery/boxplot.png">
  <span>boxplot!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="rainclouds">
  <img alt="Two rainclouds of scores, with the pointer's tooltip showing a box's quartiles" src="assets/gallery/rainclouds.png">
  <span>rainclouds!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="density">
  <img alt="Two overlapping height densities, with the blue one picked" src="assets/gallery/density.png">
  <span>density!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="qqplot">
  <img alt="A normal Q-Q plot of wait times, with the highest point picked" src="assets/gallery/qqplot.png">
  <span>qqplot!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="barplot">
  <img alt="Four bars of crates sold, with the apples bar picked" src="assets/gallery/barplot.png">
  <span>barplot!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="hist">
  <img alt="A histogram of heights, with one bin picked" src="assets/gallery/hist.png">
  <span>hist!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="waterfall">
  <img alt="A waterfall of income and costs, with the wages bar picked" src="assets/gallery/waterfall.png">
  <span>waterfall!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="crossbar">
  <img alt="Four crossbars of response by dose, with the 10 mg one picked" src="assets/gallery/crossbar.png">
  <span>crossbar!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="hspan">
  <img alt="A price line with two shaded spans, the first one picked" src="assets/gallery/hspan.png">
  <span>hspan! / vspan!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="lines">
  <img alt="Daily temperature in two cities, with the warmest hour picked" src="assets/gallery/lines.png">
  <span>lines!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="series">
  <img alt="Weekly sales of three products, with one week of one product picked" src="assets/gallery/series.png">
  <span>series!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="stairs">
  <img alt="Staff on shift by day as a staircase, with one step picked" src="assets/gallery/stairs.png">
  <span>stairs!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="scatterlines">
  <img alt="Visitors by month as points joined by a line, with the busiest month picked" src="assets/gallery/scatterlines.png">
  <span>scatterlines!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="ecdfplot">
  <img alt="The cumulative share of trains by delay, with one step picked" src="assets/gallery/ecdfplot.png">
  <span>ecdfplot!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="contour">
  <img alt="Contours of a hill's height, with a point on the outer contour picked" src="assets/gallery/contour.png">
  <span>contour!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="arc">
  <img alt="Two arcs, an inner half circle and an outer quarter, with a point on the outer arc picked" src="assets/gallery/arc.png">
  <span>arc!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="heatmap">
  <img alt="A heatmap of shop visits by weekday and hour, with one cell picked" src="assets/gallery/heatmap.png">
  <span>heatmap! / image!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="contourf">
  <img alt="Filled contours of two hills, with the top of the higher hill picked" src="assets/gallery/contourf.png">
  <span>contourf!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="hexbin">
  <img alt="A hexbin of height and weight, with one hexagon picked" src="assets/gallery/hexbin.png">
  <span>hexbin!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="datashader">
  <img alt="A ring of points drawn with datashader, with the pointer's tooltip showing a pixel's count" src="assets/gallery/datashader.png">
  <span>datashader!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="spy">
  <img alt="The nonzero entries of a 20 by 20 matrix, with one entry picked" src="assets/gallery/spy.png">
  <span>spy!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="points3d">
  <img alt="A 3D scatter of response by dose and age, with one marker picked" src="assets/gallery/points3d.png">
  <span>3D scatter! / lines!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="surface">
  <img alt="A 3D surface of two hills, with the pointer's tooltip showing the height near the top" src="assets/gallery/surface.png">
  <span>surface!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="arrows3d">
  <img alt="Nine arrows in 3D, with one arrow picked" src="assets/gallery/arrows3d.png">
  <span>arrows3d!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="wireframe">
  <img alt="A hill drawn as a wireframe, with one edge picked" src="assets/gallery/wireframe.png">
  <span>wireframe!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="streamplot">
  <img alt="A swirling streamplot, with one arrowhead picked" src="assets/gallery/streamplot.png">
  <span>streamplot!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="linesegments">
  <img alt="A project schedule drawn as segments, with the build task picked" src="assets/gallery/linesegments.png">
  <span>linesegments!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="errorbars">
  <img alt="Mean response at five doses with error bars, with the 10 mg bar picked" src="assets/gallery/errorbars.png">
  <span>errorbars!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="rangebars">
  <img alt="Monthly temperature ranges, with April picked" src="assets/gallery/rangebars.png">
  <span>rangebars!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="hlines">
  <img alt="Daily load with two horizontal limits and two event lines, with the upper limit picked" src="assets/gallery/hlines.png">
  <span>hlines! / vlines!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="ablines">
  <img alt="Points with a fitted line and the line y = x, with the fitted line picked" src="assets/gallery/ablines.png">
  <span>ablines!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="arrows2d">
  <img alt="A field of arrows, with one arrow picked" src="assets/gallery/arrows2d.png">
  <span>arrows2d!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="stem">
  <img alt="A decaying signal drawn as stems, with one point picked" src="assets/gallery/stem.png">
  <span>stem!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="poly">
  <img alt="Four fields drawn as polygons, with the barley field picked" src="assets/gallery/poly.png">
  <span>poly!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="band">
  <img alt="Two forecast bands, with the blue one picked" src="assets/gallery/band.png">
  <span>band!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="pie">
  <img alt="Sales by region as a pie, with the north slice picked" src="assets/gallery/pie.png">
  <span>pie!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="voronoiplot">
  <img alt="Rainfall cells around 18 stations, with one cell picked" src="assets/gallery/voronoiplot.png">
  <span>voronoiplot!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="tricontourf">
  <img alt="Filled depth contours from scattered points, with one region picked" src="assets/gallery/tricontourf.png">
  <span>tricontourf!</span>
</a>
<a class="masque-gallery-card" data-dir="plots" data-page="triplot">
  <img alt="The triangles between 12 points, with one triangle picked" src="assets/gallery/triplot.png">
  <span>triplot!</span>
</a>
</div>
```

```@raw html
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var root = pretty ? "../" : "";
  document.querySelectorAll("a.masque-gallery-card").forEach(function (a) {
    var page = a.getAttribute("data-page");
    var dir = a.getAttribute("data-dir") || "gallery";
    a.href = root + dir + "/" + page + (pretty ? "/" : ".html");
    var img = a.querySelector("img");
    if (img) img.src = root + "assets/gallery/" + page + ".png";
  });
})();
</script>
```
