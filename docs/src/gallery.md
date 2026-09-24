# Examples

Each example is a small notebook you can copy. On an example's page,
hovering works as it does in Pluto, every click swaps in a recorded
result, brushes swap in results recorded for a few boxes, and the
notebook follows the player as text.
Pan and orbit are recorded clips instead.

## Analyses

Worked examples of an interaction feeding an analysis: a brush that
compares a cluster, a heatmap cell that opens the data behind it, a
click mirrored into a second plot.

```@raw html
<div class="masque-gallery">
<a class="masque-gallery-card" data-page="cluster">
  <img alt="A scatter of two clusters with a box and a comparison histogram" src="assets/gallery/cluster.png">
  <span>Compare a cluster</span>
</a>
<a class="masque-gallery-card" data-page="heatmap-trace">
  <img alt="A heatmap of daily temperature by station" src="assets/gallery/heatmap-trace.png">
  <span>From a heatmap cell to its trace</span>
</a>
<a class="masque-gallery-card" data-page="selection">
  <img alt="Two scatters; the right figure highlights the mark clicked on the left" src="assets/gallery/selection.png">
  <span>Selection round-trip</span>
</a>
<a class="masque-gallery-card" data-page="boxselect">
  <img alt="A two-group scatter with a selection box" src="assets/gallery/boxselect.png">
  <span>Box-select scatter</span>
</a>
<a class="masque-gallery-card" data-page="image">
  <img alt="An RGB image with a region box" src="assets/gallery/image.png">
  <span>Image ROI</span>
</a>
<a class="masque-gallery-card" data-page="tooltips">
  <img alt="Four city markers with a template tooltip" src="assets/gallery/tooltips.png">
  <span>Tooltip templates</span>
</a>
</div>
```

## Plot types

One page per kind of plot, showing what a hover or click on it returns.
Pan and orbit are recorded clips, since moving the view needs a running
notebook.

```@raw html
<div class="masque-gallery">
<a class="masque-gallery-card" data-page="bars">
  <img alt="Histogram, waterfall, crossbar, and bars with spans" src="assets/gallery/bars.png">
  <span>Bars and areas</span>
</a>
<a class="masque-gallery-card" data-page="polygons">
  <img alt="Band, density, contour, violin, Voronoi, and box plots" src="assets/gallery/polygons.png">
  <span>Polygons</span>
</a>
<a class="masque-gallery-card" data-page="colorbar">
  <img alt="A gaussian heatmap with a colorbar" src="assets/gallery/colorbar.png">
  <span>Colorbar</span>
</a>
<a class="masque-gallery-card" data-page="text">
  <img alt="Scatter points with Alpha, Beta, Gamma, a tilted label, and an annotation" src="assets/gallery/text.png">
  <span>Text labels</span>
</a>
<a class="masque-gallery-card" data-page="polar">
  <img alt="Four points on a polar axis" src="assets/gallery/polar.png">
  <span>Polar points</span>
</a>
<a class="masque-gallery-card" data-page="limits">
  <img alt="A scatter clipped by axis limits" src="assets/gallery/limits.png">
  <span>Limits slider</span>
</a>
<a class="masque-gallery-card" data-page="pan">
  <img alt="A scatter you drag to pan" src="assets/gallery/pan.png">
  <span>Drag to pan</span>
</a>
<a class="masque-gallery-card" data-page="orbit">
  <img alt="Three markers on an Axis3" src="assets/gallery/orbit.png">
  <span>Drag to orbit</span>
</a>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var root = pretty ? "../" : "";
  document.querySelectorAll("a.masque-gallery-card").forEach(function (a) {
    var page = a.getAttribute("data-page");
    a.href = root + "gallery/" + page + (pretty ? "/" : ".html");
    var img = a.querySelector("img");
    if (img) img.src = root + "assets/gallery/" + page + ".png";
  });
})();
</script>
```
