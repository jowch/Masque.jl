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
</div>
```

These pages show what `masque(fig)` makes interactive on several plots
at once.

```@raw html
<div class="masque-gallery">
<a class="masque-gallery-card" data-page="bars">
  <img alt="Histogram, waterfall, crossbar, and bars with spans, with one histogram bar picked and its tooltip showing" src="assets/gallery/bars.png">
  <span>Bars and areas</span>
</a>
<a class="masque-gallery-card" data-page="polygons">
  <img alt="Band, density, contour, violin, Voronoi, and box plots, with one Voronoi cell picked" src="assets/gallery/polygons.png">
  <span>Polygons</span>
</a>
<a class="masque-gallery-card" data-page="text">
  <img alt="Scatter points with Alpha, Beta, Gamma, a tilted label, and an annotation, with Beta picked" src="assets/gallery/text.png">
  <span>Text labels</span>
</a>
</div>
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
