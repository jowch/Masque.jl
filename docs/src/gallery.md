# Gallery

Each card is one demo. Open it for what the figure does, a player you
can hover or click, and the variations on that pattern.

The player is a small notebook harvested with the docs. One page covers
both backends. A note on the page says which one to load, and where the
two still differ.

```@raw html
<div class="masque-gallery">
<a class="masque-gallery-card" data-page="tooltips">
  <img alt="Four city markers with a template tooltip" src="assets/gallery/tooltips.png">
  <span>Tooltip templates</span>
</a>
<a class="masque-gallery-card" data-page="selection">
  <img alt="Two scatters; the right figure highlights the mark clicked on the left" src="assets/gallery/selection.png">
  <span>Selection round-trip</span>
</a>
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
<a class="masque-gallery-card" data-page="boxselect">
  <img alt="A two-group scatter with a selection box" src="assets/gallery/boxselect.png">
  <span>Box-select scatter</span>
</a>
<a class="masque-gallery-card" data-page="image">
  <img alt="An RGB image with a region box" src="assets/gallery/image.png">
  <span>Image ROI</span>
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
<a class="masque-gallery-card" data-page="polar">
  <img alt="Four points on a polar axis" src="assets/gallery/polar.png">
  <span>Polar points</span>
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
