# Shared figures for the agent kind-sweep notebooks (Cairo / WGL).
# Each widget is one interactable kind (interaction + visual). `selected=` is baked only
# on supported kinds (`circles`, `rects`, `polygons`, `segments`, `polyline`, `lines`, and the
# `select = :many` grid of `many_grid_seeded`). `circle` marks a
# kind whose highlight is a circle, so the driver checks r == geometry r (no halo offset).
# Grid / threshold / roi / view are hover-click or drag only. `scatter_dark` is a dark
# Makie figure so the split recipe (dodge fill both figures, flat chrome edge stroke on
# light/dark) is live-checked on dark axes too; `scatter` and `scatter_dark` are built from
# the scatter plot object (not raw points) so `colors` resolves and the tooltip-accent check has
# something to derive from.
#
# `selectedIndex`/`tip` are the BAKED-selected element (where `selected` isn't `nothing`) — used
# for the persisted-wash / selected-survives-unhover checks. `hoverIndex`/`hoverTip` are a
# DIFFERENT element for the standard hover-recipe check: hovering an already-selected line,
# grid cell or region draws no highlight (see the checklist's visual language), so a kind with a
# baked selection needs its own, distinct hover target to exercise the normal recipe at all. (A
# closed mark's pick is drawn by the fade and does take the hover recipe; its spec keeps the
# separate target anyway.) The one-element `lines` row is the exception:
# hover and the baked selection are the same mark, so that hover draws no highlight; the
# `series` row (three whole lines, hover a different one) is what exercises the `:lines`
# hover stroke. Where nothing is baked, `hoverIndex`/`hoverTip` just repeat
# `selectedIndex`/`tip`. `tintIndex` (only set where it must differ) is the element
# the screenshot-based tint-applied check hovers — for `heatmap` this steers off `selectedIndex`'s
# cell (viridis' darkest, where a dodge brightening is hardest to measure) onto a brighter one.
#
# `tintColor` (only set on `barplot`/`heatmap`/`poly` — every other `TINT_CHECK_KEYS` entry in
# kind_sweep.mjs resolves a mark colour from the manifest's own `colors` field instead) is a
# `"rgb(r,g,b)"` ground-truth BAKED from an actual CairoMakie raster: build the same figure,
# `masque()` it, read the tinted element's centre off the manifest geometry the same way
# kind_sweep.mjs's `hitPoint` does (barplot's `selectedIndex` 1 -> `rects` centre, every bar the
# same grey; heatmap's `tintIndex` 11 -> the `grid` cell midpoint from `xedges`/`yedges`; poly's
# `selectedIndex` 1 -> the 2nd ring's centroid, i.e. the GOLDENROD ring, not orchid), then
# `Makie.colorbuffer(fig; px_per_unit = manifest["scaling"])` and sample a 3×3 median at that
# point (`test/testutils.jl`'s `drawn_near` convention: `img[round(cy), round(cx)]`, already
# image-px/top-left-origin/y-down, no flip). Deriving this at NOTEBOOK LOAD isn't an option: the
# WGL notebook only has WGLMakie loaded, and `Makie.colorbuffer` under a live WGLMakie backend
# throws (`MethodError: wait_for_ready(::Nothing)`) outside a real browser session; loading
# CairoMakie just for this would also flip `_resolve_backend`'s "both loaded -> prefer Cairo"
# choice out from under the WGL sweep for every later `masque()` call. So these three are baked
# literals, derived once (barplot's flat grey, heatmap's brightest viridis cell, poly's alpha-blend
# over the axis background all come out right without reimplementing colormap/alpha math here) —
# regenerate them the same way if any of these three figures' construction changes.
#
# `slice_lines` and `slice_density` are hover samples, not hit targets. The driver projects a
# data point through the axis transform and checks the slice tooltip plus the crosshair.
#
# The `@bind` value is a NamedTuple with one field per layer that takes a value (#335). Each
# notebook prints two things per widget: `#out_<key>` is the one field the case is about (its
# `field`, else its `layerId`; `"*"` prints the whole value), so the drivers' single-event regexes
# still apply, and `#bond_<key>` is the whole value, which the multi-field checks read.

using Random

kind_sweep_meta() = [
    Dict(
        "key" => "scatter", "layerId" => "scatter", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "beta", "hoverIndex" => 0, "hoverTip" => "alpha", "mode" => "element",
        # The payload `(; label)` merges onto the point's own x and y (#308).
        "hoverFields" => ["labelalpha", "x1", "y1"],
    ),
    Dict(
        # A bound line picks a data point (#335): `selected = [1]` rings its first point, and the
        # click lands on its third.
        "key" => "lines", "layerId" => "lines", "layerKind" => "lines",
        "selected" => "point", "circle" => false, "selectedIndex" => 0, "selectedSample" => 0,
        "clickIndex" => 0, "clickSample" => 2,
        "tip" => "curve", "hoverIndex" => 0, "hoverTip" => "curve", "mode" => "element",
        # The hover readout at the third plotted point, (2.0, 0.4) (#262).
        "readout" => Dict("vertex" => 2, "text" => ["x2", "y0.4"]),
    ),
    Dict(
        # A click picks the third point of the second series (#335). A point on one of several
        # lines can't be given to `selected=`, so nothing starts picked.
        "key" => "series", "layerId" => "series", "layerKind" => "lines",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 1, "clickSample" => 2,
        "tip" => "series 1", "hoverIndex" => 1, "hoverTip" => "series 2", "mode" => "element",
        "readout" => Dict("vertex" => 2, "text" => ["x3", "y1.5"]),
    ),
    Dict(
        "key" => "segments", "layerId" => "segments", "layerKind" => "segments",
        "selected" => "ring", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "pair-a", "hoverIndex" => 1, "hoverTip" => "pair-b", "mode" => "element",
    ),
    Dict(
        "key" => "heatmap", "layerId" => "cells", "layerKind" => "grid",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "1,1", "hoverIndex" => 0, "hoverTip" => "1,1", "tintIndex" => 11,
        "tintColor" => "rgb(253,231,37)", "mode" => "element",
    ),
    Dict(
        "key" => "image", "layerId" => "cells", "layerKind" => "grid",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "1,1", "hoverIndex" => 0, "hoverTip" => "1,1", "mode" => "element",
    ),
    Dict(
        # A small colour image: cells are many screen pixels, so this is the `values` branch,
        # which ships no values for a non-real matrix (#189). Hover and click report i/j only.
        "key" => "image_rgb", "layerId" => "cells", "layerKind" => "grid",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "1,1", "hoverIndex" => 0, "hoverTip" => "1,1", "mode" => "element",
    ),
    Dict(
        # Per-cell payloads (#290): the template reads each cell's row and column labels, and
        # the click's `GridCellEvent` carries that cell's payload (`bindPayloadField`).
        "key" => "heatmap_labels", "layerId" => "cells", "layerKind" => "grid",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "(r1,c1)=4", "hoverIndex" => 5, "hoverTip" => "(r2,c2)=8", "mode" => "element",
        "bindPayloadField" => "row",
    ),
    Dict(
        "key" => "barplot", "layerId" => "bars", "layerKind" => "rects",
        "selected" => "wash", "circle" => false, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "value", "hoverIndex" => 0, "hoverTip" => "value",
        "tintColor" => "rgb(128,128,128)", "mode" => "element",
    ),
    Dict(
        "key" => "poly", "layerId" => "poly", "layerKind" => "polygons",
        "selected" => "wash", "circle" => false, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "ring2", "hoverIndex" => 0, "hoverTip" => "ring1",
        # selectedIndex 1 is the 2nd ring — goldenrod (0.55 alpha over the axis background), not
        # orchid (ring 0). The tint check hovers the pick, which keeps its own colour while
        # the unpicked ring fades (#394).
        "tintColor" => "rgb(235,206,132)", "mode" => "element",
    ),
    Dict(
        # `poly!` given shapes (`Vector{Rect2f}`) rather than point rings: one element per rect.
        "key" => "poly_shapes", "layerId" => "poly", "layerKind" => "polygons",
        "selected" => "wash", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "rect-a", "hoverIndex" => 1, "hoverTip" => "rect-b", "mode" => "element",
    ),
    Dict(
        # RegionInteractable of two shape kinds: each kind is a part of `:zone`, and the case
        # drives the rects part, `zone.rects`.
        "key" => "regions", "layerId" => "zone.rects", "layerKind" => "rects",
        "selected" => "wash", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "zone-a", "hoverIndex" => 1, "hoverTip" => "zone-b", "mode" => "element",
    ),
    Dict(
        "key" => "polar", "layerId" => "polar", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "north", "hoverIndex" => 0, "hoverTip" => "east", "mode" => "element",
    ),
    Dict(
        # AxisInteractable on the `polar` case's figure (#170): the pointer reads (θ, r). The
        # anchor is the `polar` widget's Julia-projected "north" marker at (π/2, 2).
        "key" => "axis_polar", "layerId" => "axis", "layerKind" => "axis",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "axis_polar",
        "anchorKey" => "polar", "anchorIndex" => 1, "theta" => π / 2, "r" => 2.0, "rmax" => 2.5,
    ),
    Dict(
        "key" => "scatter_dark", "layerId" => "scatter_dark", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "beta", "hoverIndex" => 0, "hoverTip" => "alpha", "mode" => "element",
    ),
    Dict(
        # Per-point markersize (graphplot's `node_size`): each mark keeps its own radius, so the
        # selected small mark's wash hugs it rather than the largest mark's size.
        "key" => "scatter_sizes", "layerId" => "scatter", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 0, "clickIndex" => 2,
        "tip" => "small", "hoverIndex" => 2, "hoverTip" => "large", "mode" => "element",
        "markersizes" => [10, 20, 34],
    ),
    Dict(
        "key" => "arrows3d", "layerId" => "arrows3d", "layerKind" => "segments",
        "selected" => "ring", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "index", "hoverIndex" => 1, "hoverTip" => "index", "mode" => "element",
    ),
    Dict(
        "key" => "arrows3d_shared", "layerId" => "arrows3d", "layerKind" => "segments",
        "selected" => "ring", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "index", "hoverIndex" => 1, "hoverTip" => "index", "mode" => "element",
    ),
    Dict(
        # `scatterlines!` on Axis3 (#273): the markers are the `scatterlines.points` layer, drawn
        # over the `scatterlines.line` layer, so a hover on a marker takes the marker.
        "key" => "scatterlines3d", "layerId" => "scatterlines.points", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "index", "hoverIndex" => 0, "hoverTip" => "index", "mode" => "element",
    ),
    Dict(
        # Plain `scatter!` on Axis3 (#301): the marks project through the 3D camera.
        "key" => "scatter3d", "layerId" => "scatter", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "index", "hoverIndex" => 0, "hoverTip" => "index", "mode" => "element",
    ),
    Dict(
        # `lines!` on Axis3: one element, so nothing is baked selected and hover takes it.
        "key" => "lines3d", "layerId" => "lines", "layerKind" => "lines",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "index", "hoverIndex" => 0, "hoverTip" => "index", "mode" => "element",
    ),
    Dict(
        # `meshscatter!` on Axis3: each sphere's hit circle comes from its data-space size.
        "key" => "meshscatter3d", "layerId" => "meshscatter", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "index", "hoverIndex" => 0, "hoverTip" => "index", "mode" => "element",
    ),
    Dict(
        # `wireframe!` on Axis3: each drawn edge is one segment element, an edge two quads
        # share shipped once (#316). Elements 0 and 3 are the first quad's two outer edges.
        "key" => "wireframe3d", "layerId" => "wireframe", "layerKind" => "segments",
        "selected" => "ring", "circle" => false, "selectedIndex" => 0, "clickIndex" => 3,
        "tip" => "index", "hoverIndex" => 3, "hoverTip" => "index", "mode" => "element",
    ),
    Dict(
        # Two plots overlapping on screen on Axis3: the scatter, drawn after the meshscatter,
        # answers where both claim the pixel ("topmost wins", #242). Its marker also sits in
        # front of the sphere, so the plot that answers is the one both backends show.
        # `overlapsLayer` names the plot underneath, which must sort after the answering layer
        # and claim the hovered pixel too.
        "key" => "overlap3d", "layerId" => "scatter", "layerKind" => "circles",
        "selected" => nothing, "circle" => true, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "front", "hoverIndex" => 0, "hoverTip" => "front", "mode" => "element",
        "overlapsLayer" => "meshscatter",
    ),
    Dict(
        # `surface!` on Axis3 (#259): the pointer lands in a quad and answers with its nearest
        # point, highlighted as the point's dual cell. Point k is (a, b) = (k % 5, k ÷ 5) of the
        # 5×5 grid; 12 is the centre (the peak), 13 is (4, 3) in Julia's 1-based indices, on the
        # side facing the camera. Points on the far rim are seen edge-on, so their quads are too
        # thin to click reliably from a synthetic event. The widget carries
        # a ViewInteractable too: `orbitSuspends` checks that an in-drag frame hides the selected
        # point's highlight and the release frame brings it back.
        "key" => "surface3d", "layerId" => "surface", "layerKind" => "surface",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 13,
        "tip" => "i4j3", "hoverIndex" => 12, "hoverTip" => "i3j3", "mode" => "element",
        "orbitSuspends" => true,
    ),
    Dict(
        # `text!` on Axis3 (#292): "front" sits between "back" and the camera, so their boxes
        # overlap, and front is listed first. WebGL depth-tests text, so front is on top and
        # answers; Cairo paints labels in list order, so back is on top and answers.
        # `byBackend` entries replace the spec's own on that backend.
        "key" => "text3d", "layerId" => "text", "layerKind" => "rects",
        "selected" => "wash", "circle" => false, "selectedIndex" => 2, "clickIndex" => 0,
        "tip" => "front", "hoverIndex" => 0, "hoverTip" => "front", "mode" => "element",
        "overlapsElement" => 1,
        "byBackend" => Dict(
            "cairo" => Dict("clickIndex" => 1, "tip" => "back", "hoverIndex" => 1, "hoverTip" => "back", "overlapsElement" => 0),
        ),
    ),
    Dict(
        # Two markers of one `scatter!` overlap on a 2D axis (#331): "over", listed second, is
        # painted over "under" on both backends and answers where both claim the pixel.
        "key" => "scatter_overlap", "layerId" => "scatter", "layerKind" => "circles",
        "selected" => nothing, "circle" => true, "selectedIndex" => 1, "clickIndex" => 1,
        "tip" => "over", "hoverIndex" => 1, "hoverTip" => "over", "mode" => "element",
        "overlapsElement" => 0, "topColour" => "blue",
    ),
    Dict(
        # Two `text!` labels overlap on a 2D axis (#340): "over", listed second, is painted over
        # "under" on both backends and answers.
        "key" => "text_overlap", "layerId" => "text", "layerKind" => "rects",
        "selected" => nothing, "circle" => false, "selectedIndex" => 1, "clickIndex" => 1,
        "tip" => "over", "hoverIndex" => 1, "hoverTip" => "over", "mode" => "element",
        "overlapsElement" => 0, "topColour" => "blue",
    ),
    Dict(
        # Two shapes of one `poly!` overlap on a 2D axis: "over", listed second, is painted
        # over "under" on both backends and answers.
        "key" => "poly_overlap", "layerId" => "poly", "layerKind" => "polygons",
        "selected" => nothing, "circle" => false, "selectedIndex" => 1, "clickIndex" => 1,
        "tip" => "over", "hoverIndex" => 1, "hoverTip" => "over", "mode" => "element",
        "overlapsElement" => 0, "topColour" => "blue",
    ),
    Dict(
        # Two spheres of one `meshscatter!` on one line of sight on Axis3 (#331): "front",
        # listed first, is drawn over "back" on both backends (CairoMakie paints spheres far to
        # near, WebGL depth-tests them) and answers.
        "key" => "spheres3d", "layerId" => "meshscatter", "layerKind" => "circles",
        "selected" => nothing, "circle" => true, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "front", "hoverIndex" => 0, "hoverTip" => "front", "mode" => "element",
        "overlapsElement" => 1, "topColour" => "blue",
    ),
    Dict(
        # `text!` (#301): each string is one element, hit on its drawn box.
        "key" => "text", "layerId" => "text", "layerKind" => "rects",
        "selected" => "wash", "circle" => false, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "beta", "hoverIndex" => 0, "hoverTip" => "alpha", "mode" => "element",
    ),
    Dict(
        # `datashader!`: a grid whose hover reads the aggregate count, not the colour-mapped
        # value. Cell (55, 23) holds the twenty stacked points; every other cell holds at most two.
        "key" => "datashader", "layerId" => "cells", "layerKind" => "grid",
        "selected" => nothing, "circle" => false, "selectedIndex" => 2430, "clickIndex" => 2430,
        "tip" => "(55,23) = 20", "hoverIndex" => 2430, "hoverTip" => "(55,23) = 20", "mode" => "element",
    ),
    Dict(
        # `violin!`: each violin is one polygon element.
        "key" => "violin", "layerId" => "violin", "layerKind" => "polygons",
        "selected" => "wash", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "x 1", "hoverIndex" => 1, "hoverTip" => "x 2", "mode" => "element",
    ),
    Dict(
        # `stairs!`: one stepped line is one element; hover reads out the nearest step (#262).
        # A default line, so it shows its tooltip and takes no click (#335): `hoverOnly` makes
        # the driver check that a click commits nothing in place of the click checks.
        "key" => "stairs", "layerId" => "stairs", "layerKind" => "lines",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "index", "hoverIndex" => 0, "hoverTip" => "index", "mode" => "element",
        "hoverOnly" => true,
    ),
    Dict(
        # `arrows2d!` (#274): each arrow is one segment from tail to tip.
        "key" => "arrows2d", "layerId" => "arrows2d", "layerKind" => "segments",
        "selected" => "ring", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "index", "hoverIndex" => 1, "hoverTip" => "index", "mode" => "element",
    ),
    Dict(
        # One band is one element, so nothing is baked selected and hover takes element 0.
        "key" => "band_y", "layerId" => "band", "layerKind" => "polygons",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "index", "hoverIndex" => 0, "hoverTip" => "index", "mode" => "element",
    ),
    Dict(
        # `hexbin!` (#258): each drawn hexagon is one element, hit on its six corners.
        "key" => "hexbin", "layerId" => "hexbin", "layerKind" => "polygons",
        "selected" => "wash", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "count", "hoverIndex" => 1, "hoverTip" => "count", "mode" => "element",
    ),
    Dict(
        # A scatter sized in data units (#291): each square marker is one polygon element
        # covering its heatmap cell, on top of the heatmap's `:cells`.
        "key" => "scatter_data", "layerId" => "scatter", "layerKind" => "polygons",
        "selected" => "wash", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "x", "hoverIndex" => 1, "hoverTip" => "x", "mode" => "element",
    ),
    Dict(
        # Bars with a thick outline ship a `tol` reach on their `:rects` layer, #246.
        "key" => "bar_stroke", "layerId" => "bars", "layerKind" => "rects",
        "selected" => "wash", "circle" => false, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "value", "hoverIndex" => 2, "hoverTip" => "value", "mode" => "element",
    ),
    Dict(
        "key" => "scatter_moved", "layerId" => "scatter", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "index", "hoverIndex" => 2, "hoverTip" => "index", "mode" => "element",
    ),
    Dict(
        # The tooltip shows the plotted date, not Makie's epoch milliseconds, #249.
        "key" => "scatter_dates", "layerId" => "scatter", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "2024-01-02", "hoverIndex" => 2, "hoverTip" => "2024-01-03", "mode" => "element",
    ),
    Dict(
        "key" => "hlines", "layerId" => "hlines", "layerKind" => "segments",
        "selected" => "ring", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "segment_index", "hoverIndex" => 1, "hoverTip" => "segment_index",
        "mode" => "element",
    ),
    Dict(
        "key" => "threshold", "layerId" => "threshold", "layerKind" => "threshold",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "drag",
        # The line's field starts at its value, and the scatter beside it has its own field, so a
        # click on a point sets that field and leaves the line's (#335). `initial` is a regex on
        # the whole value (`#bond_<key>`).
        "owner" => Dict(
            "layer" => "scatter", "otherClicks" => true,
            "initial" => "threshold = ThresholdEvent\\(:threshold, value = 4\\.0",
        ),
    ),
    Dict(
        # A colorbar the caller passed is a field of its own, `nothing` until clicked, next to the
        # heatmap's, which a click on a cell sets (#335).
        "key" => "colorbar_owner", "layerId" => "colorbar", "layerKind" => "axis",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "owner",
        "owner" => Dict("layer" => "cells", "otherClicks" => true, "initial" => "colorbar = nothing"),
    ),
    Dict(
        # A box without `selects` is a field that starts at its `bounds`, next to the scatter's
        # (#335). The scatter's first point sits outside the box, so the click on it never
        # presses on the box.
        "key" => "roi_bounds", "layerId" => "roi", "layerKind" => "roi",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "owner",
        "owner" => Dict(
            "layer" => "scatter", "otherClicks" => true,
            "initial" => "roi = BoundsEvent\\(:roi, xmin = 3\\.0, xmax = 6\\.0, ymin = 3\\.0, ymax = 6\\.0\\)",
        ),
    ),
    Dict(
        # A threshold on a categorical y axis. Release commits the nearest category's position
        # and label (#192), and the line snaps onto that category (#199).
        "key" => "threshold_cat", "layerId" => "threshold", "layerKind" => "threshold",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "drag",
        "categorical" => true, "startCategory" => "b",
    ),
    Dict(
        # An axis click on a categorical y axis: the category's position plus its label (#192).
        "key" => "axis_cat", "layerId" => "axis", "layerKind" => "axis",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "axis_cat",
        "category" => "b", "position" => 2,
    ),
    Dict(
        # A selecting box adds two fields: its bounds, and its target's, which starts at the
        # points inside the bounds, (3, 3) and (5, 5), highlighted (#330, #335). The target takes
        # no click. The first point sits outside, so the no-click check never presses on the box.
        # Each driver opens a fresh session, so the value is the start's.
        "key" => "roi", "layerId" => "roi", "layerKind" => "roi",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "drag",
        "owner" => Dict(
            "layer" => "pts", "startsSelected" => true,
            "initial" => "pts = (Masque\\.)?ElementEvent\\[ElementEvent\\(:pts, 2, [^\\]]*, ElementEvent\\(:pts, 3, [^\\]]*\\], roi = BoundsEvent\\(:roi, xmin = 2\\.0",
        ),
    ),
    Dict(
        # A box over a heatmap starts at the cell block inside its bounds, drawn as one fill-only
        # block (#330). Cell 0 sits outside the box, so the no-click check never presses on it.
        # The bounds sit exactly on cell edges, which must not pull in the neighbours (#337).
        "key" => "roi_grid", "layerId" => "roi", "layerKind" => "roi",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "owner",
        "owner" => Dict(
            "layer" => "cells", "startsSelected" => true,
            "initial" => "cells = (Masque\\.)?GridWindowEvent\\(:cells, i1 = 3, i2 = 4, j1 = 2, j2 = 3, xmin = 2\\.5, xmax = 4\\.5, ymin = 1\\.5, ymax = 3\\.5\\)",
        ),
    ),
    Dict(
        "key" => "view", "layerId" => "view", "layerKind" => "view",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "drag",
    ),
    Dict(
        # Two axes tied by `linkaxes!`, a view on the left one (#363): the pan moves both, and
        # the preview slides the right axis's data in a window of its own, with the ring of the
        # pick on it (#368). Hover follows each axis mid-preview, the unlinked third one too (#379).
        "key" => "view_linked", "layerId" => "view", "layerKind" => "view",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "drag",
        # The linked axis's pick, hovered mid-preview, shows its own tooltip (#379).
        "previewPickTip" => "index5x3y4",
    ),
    Dict(
        # A view on an axis that shares its cell with an unlinked twin and an inset (#391).
        # Their pixels are inside the pan's sliding copy, so mid-preview their picks' rings,
        # the twin's threshold line, hover and hit-testing move with the pan axis's photograph.
        "key" => "view_twin", "layerId" => "view", "layerKind" => "view",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "drag",
        # Layers whose axis moves with the pan axis mid-preview.
        "previewWithPan" => ["twin", "twinline", "inset"],
    ),
    Dict(
        # A twin tied by `linkxaxes!` in the same cell as the pan axis (#391). Both axes' marks
        # are in one picture, so the preview moves them the pan axis's way: the pan window goes
        # over the twin's own, and the twin's pick moves and hovers with the pan matrix.
        "key" => "view_twin_linked", "layerId" => "view", "layerKind" => "view",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "drag",
        "previewWithPan" => ["pts", "twin"],
    ),
    Dict(
        # Axis3 view (#321): drag orbits, the wheel zooms the limits about their center, and
        # Shift+drag pans them. After the zoom the corner points sit outside the limits and stop
        # hitting; the middle one still hits, and so does the part of a line that crosses them.
        "key" => "view3d", "layerId" => "view", "layerKind" => "view",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "drag",
        "inside" => 2, "outside" => 0,
    ),
    Dict(
        # Two Axis3 panels linked by `linkcameras!(...; limits = true)` (#362), a view on each.
        # Orbiting the left one must turn the right panel's picture and move its hit areas, and
        # wheel zooms that alternate between the panels must each start from the shared limits.
        "key" => "view3d_linked", "layerId" => "view", "layerKind" => "view",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "drag",
    ),
    Dict(
        "key" => "legend", "layerId" => "legend", "layerKind" => "rects",
        "selected" => nothing, "halo" => false, "selectedIndex" => 2, "clickIndex" => 2,
        "tip" => "pts", "mode" => "element",
        # Nothing is baked (`selected = nothing`, like heatmap/grid), so per the module
        # doc-comment convention `hoverIndex`/`hoverTip` repeat `selectedIndex`/`tip` — this
        # drives the GENERIC hover-recipe check on the legend row itself (default hoverstyle,
        # no explicit stroke override on `LegendInteractable` -> the normal split dodge-fill/
        # grey-edge recipe applies, same as any other `rects` layer).
        # No default card (`tooltip: false` on the layer). `tip` is still the click payload's
        # label. The generic hover check asserts the card stays hidden.
        "hoverIndex" => 2, "hoverTip" => "",
        # A legend entry's linked highlight isn't wash/ring on the legend layer itself (that
        # meta stays `selected = nothing`, like heatmap/grid) — it's g.link on OTHER layers.
        # "cases" checks two fan-out kinds: a polyline entry (ring) and a circles entry (wash).
        # `quad` and `lin` cross at x = 2, and `lin` is drawn after `quad`: hovering `quad`
        # puts `lin`'s cover back over it there, so `lin` stays faded at the crossing (#462).
        # `coveredOver` is the least count of faded marks put back (`pts`, drawn after `quad`
        # inside its box, may count too).
        "links" => Dict(
            "cases" => [
                Dict("index" => 0, "label" => "quad", "coveredOver" => 1),
                Dict("index" => 2, "label" => "pts"),
            ],
        ),
    ),
    Dict(
        "key" => "series_legend", "layerId" => "legend", "layerKind" => "rects",
        "selected" => nothing, "halo" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "series 1", "mode" => "element",
        # No default card. `tip` stays the click-payload label.
        "hoverIndex" => 0, "hoverTip" => "",
        # Auto-extracted `series!` entries pin `series:k`, not the whole `:series` layer —
        # hovering one swatch must light one path, not every trace.
        "links" => Dict(
            "cases" => [
                Dict("index" => 0, "label" => "series 1"),
                Dict("index" => 1, "label" => "series 2"),
            ],
        ),
    ),
    Dict(
        "key" => "legend_overlap", "layerId" => "legend", "layerKind" => "rects",
        "selected" => nothing, "halo" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "trend", "mode" => "element",
        "hoverIndex" => 0, "hoverTip" => "",
        "links" => Dict(
            "cases" => [
                Dict("index" => 0, "label" => "trend"),
            ],
        ),
        # This legend sits ON TOP of a heatmap that fills the whole axis (build_manifest must
        # sort `LegendInteractable` layers before everything but :view — see src/render.jl,
        # ~line 259). "overlapsGrid" names the grid layer id the legend row's hit-test pixel
        # must ALSO fall inside, so kind_sweep.mjs can assert both (a) manifest order puts
        # `legend` before this grid layer and (b) the hit-test pixel is genuinely contested.
        "overlapsGrid" => "cells",
    ),
    Dict(
        "key" => "legend_template", "layerId" => "legend", "layerKind" => "rects",
        "selected" => nothing, "halo" => false, "selectedIndex" => 2, "clickIndex" => 2,
        "tip" => "pts", "mode" => "element",
        # Caller-supplied template. The card must show "series <label>", which also contains
        # the bare label the links-loop checks for.
        "hoverIndex" => 2, "hoverTip" => "series pts",
        "links" => Dict(
            "cases" => [
                Dict("index" => 0, "label" => "quad"),
                Dict("index" => 2, "label" => "pts"),
            ],
        ),
    ),
    Dict(
        "key" => "axis", "layerId" => "axis", "layerKind" => "axis",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "axis",
        # `AxisInteractable` is the one clickable kind whose click is NOT a selection gesture
        # (#113) — `pinLayerId` names a REAL, pre-existing selection on a different layer of
        # this SAME widget that an axis (or colorbar) click must leave untouched (the #107
        # round-1 regression). `colorbarLayerId` names the sibling `ColorbarInteractable`
        # layer sharing this bond: same `:axis` kind, but a bounded pixel bbox
        # (geometry.ts's bounded branch) instead of the axis layer's whole-image catch-all
        # (geometry.ts's unbounded branch) — a different hit-test code path, exercised in the
        # same widget so one fixture covers both.
        "pinLayerId" => "pts", "colorbarLayerId" => "colorbar",
        # Three fields (`pts`, `colorbar`, `axis`): `#out_axis` prints them all, so the axis and
        # colorbar clicks and the `pts` pick they must leave alone read from one line.
        "field" => "*",
    ),
    Dict(
        # Several fields at once (#335): a scatter, a vertical threshold `:cutoff`, and a default
        # `lines!`. A click on a point sets `scatter` and leaves `cutoff`; a drag of the line
        # sets `cutoff` and leaves `scatter`; the line shows its tooltip, has no field, and a
        # click on it commits nothing. `#out_composite` prints the whole value.
        "key" => "composite", "layerId" => "scatter", "layerKind" => "circles",
        "selected" => nothing, "circle" => true, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "composite", "field" => "*",
        "control" => "cutoff", "controlStart" => 3.0, "line" => "lines", "fields" => ["cutoff", "scatter"],
    ),
    Dict(
        # `onchange` (#334): the red level line sits at the threshold's value plus the number of
        # picked points, redrawn on every click and threshold drag without re-running the cell.
        # `bind = :pts`, so the drag moves the line but leaves the `@bind` value alone. The
        # driver's "onchange" block drives it and finds the line in the picture's pixels.
        "key" => "onchange", "layerId" => "pts", "layerKind" => "circles",
        "selected" => nothing, "circle" => true, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "onchange", "field" => "*",
        "control" => "cutoff", "controlStart" => 3.0,
    ),
    Dict(
        # Makie blocks as controls (#345): a Slider, Toggle, IntervalSlider, Checkbox and Menu,
        # drawn as HTML over empty boxes. The slider sets the red line's level and the toggle
        # shows it, through `onchange`. The driver's "controls" block drives each one.
        "key" => "controls", "layerId" => "level", "layerKind" => "control",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "controls", "field" => "*",
        "controlStart" => 3,
    ),
    Dict(
        # `select = :many` (#335, #358): a click adds or removes a pick, with or without Ctrl,
        # a click on empty space keeps the picks (#384), and Escape clears them. The driver's
        # "many" block drives it.
        "key" => "many", "layerId" => "scatter", "layerKind" => "circles",
        "selected" => nothing, "circle" => true, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "many",
    ),
    Dict(
        # Marquee and legend picks under `select = :many` (#335). Left axis: no view, so a
        # plain drag draws the box and adds, and one starting on a picked mark takes out.
        # Its legend entry picks every mark of `a`. Right axis: a pan view, so Alt-drag draws
        # the box and a plain drag pans. The driver's "marquee" block drives it.
        "key" => "marquee", "layerId" => "a", "layerKind" => "circles",
        "selected" => nothing, "circle" => true, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "marquee", "field" => "*",
    ),
    Dict(
        # A grid with `select = :many` (#335, #358): a click flips one cell, with or without Ctrl,
        # the cells draw as one outlined area, a click off the grid keeps it (#384), and Escape
        # clears it.
        # The driver's "many_grid" block drives it.
        "key" => "many_grid", "layerId" => "region", "layerKind" => "grid",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "many_grid",
    ),
    Dict(
        # The same grid started with `selected=` (#356): it mounts with cells (2, 2) and
        # (3, 2) drawn and in the value, and a click takes one out like any other cell.
        # The driver's "many_grid_seeded" block drives it.
        "key" => "many_grid_seeded", "layerId" => "region", "layerKind" => "grid",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "many_grid_seeded",
    ),
    Dict(
        # The same grid cut into regions (#359): hover outlines a whole region and names it, a
        # click picks or drops a whole region, a cell in no region acts alone, and
        # a box takes every region it touches. The driver's "many_grid_regions" block drives it.
        "key" => "many_grid_regions", "layerId" => "region", "layerKind" => "grid",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "many_grid_regions",
    ),
    Dict(
        # Linked selections by position (#346): two panels draw the same three rows, row k at
        # mark k, with a label per row in the left panel. A click in either panel picks the
        # row everywhere, hover outlines its partners, a box in one panel picks the rows of
        # the marks inside, an empty click keeps, Escape clears, and undo puts the rows back.
        # The driver's "linked_pos" block drives it.
        "key" => "linked_pos", "layerId" => "u", "layerKind" => "circles",
        "selected" => nothing, "circle" => true, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "linked_pos", "field" => "cells",
    ),
    Dict(
        # Linked selections by key (#346): one scatter per cluster on the left, with a legend,
        # and one scatter of every cell on the right, in another order. The value is cell ids.
        # A legend entry picks its cluster's cells in both panels, with only `cells` bound, and a
        # pick in A fades B too. The driver's "linked_keys" block drives it.
        "key" => "linked_keys", "layerId" => "every", "layerKind" => "circles",
        "selected" => nothing, "circle" => true, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "linked_keys", "field" => "cells",
    ),
    Dict(
        # A `select = :one` group (#346): a click picks one row in both panels, a click on its
        # partner lets it go, and an empty click clears. The driver's "linked_one" block drives it.
        "key" => "linked_one", "layerId" => "u", "layerKind" => "circles",
        "selected" => nothing, "circle" => true, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "linked_one", "field" => "cell",
    ),
    Dict(
        "key" => "slice_lines", "layerId" => "slice", "layerKind" => "slice",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "slice",
        # y = 2 sits between the two lines. At x = 1 the narrow line is higher; at x = 3 the
        # wide line is. Tooltip values are toPrecision(4).
        "probes" => [
            Dict("x" => 1.0, "y" => 2.0, "contains" => ["wide 1.000", "narrow 3.000"]),
            Dict("x" => 3.0, "y" => 2.0, "contains" => ["wide 3.000", "narrow 1.000"]),
        ],
    ),
    Dict(
        "key" => "slice_density", "layerId" => "slice", "layerKind" => "slice",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "slice",
        # Both KDEs have support at x = 1. Don't pin the KDE height — only that both labels show.
        "probes" => [Dict("x" => 1.0, "contains" => ["wide", "narrow"])],
    ),
    Dict(
        # #271: a slice from plots with `auto = false` and no `covers`, as on the Slice across
        # series page. Its default covers name lines not in the call and are dropped.
        "key" => "slice_auto", "layerId" => "slice", "layerKind" => "slice",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "slice",
        "probes" => [Dict("x" => 1.0, "y" => 2.0, "contains" => ["wide 1.000", "narrow 3.000"])],
    ),
    Dict(
        # #319: a missing y value (NaN in one coordinate) is a gap in the slice, as in the
        # drawn line. x = 2 falls in the gap, so only the unbroken line reads out.
        "key" => "slice_gap", "layerId" => "slice", "layerKind" => "slice",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "slice",
        "probes" => [
            Dict("x" => 1.0, "y" => 2.0, "contains" => ["gappy 1.000", "whole 3.000"]),
            Dict("x" => 2.0, "y" => 2.0, "contains" => ["whole 2.000"], "excludes" => ["gappy"]),
        ],
    ),
]

function build_kind_sweep()
    scatter = let
        pts = [(1.0, 1.0), (2.0, 2.0), (3.0, 1.2)]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "scatter")
        # Built from the plot object (not raw pts) so PointInteractable resolves `colors` from
        # `color=` — the mark-colour-derivation check needs a resolvable mark colour.
        sc = scatter!(ax, first.(pts), last.(pts); color = :gray, markersize = 22)
        # `interactables(sc; …)` replaces the scatter's default layer and keeps its id.
        masque(
            fig,
            interactables(sc; payloads = [(; label = "alpha"), (; label = "beta"), (; label = "gamma")]);
            selected = Dict(:scatter => [2]),
        )
    end

    lines = let
        verts = [(0.0, 0.0), (1.0, 1.5), (2.0, 0.4), (3.0, 1.8)]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "lines")
        p = lines!(ax, first.(verts), last.(verts); color = :gray, linewidth = 4)
        masque(
            fig,
            SegmentInteractable(ax, p; id = :lines, payloads = [(; label = "curve")]);
            selected = Dict(:lines => [1]),
            auto = false,
        )
    end

    series = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "series")
        # Three rows, four samples each: one element per series, not per chord.
        ys = [1.0 1.6 2.1 1.4; 2.8 2.2 1.5 0.9; 0.5 1.2 1.9 2.6]
        sp = series!(ax, ys; linewidth = 4)
        # A default line takes no clicks (#335); `bind` names it, so it takes them again.
        masque(fig; bind = (sp,))
    end

    segments = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "linesegments", limits = (0, 5, 0, 4))
        linesegments!(ax, [1.0, 2.0, 3.0, 4.0], [1.0, 3.0, 2.0, 0.6]; color = :gray, linewidth = 4)
        masque(
            fig,
            SegmentInteractable(
                ax, [(1.0, 1.0), (2.0, 3.0), (3.0, 2.0), (4.0, 0.6)];
                id = :segments, mode = :pairs,
                payloads = [(; label = "pair-a"), (; label = "pair-b")],
            );
            selected = Dict(:segments => [1]),
            auto = false,
        )
    end

    heatmap = let
        z = [Float64(i + 3j) for i in 1:4, j in 1:3]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "heatmap")
        heatmap!(ax, 1:4, 1:3, z)
        masque(fig)
    end

    image = let
        z = [Float64(i + j) for i in 1:4, j in 1:3]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "image")
        image!(ax, (0.5, 4.5), (0.5, 3.5), z)
        masque(fig)
    end

    image_rgb = let
        z = [RGBf(i / 4, j / 3, 0.5) for i in 1:4, j in 1:3]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "image_rgb")
        image!(ax, (0.5, 4.5), (0.5, 3.5), z)
        masque(fig)
    end

    heatmap_labels = let
        z = [Float64(i + 3j) for i in 1:4, j in 1:3]
        rows = ["r$i" for i in 1:4]; cols = ["c$j" for j in 1:3]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "heatmap_labels")
        hm = heatmap!(ax, 1:4, 1:3, z)
        masque(
            fig, interactables(
                hm; payloads = (i, j) -> (; row = rows[i], col = cols[j]),
                tooltip = masque"($(row), $(col)) = $(value)",
            ),
        )
    end

    barplot = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "barplot")
        barplot!(ax, 1:3, [2.0, 3.5, 1.5]; color = :gray)
        masque(fig; selected = Dict(:bars => [2]))
    end

    poly = let
        rings = [
            [(0.5, 0.5), (2.0, 0.7), (1.5, 2.0), (0.6, 1.8)],
            [(2.8, 0.8), (4.2, 1.0), (4.0, 2.4), (2.9, 2.2)],
        ]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "poly", limits = (0, 4.8, 0, 3.0))
        poly!(ax, Point2f.(rings[1]); color = (:orchid, 0.55), strokewidth = 2)
        poly!(ax, Point2f.(rings[2]); color = (:goldenrod, 0.55), strokewidth = 2)
        masque(
            fig,
            PolygonInteractable(
                ax, rings; id = :poly,
                payloads = [(; shape = "ring1"), (; shape = "ring2")],
            );
            selected = Dict(:poly => [2]),
            auto = false,
        )
    end

    poly_shapes = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "poly shapes", limits = (0, 5, 0, 3))
        p = poly!(ax, [Rect2f(0.5, 0.6, 1.6, 1.8), Rect2f(2.8, 0.6, 1.6, 1.8)]; color = (:steelblue, 0.55), strokewidth = 2)
        masque(
            fig,
            interactables(p; payloads = [(; label = "rect-a"), (; label = "rect-b")]);
            selected = Dict(:poly => [1]),
        )
    end

    regions = let
        zones = [(:rect, (1.5, 1.5), 1.6, 1.2), (:rect, (3.5, 1.5), 1.6, 1.2)]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "regions", limits = (0, 5, 0, 3))
        for (_, (xc, yc), w, h) in zones
            poly!(ax, Rect2f(xc - w / 2, yc - h / 2, w, h); color = (:steelblue, 0.35), strokewidth = 2)
        end
        scatter!(ax, [2.5], [2.6]; markersize = 14, color = :gray)
        masque(
            fig,
            RegionInteractable(
                ax, [zones; (:circle, (2.5, 2.6), 7)]; id = :zone,
                payloads = [(; label = "zone-a"), (; label = "zone-b"), (; label = "dot")],
            );
            selected = (zone = (rects = [1],),),
            auto = false,
        )
    end

    polar = let
        pts = Point2f[(0.0, 1.0), (π / 2, 2.0), (π, 1.5), (3π / 2, 2.5)]
        fig = Figure(size = (480, 320))
        ax = PolarAxis(fig[1, 1])
        scatter!(ax, pts; color = :gray, markersize = 22)
        masque(
            fig,
            PointInteractable(
                ax, pts; id = :polar,
                payloads = [(; label = "east"), (; label = "north"), (; label = "west"), (; label = "south")],
            );
            selected = Dict(:polar => [2]),
            auto = false,
        )
    end

    axis_polar = let
        pts = Point2f[(0.0, 1.0), (π / 2, 2.0), (π, 1.5), (3π / 2, 2.5)]
        fig = Figure(size = (480, 320))
        ax = PolarAxis(fig[1, 1])
        scatter!(ax, pts; color = :gray, markersize = 22)
        masque(fig, AxisInteractable(ax; id = :axis); auto = false)
    end

    scatter_dark = let
        pts = [(1.0, 1.0), (2.0, 2.0), (3.0, 1.2)]
        fig = Figure(size = (480, 260); backgroundcolor = :gray12)
        ax = Axis(
            fig[1, 1];
            title = "scatter-dark",
            backgroundcolor = :gray20,
            xtickcolor = :gray80,
            ytickcolor = :gray80,
            titlecolor = :gray90,
        )
        sc = scatter!(ax, first.(pts), last.(pts); color = :gray, markersize = 22)
        masque(
            fig,
            PointInteractable(
                ax, sc; id = :scatter_dark,
                payloads = [(; label = "alpha"), (; label = "beta"), (; label = "gamma")],
            );
            selected = Dict(:scatter_dark => [2]),
            auto = false,
        )
    end

    # overlaystyle (#181): the selected and hovered outlines take the given colour and widths.
    # tooltipstyle (#305): the tooltip card takes the given background, text colour and radius,
    # with no caret.
    # Not in kind_sweep_meta(), whose generic checks assert the default recipe; polish_verify.mjs
    # checks this one.
    scatter_styled = let
        pts = [(1.0, 1.0), (2.0, 2.0), (3.0, 1.2)]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "scatter-styled")
        sc = scatter!(ax, first.(pts), last.(pts); color = :gray, markersize = 22)
        masque(
            fig,
            PointInteractable(
                ax, sc; id = :scatter_styled,
                payloads = [(; label = "alpha"), (; label = "beta"), (; label = "gamma")],
            );
            selected = Dict(:scatter_styled => [2]),
            auto = false,
            overlaystyle = (; color = "rgb(0, 102, 204)", hover_width = 3, selected_width = 4),
            tooltipstyle = (; bg = "rgb(20, 30, 60)", color = "rgb(240, 240, 200)", radius = 9, caret = false),
        )
    end

    # The fade on a dark plot area through a pan (#394): a gray20 axis on a gray12 figure, a
    # narrow axis with marks past its limits on the right, and one pick. The unpicked marks fade
    # toward gray20 before and after a pan, and nothing is drawn outside the axis. Not in
    # kind_sweep_meta(); polish_verify.mjs checks it.
    fade_pan = let
        xs = [1.0, 2.0, 3.0, 4.0, 6.0, 7.0]
        ys = [1.0, 3.0, 2.0, 4.0, 2.5, 2.5]
        fig = Figure(size = (480, 260); backgroundcolor = :gray12)
        ax = Axis(
            fig[1, 1];
            title = "fade-pan", width = 220, limits = (0, 5, 0, 5), backgroundcolor = :gray20,
            titlecolor = :gray90, xticklabelcolor = :gray80, yticklabelcolor = :gray80,
        )
        sc = scatter!(ax, xs, ys; color = :gray, markersize = 22)
        masque(
            fig,
            PointInteractable(ax, sc; id = :fade_pan, payloads = [(; label = "p$i") for i in eachindex(xs)]),
            ViewInteractable(ax; id = :view);
            selected = Dict(:fade_pan => [1]),
            auto = false,
        )
    end

    # A legend over marks (#437): two `hid` points sit under the top-right legend, which Makie
    # draws over them, so the overlay must not draw their fade or hover ring over the legend.
    # The legend is not one of the interactables, so a hover inside its box reaches the points.
    # Not in kind_sweep_meta(); polish_verify.mjs checks it.
    legend_hidden = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "legend-hidden", limits = (0, 10, 0, 10))
        hid = scatter!(ax, [1.0, 2.5, 8.6, 9.2, 8.6], [2.0, 6.0, 9.0, 8.4, 6.8]; color = :orange, markersize = 18, label = "hid")
        seen = scatter!(ax, [4.0, 6.0], [3.0, 5.0]; color = :steelblue, markersize = 18, label = "seen")
        axislegend(ax; position = :rt)
        masque(
            fig,
            interactables(hid; id = :hid, tooltip = false),
            interactables(seen; id = :seen, tooltip = false);
            auto = false,
        )
    end

    # A plot drawn with `visible = false` (#484): picking a legend entry fades the shown lines and
    # leaves the hidden line's path alone, so the gridlines under it stay whole. The legend
    # sits beside the axis, off every line. Not in kind_sweep_meta(); polish_verify.mjs checks it.
    hidden_plot = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "hidden-plot", limits = (0, 10, 0, 10))
        lines!(ax, [0.5, 9.5], [2.0, 2.0]; label = "a", linewidth = 4)
        lines!(ax, [0.5, 9.5], [5.0, 5.0]; label = "b", linewidth = 4, visible = false)
        lines!(ax, [0.5, 9.5], [8.0, 8.0]; label = "c", linewidth = 4)
        Legend(fig[1, 2], ax)
        masque(fig; bind = :legend)
    end

    # A plot added after the figure was shown once (#508): on WebGL, `lines!` used to throw
    # because the first `masque` left its serialization screen on the axis scene. Shown again,
    # the widget holds both plots. Not in kind_sweep_meta(); polish_verify.mjs checks it.
    added_plot = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "added-plot", limits = (0, 10, 0, 10))
        scatter!(ax, [2.0, 8.0], [8.0, 8.0]; markersize = 16)
        masque(fig)
        lines!(ax, [0.5, 9.5], [3.0, 3.0]; linewidth = 6)
        masque(fig)
    end

    scatter_sizes = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "scatter-sizes")
        sc = scatter!(ax, [1.0, 2.0, 3.0], [1.0, 2.0, 1.2]; color = :gray, markersize = [10, 20, 34])
        masque(
            fig,
            interactables(sc; payloads = [(; label = "small"), (; label = "medium"), (; label = "large")]);
            selected = Dict(:scatter => [1]),
        )
    end

    arrows3d = let
        fig = Figure(size = (480, 320))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "arrows3d")
        apts = Makie.Point3f[(1, 1, 1), (3, 2, 1), (2, 4, 3)]
        adirs = Makie.Vec3f[(1, 0, 0), (0, 1, 0.5), (-0.5, 0, 1)]
        arrows3d!(ax, apts, adirs; color = :gray)
        masque(fig; selected = Dict(:arrows3d => [1]))
    end

    # One direction shared by every arrow (Makie broadcasts it), #248.
    arrows3d_shared = let
        fig = Figure(size = (480, 320))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "arrows3d-shared")
        apts = Makie.Point3f[(1, 1, 1), (3, 2, 1), (2, 4, 3)]
        arrows3d!(ax, apts, Makie.Vec3f(1, 0, 1); color = :gray)
        masque(fig; selected = Dict(:arrows3d => [1]))
    end

    scatterlines3d = let
        fig = Figure(size = (480, 320))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "scatterlines3d")
        spts = Makie.Point3f[(1, 1, 1), (3, 2, 1), (2, 4, 3)]
        scatterlines!(ax, spts; color = :gray, markersize = 14)
        masque(fig; selected = (scatterlines = (points = [2],),))
    end

    scatter3d = let
        fig = Figure(size = (480, 320))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "scatter3d")
        scatter!(ax, Makie.Point3f[(1, 1, 1), (3, 2, 1), (2, 4, 3)]; color = :gray, markersize = 20)
        masque(fig; selected = Dict(:scatter => [2]))
    end

    lines3d = let
        fig = Figure(size = (480, 320))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "lines3d")
        ln = lines!(ax, Makie.Point3f[(1, 1, 1), (3, 2, 1), (2, 4, 3), (4, 4, 2)]; color = :gray, linewidth = 4)
        # Bound, so the Axis3 line takes clicks; a default line is hover-only (#335).
        masque(fig; bind = (ln,))
    end

    meshscatter3d = let
        fig = Figure(size = (480, 320))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "meshscatter3d")
        meshscatter!(ax, Makie.Point3f[(1, 1, 1), (3, 2, 1), (2, 4, 3)]; color = :gray, markersize = 0.3)
        masque(fig; selected = Dict(:meshscatter => [2]))
    end

    # A coarse pyramid's edges, so each edge is long enough to hover on its own. A plane would
    # be seen almost edge-on from this camera and squash the edges together.
    wireframe3d = let
        fig = Figure(size = (480, 320))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "wireframe3d")
        xs = [0.0, 2.0, 4.0]
        ys = [0.0, 2.0, 4.0]
        wireframe!(ax, xs, ys, [1.0 2.0 1.0; 2.0 4.0 2.0; 1.0 2.0 1.0]; color = :gray, linewidth = 3)
        masque(fig; selected = Dict(:wireframe => [1]))
    end

    # A coarse dome, so each point's cell is large enough to hover on its own (#259). The `wireframe!` over the same grid is decoration: it must not
    # take the hover from the surface.
    surface3d = let
        fig = Figure(size = (480, 320))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "surface3d")
        xs = [0.0, 1.0, 2.0, 3.0, 4.0]
        zs = [4.0 - ((x - 2)^2 + (y - 2)^2) / 2 for x in xs, y in xs]
        surface!(ax, xs, xs, zs; colormap = [:steelblue, :lightblue], shading = NoShading)
        wireframe!(ax, xs, xs, zs; color = :black, linewidth = 0.5)
        masque(fig, ViewInteractable(ax))
    end

    # A small scatter marker in front of a large sphere, drawn after it (#242, #301).
    overlap3d = let
        fig = Figure(size = (480, 320))
        ax = Axis3(
            fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "overlap3d",
            limits = (0, 4, 0, 4, 0, 4),
        )
        ms = meshscatter!(ax, Makie.Point3f[(2, 2, 2)]; color = :lightgray, markersize = 0.8)
        # The marker sits between the sphere's centre and the camera, so it draws in front of
        # the sphere on WebGL too, where the depth test decides what shows.
        el, az = 0.5, 0.4
        toward = Makie.Vec3f(cos(el) * cos(az), cos(el) * sin(az), sin(el))
        sc = scatter!(ax, [Makie.Point3f(2, 2, 2) + 1.2f0 * toward]; color = :black, markersize = 16)
        masque(
            fig,
            interactables(ms; payloads = [(; label = "back")]),
            interactables(sc; payloads = [(; label = "front")]),
        )
    end

    # Two labels on one line of sight, the front one listed first, and one on its own (#292).
    text3d = let
        fig = Figure(size = (480, 320))
        ax = Axis3(
            fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "text3d",
            limits = (0, 4, 0, 4, 0, 4),
        )
        el, az = 0.5, 0.4
        toward = Makie.Vec3f(cos(el) * cos(az), cos(el) * sin(az), sin(el))
        back = Makie.Point3f(2, 2, 2)
        text!(
            ax, [back + 1.2f0 * toward, back, Makie.Point3f(0.5, 3.5, 0.5)];
            text = ["front", "back", "solo"], fontsize = 22, align = (:center, :center),
        )
        masque(fig; selected = Dict(:text => [3]))
    end

    text = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "text", limits = (0, 4, 0, 3))
        text!(ax, [1.0, 2.0, 3.0], [1.0, 2.0, 1.0]; text = ["alpha", "beta", "gamma"], fontsize = 22, align = (:center, :center))
        masque(fig; selected = Dict(:text => [2]))
    end

    # Overlapping marks within one plot (#331, #340): the blue one is drawn on top.
    scatter_overlap = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "scatter overlap", limits = (0, 4, 0, 3))
        sc = scatter!(ax, [1.9, 2.0], [1.5, 1.5]; color = [:red, :blue], markersize = 40)
        masque(fig, interactables(sc; payloads = [(; label = "under"), (; label = "over")]))
    end

    text_overlap = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "text overlap", limits = (0, 4, 0, 3))
        # Same glyphs in both, so where the boxes overlap the top label's ink covers the other's.
        tx = text!(
            ax, [Point2f(1.85, 1.5), Point2f(2.0, 1.5)]; text = ["MMMM", "MMMM"], color = [:red, :blue],
            fontsize = 40, align = (:center, :center),
        )
        masque(fig, interactables(tx; payloads = [(; label = "under"), (; label = "over")]))
    end

    poly_overlap = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "poly overlap", limits = (0, 4, 0, 3))
        pl = poly!(ax, [Rect2f(1, 1, 1.2, 1), Rect2f(1.4, 1.2, 1.2, 1)]; color = [:red, :blue])
        masque(fig, interactables(pl; payloads = [(; label = "under"), (; label = "over")]))
    end

    spheres3d = let
        fig = Figure(size = (480, 320))
        ax = Axis3(
            fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "spheres3d",
            limits = (0, 4, 0, 4, 0, 4),
        )
        el, az = 0.5, 0.4
        toward = Makie.Vec3f(cos(el) * cos(az), cos(el) * sin(az), sin(el))
        back = Makie.Point3f(2, 2, 2)
        ms = meshscatter!(
            ax, [back + 1.2f0 * toward + Makie.Vec3f(0, 0, 0.15), back]; color = [:blue, :red],
            markersize = 0.5, shading = NoShading,
        )
        masque(fig, interactables(ms; payloads = [(; label = "front"), (; label = "back")]))
    end

    # Four clumps laid out on a golden-angle spiral (no RNG: `randn` streams differ between
    # Julia versions, and CI's sweep runs 1.10), plus twenty copies of one point, so exactly one
    # cell holds twenty points and every other cell fewer.
    datashader = let
        spiral(cx, cy) = [Point2f(cx + 0.6sqrt(k / 400) * cos(2.39996k), cy + 0.6sqrt(k / 400) * sin(2.39996k)) for k in 1:400]
        pts = vcat((spiral(cx, cy) for (cx, cy) in ((1, 1), (3, 1), (1, 3), (3, 3)))..., fill(Point2f(2, 2), 20))
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "datashader")
        # Serial aggregation: the threaded one can count a point twice (Makie PR #5750).
        # 4-px bins: the driver's no-pulse nudge moves the pointer 1 CSS px, which would leave a
        # default 1-px bin and hover its neighbour.
        datashader!(ax, pts; async = false, method = Makie.AggSerial(), binsize = 4)
        masque(fig)
    end

    violin = let
        # Evenly spaced logistic quantiles (close to normal), not `randn`, so the shapes match
        # across Julia versions.
        q = [log(p / (1 - p)) / 1.7 for p in range(0.0025, 0.9975; length = 200)]
        xs = repeat([1, 2]; inner = 200)
        ys = vcat(q, q .* 0.6 .+ 1)
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "violin")
        violin!(ax, xs, ys; color = (:steelblue, 0.6))
        masque(fig; selected = Dict(:violin => [1]))
    end

    stairs = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "stairs", limits = (0, 5, 0, 4))
        stairs!(ax, [1.0, 2.0, 3.0, 4.0], [1.0, 3.0, 2.0, 2.5]; color = :gray, linewidth = 4)
        masque(fig)
    end

    arrows2d = let
        fig = Figure(size = (480, 320))
        ax = Axis(fig[1, 1]; title = "arrows2d", limits = (0, 5, 0, 6))
        apts = Makie.Point2f[(1, 1), (3, 2), (2, 4)]
        adirs = Makie.Vec2f[(1.5, 0), (0, 2), (1.5, 1)]
        arrows2d!(ax, apts, adirs; color = :gray)
        masque(fig; selected = Dict(:arrows2d => [1]))
    end

    # direction = :y draws the transpose of the band's converted points, #247. Values run
    # along x, so a hit ring left unflipped would sit across the axis from the drawn band.
    band_y = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "band-y", limits = (0, 8, 0, 6))
        band!(ax, 1:5, [1.0, 1.5, 1.0, 1.5, 1.0], [3.0, 3.5, 3.0, 3.5, 3.0]; direction = :y, color = :gray)
        masque(fig)
    end

    # Hexagons from a fixed point cloud, so the bins and counts don't change between runs.
    hexbin = let
        xs = [1.0, 1.2, 1.1, 3.0, 3.2, 3.1, 3.3, 5.0, 5.1, 2.0, 4.0, 4.2]
        ys = [1.0, 1.1, 1.3, 3.0, 3.1, 2.9, 3.2, 1.0, 1.2, 4.0, 4.5, 4.4]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "hexbin")
        hexbin!(ax, xs, ys; bins = 3)
        masque(fig; selected = Dict(:hexbin => [1]))
    end

    # Square markers sized in data units over a heatmap's cells, #291.
    scatter_data = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "scatter markerspace = :data")
        heatmap!(ax, 1:4, 1:3, reshape(collect(1.0:12.0), 4, 3); colormap = :grays)
        scatter!(
            ax, vec([Point2f(i, j) for i in 1:4, j in 1:3]);
            marker = Rect, markersize = 0.8, markerspace = :data, color = (:orange, 0.6),
        )
        masque(fig; selected = Dict(:scatter => [1]))
    end

    # Thick bar outlines respond too, #246: the layer carries a `tol` reach past each bar.
    bar_stroke = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "bar-stroke")
        barplot!(ax, 1:3, [2, 5, 3]; color = :lightgray, strokewidth = 8, strokecolor = :black)
        # A stroked marker clear of the bars: Cairo draws half its outline outside the marker,
        # WebGL all of it, and the hit circle follows the outline's outer edge on each.
        scatter!(ax, [0.2], [4.0]; markersize = 20, color = :red, strokewidth = 8, strokecolor = :blue)
        masque(fig; selected = Dict(:bars => [2]))
    end

    # A scatter moved by translate! and drawn with marker_offset, #245. The hit circles sit on
    # the drawn markers, two data units right and one up plus 20 px each way, not at the data.
    scatter_moved = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "scatter-moved", limits = (0, 8, 0, 6))
        p = scatter!(ax, [1.0, 2.0, 3.0], [1.0, 3.0, 2.0]; markersize = 24, marker_offset = Makie.Vec2f(20, 20))
        translate!(p, 2, 1, 0)
        masque(fig; selected = Dict(:scatter => [2]))
    end

    # A date axis: default payloads carry the date as text, #249.
    scatter_dates = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "scatter-dates")
        scatter!(ax, Makie.Dates.Date(2024, 1, 1) .+ Makie.Dates.Day.(0:2), [1.0, 3.0, 2.0]; markersize = 22)
        masque(fig; selected = Dict(:scatter => [2]))
    end

    hlines = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "hlines", limits = (0, 5, 0, 5))
        scatter!(ax, [1.0, 4.0], [1.0, 4.0]; markersize = 8, color = :gray)
        hlines!(ax, [1.5, 3.5]; color = :gray, linewidth = 3)
        # Off the hlines' midpoints (x = 2.5), where the driver hovers and clicks: drawn on top,
        # the vline would win the crossing.
        vlines!(ax, [4.25]; color = :gray, linewidth = 3)
        masque(fig; selected = Dict(:hlines => [1]))
    end

    threshold = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "threshold", limits = (0, 10, 0, 10))
        scatter!(ax, [2.0, 8.0], [2.0, 8.0]; markersize = 10, color = :gray)
        masque(fig, ThresholdInteractable(ax; orientation = :horizontal, value = 4.0, id = :threshold))
    end

    roi_bounds = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "roi bounds", limits = (0, 10, 0, 10))
        scatter!(ax, [1.0, 8.0], [1.0, 8.0]; markersize = 14, color = :gray)
        masque(fig, ROIInteractable(ax; bounds = (3.0, 6.0, 3.0, 6.0), id = :roi))
    end

    colorbar_owner = let
        z = [Float64(i + 3j) for i in 1:4, j in 1:3]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "colorbar owner")
        hm = heatmap!(ax, 1:4, 1:3, z)
        cb = Colorbar(fig[1, 2], hm)
        masque(fig, ColorbarInteractable(cb))
    end

    threshold_cat = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "threshold (categorical y)", dim2_conversion = Makie.CategoricalConversion())
        scatter!(ax, [1.0, 2.0, 3.0], ["a", "b", "c"]; markersize = 10, color = :gray)
        masque(
            fig, ThresholdInteractable(ax; orientation = :horizontal, value = 2.0, id = :threshold);
            auto = false,
        )
    end

    axis_cat = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "axis (categorical y)", dim2_conversion = Makie.CategoricalConversion())
        scatter!(ax, [1.0, 2.0, 3.0], ["a", "b", "c"]; markersize = 10, color = :gray)
        masque(fig, AxisInteractable(ax; id = :axis); auto = false)
    end

    roi = let
        pts = [(1.0, 1.0), (3.0, 3.0), (5.0, 5.0), (7.0, 7.0), (9.0, 9.0)]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "roi", limits = (0, 10, 0, 10))
        sc = scatter!(ax, first.(pts), last.(pts); markersize = 14, color = :gray)
        # The scatter's default layer, renamed, plus a box added after it.
        masque(
            fig,
            interactables(sc; id = :pts),
            ROIInteractable(ax; bounds = (2.0, 6.0, 2.0, 6.0), selects = :pts, id = :roi),
        )
    end

    roi_grid = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "roi over a heatmap")
        hm = heatmap!(ax, 1:6, 1:4, [Float64(i + 6j) for i in 1:6, j in 1:4])
        masque(
            fig,
            interactables(hm; id = :cells),
            ROIInteractable(ax; bounds = (2.5, 4.5, 1.5, 3.5), selects = :cells, id = :roi),
        )
    end

    view = let
        pts = [(1.0, 1.0), (7.0, 1.0), (1.0, 7.0), (7.0, 7.0)]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "view-pan", limits = (0, 8, 0, 8))
        sc = scatter!(ax, first.(pts), last.(pts); markersize = 14, color = :gray)
        masque(fig, interactables(sc; id = :pts), ViewInteractable(ax; id = :view))
    end

    view_linked = let
        pts = [(1.0, 1.0), (7.0, 1.0), (1.0, 7.0), (7.0, 7.0)]
        fig = Figure(size = (820, 260))
        a1 = Axis(fig[1, 1]; title = "view-linked")
        a2 = Axis(fig[1, 2]; title = "linked")
        a3 = Axis(fig[1, 3]; title = "unlinked")
        sc = scatter!(a1, first.(pts), last.(pts); markersize = 14, color = :gray)
        # The pick is the middle point, which stays in view through the drag and wheel zoom.
        pts2 = [pts; (3.0, 4.0)]
        sc2 = scatter!(a2, first.(pts2), last.(pts2); markersize = 14, color = :orange)
        sc3 = scatter!(a3, first.(pts), last.(pts); markersize = 14, color = :teal)
        linkaxes!(a1, a2)
        # A pick on the linked axis: its ring slides and clips with that axis's data (#368).
        # Mid-preview, hover finds the linked axis's marks where they slid to and the unlinked
        # axis's where they stayed (#379).
        masque(
            fig, interactables(sc; id = :pts), interactables(sc2; id = :linked), interactables(sc3; id = :unlinked),
            ViewInteractable(a1; id = :view);
            selected = Dict(:linked => [5]),
        )
    end

    view_twin = let
        fig = Figure(size = (480, 300))
        a1 = Axis(fig[1, 1]; title = "view-twin", limits = (0, 8, 0, 8))
        # A twin y axis in the same cell, not linked, drawn over a1 without hiding it.
        a2 = Axis(fig[1, 1]; yaxisposition = :right, limits = (0, 8, 0, 80), backgroundcolor = :transparent)
        hidexdecorations!(a2)
        # An inset in the top-right corner, drawn over a1 as in Makie's inset example.
        a3 = Axis(
            fig[1, 1]; width = Relative(0.32), height = Relative(0.32), halign = 0.95, valign = 0.92,
            limits = (0, 4, 0, 4), backgroundcolor = :white, title = "inset",
        )
        translate!(a3.blockscene, 0, 0, 150)
        pts = [(1.0, 1.0), (1.0, 7.0), (3.0, 2.0)]
        sc = scatter!(a1, first.(pts), last.(pts); markersize = 14, color = :gray)
        sc2 = scatter!(a2, [2.0, 6.0], [60.0, 20.0]; markersize = 14, color = :orange)
        sc3 = scatter!(a3, [1.0, 2.0, 3.0], [1.0, 2.0, 3.0]; markersize = 12, color = :teal)
        masque(
            fig, interactables(sc; id = :pts), interactables(sc2; id = :twin),
            ThresholdInteractable(a2; orientation = :vertical, value = 6.8, id = :twinline),
            interactables(sc3; id = :inset), ViewInteractable(a1; id = :view);
            selected = Dict(:twin => [1], :inset => [2]),
        )
    end

    view_twin_linked = let
        fig = Figure(size = (480, 300))
        a1 = Axis(fig[1, 1]; title = "view-twin-linked", limits = (0, 8, 0, 8))
        a2 = Axis(fig[1, 1]; yaxisposition = :right, limits = (0, 8, 0, 80), backgroundcolor = :transparent)
        hidexdecorations!(a2)
        linkxaxes!(a1, a2)
        pts = [(1.0, 1.0), (1.0, 7.0), (3.0, 2.0)]
        sc = scatter!(a1, first.(pts), last.(pts); markersize = 14, color = :gray)
        sc2 = scatter!(a2, [2.0, 6.0], [60.0, 20.0]; markersize = 14, color = :orange)
        masque(
            fig, interactables(sc; id = :pts), interactables(sc2; id = :twin), ViewInteractable(a1; id = :view);
            selected = Dict(:pts => [3], :twin => [1]),
        )
    end

    view3d = let
        pts = Makie.Point3f[(0, 0, 0), (4, 4, 4), (2, 2, 2)]
        fig = Figure(size = (480, 320))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "view3d")
        sc = scatter!(ax, pts; markersize = 14, color = :gray)
        # Runs through the zoomed limits with both ends outside them: the part inside is still
        # drawn, so it must still hover.
        ln = lines!(ax, [0, 2.6, 4], [2.8, 2.8, 2.8], [2, 2, 2]; color = :steelblue)
        masque(fig, interactables(sc; id = :pts), interactables(ln; id = :line), ViewInteractable(ax; id = :view))
    end

    view3d_linked = let
        pts = Makie.Point3f[(0, 0, 0), (4, 4, 4), (4, 0, 0)]
        fig = Figure(size = (640, 320))
        a1 = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "drag")
        a2 = Axis3(fig[1, 2]; title = "follows")
        s1 = scatter!(a1, pts; markersize = 14, color = :gray)
        s2 = scatter!(a2, pts; markersize = 14, color = :seagreen)
        linkcameras!(a1, a2; limits = true)
        masque(
            fig, interactables(s1; id = :pts), interactables(s2; id = :pts2),
            ViewInteractable(a1; id = :view), ViewInteractable(a2; id = :view2),
        )
    end

    legend = let
        xs = collect(0.0:0.5:3.0)
        fig = Figure(size = (480, 320))
        ax = Axis(fig[1, 1]; title = "legend")
        lines!(ax, xs, xs .^ 2; label = "quad", color = :steelblue, linewidth = 3)
        lines!(ax, xs, 2 .* xs; label = "lin", color = :seagreen, linewidth = 3)
        scatter!(ax, [0.5, 1.5, 2.5], [1.0, 3.0, 5.0]; label = "pts", markersize = 18, color = :orange)
        axislegend(ax; position = :lt)
        masque(fig)   # zero-config: legend auto-extracted, links auto-resolved from Makie.get_plots
    end

    series_legend = let
        fig = Figure(size = (480, 320))
        ax = Axis(fig[1, 1]; title = "series_legend")
        ys = [1.0 1.5 2.2 2.8; 3.0 2.4 1.2 1.5; 0.6 1.4 2.6 2.0]
        # Labels are given: Makie 0.24.16 leaves a series' default `series k` labels out of
        # its legend (each entry is labelled `nothing` and not drawn).
        series!(ax, ys; linewidth = 4, labels = ["series 1", "series 2", "series 3"])
        axislegend(ax; position = :lt)
        masque(fig)
    end

    # A legend genuinely overlapping filled plot geometry: the heatmap fills the whole axis
    # (explicit `limits` matching its edges exactly, so there's no autolimit padding to dodge
    # into), and the `:lt` inset legend sits inside that axis viewport — so every legend-entry
    # pixel is also a heatmap-cell pixel. Regression case for the `build_manifest` layer
    # precedence fix: without it, the heatmap's `:grid` layer (added after the legend by
    # `interactables(fig)`) would win every hit under the legend box.
    legend_overlap = let
        n = 6
        z = [Float64(i + j) for i in 1:n, j in 1:n]
        fig = Figure(size = (480, 320))
        ax = Axis(fig[1, 1]; title = "legend-overlap", limits = (0.5, n + 0.5, 0.5, n + 0.5))
        heatmap!(ax, 1:n, 1:n, z)
        lines!(ax, 1:n, 1:n; label = "trend", color = :steelblue, linewidth = 4)
        axislegend(ax; position = :lt)
        masque(fig)   # zero-config: exercises the real auto-extraction + precedence path
    end

    # Same geometry as `legend`, but the caller passed a template. The card must show that
    # text (not stay hidden, and not fall back to a bare label).
    legend_template = let
        xs = collect(0.0:0.5:3.0)
        fig = Figure(size = (480, 320))
        ax = Axis(fig[1, 1]; title = "legend-template")
        l1 = lines!(ax, xs, xs .^ 2; label = "quad", color = :steelblue, linewidth = 3)
        l2 = lines!(ax, xs, 2 .* xs; label = "lin", color = :seagreen, linewidth = 3)
        sc = scatter!(ax, [0.5, 1.5, 2.5], [1.0, 3.0, 5.0]; label = "pts", markersize = 18, color = :orange)
        leg = axislegend(ax; position = :lt)
        masque(
            fig,
            [
                SegmentInteractable(ax, l1; id = :lines),
                SegmentInteractable(ax, l2; id = :lines_2),
                PointInteractable(ax, sc; id = :scatter),
                LegendInteractable(
                    leg;
                    tooltip = masque"series $(label)",
                    targets = Dict("quad" => :lines, "lin" => :lines_2, "pts" => :scatter),
                ),
            ];
            auto = false,
        )
    end

    # AxisInteractable (whole-axis catch-all readout) + the automatic ColorbarInteractable
    # (bounded-bbox readout; one the caller passed would own the bond, #309) sharing one widget/bond with a real, pre-existing selection (`:pts`) alongside
    # them — the fixture #113 asks for: an axis or colorbar click must leave that selection
    # untouched (the #107 round-1 regression), and the two `:axis`-kind layers exercise the
    # catch-all vs. bounded branches of geometry.ts's hit test respectively. `sc`'s continuous
    # `color=` doubles as the colorbar's own source, so no second, purely-decorative plot is
    # needed just to hang a `Colorbar` off of.
    axis = let
        pts = [(1.0, 1.0), (2.0, 2.0), (3.0, 1.2)]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "axis", limits = (0, 4, 0, 3))
        sc = scatter!(ax, first.(pts), last.(pts); color = [1.0, 2.0, 3.0], colormap = :viridis, markersize = 22)
        Colorbar(fig[1, 2], sc)
        masque(
            fig,
            [
                interactables(
                    sc; id = :pts,
                    payloads = [(; label = "alpha"), (; label = "beta"), (; label = "gamma")],
                ),
                # Sorted LAST, after the automatic `:colorbar`: an `AxisInteractable`'s hit test
                # has no bounding check at all — a true whole-image catch-all (geometry.ts's
                # "axis" case with `geometry === nothing`). Placed before `:pts`/`:colorbar` in
                # `build_manifest`'s stable layer order, it would win every click meant for the
                # scatter marks or the colorbar (the layer-ordering hazard #113 calls out).
                AxisInteractable(ax; id = :axis),
            ];
            selected = Dict(:pts => [2]),
        )
    end

    composite = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "composite", limits = (0, 10, 0, 10))
        lines!(ax, [0.5, 9.5], [1.5, 1.5]; color = :gray, linewidth = 4)
        scatter!(ax, [2.0, 5.0, 8.0], [6.5, 8.5, 6.5]; markersize = 18, color = :gray)
        masque(fig, ThresholdInteractable(ax; orientation = :vertical, value = 3.0, id = :cutoff))
    end

    onchange = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "onchange", limits = (0, 10, 0, 10))
        sc = scatter!(ax, [2.0, 5.0, 8.0], [7.0, 8.5, 7.0]; markersize = 18, color = :gray)
        level = lines!(ax, [0.0, 10.0], [3.0, 3.0]; color = :red, linewidth = 4)
        cutoff = ThresholdInteractable(ax; orientation = :vertical, value = 3.0, id = :cutoff)
        masque(
            fig, (pts = interactables(sc; select = :many), cutoff = cutoff); bind = :pts,
            onchange = st -> update!(level, [0.0, 10.0], fill(st.cutoff.value + length(st.pts), 2)),
        )
    end

    controls = let
        fig = Figure(size = (480, 420))
        ax = Axis(fig[1, 1:2]; title = "controls", limits = (0, 10, 0, 10))
        level = lines!(ax, [0.0, 10.0], [3.0, 3.0]; color = :red, linewidth = 4)
        sl = Makie.Slider(fig[2, 1]; range = 0:10, startvalue = 3)   # WGLMakie also exports Bonito's `Slider`
        tg = Toggle(fig[2, 2]; active = true)
        span = IntervalSlider(fig[3, 1]; range = 1:5, startvalues = (2, 4))
        fine = Checkbox(fig[3, 2]; checked = false)
        pick = Menu(fig[4, 1:2]; options = ["a", "b", "c"], default = "a")
        # A vertical toggle (#427): its track stands up, off at the bottom.
        tall = Toggle(fig[1, 3]; orientation = :vertical, active = false)
        # A slider grid (#430): its value label follows the slider in the browser.
        grid = SliderGrid(fig[5, 1:2], (label = "gain", range = 1:5, format = "{} dB", startvalue = 2))
        # A checkbox drawn as Makie draws it (#428): its square, in its own colours, sits in the
        # middle of a box wider than it.
        sure = Checkbox(fig[3, 3]; checked = false, size = 18, checkboxcolor_checked = :darkorange, width = 40, tellwidth = false)
        # A button (#431): its field counts clicks. Bold, so the page loads a second face (#476).
        go = Makie.Button(fig[4:5, 3]; label = "Go", font = :bold)   # WGLMakie also exports Bonito's `Button`
        # A text box (#433): lower-case letters only, stored on Enter.
        word = Textbox(fig[6, 1:3]; placeholder = "a word", validator = r"[a-z]+", width = 200)
        masque(
            fig, (level = sl, show = tg, span = span, fine = fine, pick = pick, tall = tall, grid = grid, go = go, word = word, sure = sure);
            onchange = st -> begin
                update!(level, [0.0, 10.0], fill(Float64(st.level), 2); visible = st.show)
                # A dependent menu: the checkbox swaps the menu's options.
                opts = st.fine ? ["x", "y", "z"] : ["a", "b", "c"]
                pick.options[] == opts || (pick.options[] = opts)
            end,
        )
    end

    many = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "select many", limits = (0, 10, 0, 10))
        sc = scatter!(ax, [2.0, 5.0, 8.0], [3.0, 7.0, 3.0]; markersize = 20, color = :gray)
        masque(fig, interactables(sc; select = :many))
    end

    marquee = let
        fig = Figure(size = (560, 260))
        ax1 = Axis(fig[1, 1]; title = "marquee", limits = (0, 10, 0, 10))
        a = scatter!(ax1, [2.0, 5.0, 8.0], [2.0, 5.0, 2.0]; markersize = 20, color = :gray, label = "a")
        axislegend(ax1; position = :rt)
        ax2 = Axis(fig[1, 2]; title = "marquee pan", limits = (0, 10, 0, 10))
        b = scatter!(ax2, [2.0, 5.0, 8.0], [2.0, 5.0, 2.0]; markersize = 20, color = :gray)
        masque(
            fig, interactables(a; id = :a, select = :many), interactables(b; id = :b, select = :many),
            ViewInteractable(ax2; id = :view),
        )
    end

    many_grid = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "select many cells", limits = (0, 4, 0, 4))
        hm = heatmap!(ax, 0:4, 0:3, reshape(Float64.(1:12), 4, 3))
        masque(fig, (region = interactables(hm; select = :many),))
    end

    many_grid_seeded = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "seeded cells", limits = (0, 4, 0, 4))
        hm = heatmap!(ax, 0:4, 0:3, reshape(Float64.(1:12), 4, 3))
        mask = falses(4, 3)
        mask[2, 2] = mask[3, 2] = true
        masque(fig, (region = interactables(hm; select = :many),); selected = (region = mask,))
    end

    many_grid_regions = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "regions", limits = (0, 4, 0, 4))
        hm = heatmap!(ax, 0:4, 0:3, reshape(Float64.(1:12), 4, 3))
        # Rows run along x: cell (i, j) is in region R[i, j], 0 for none.
        R = [1 1 3; 1 3 3; 2 2 2; 0 0 2]
        masque(fig, (region = interactables(hm; select = :many, regions = R),))
    end

    # Row k sits at mark k in both panels: left to right on the left, right to left on the right.
    linked_pos = let
        fig = Figure(size = (560, 260))
        a1 = Axis(fig[1, 1]; title = "linked left", limits = (0, 10, 0, 10))
        a2 = Axis(fig[1, 2]; title = "linked right", limits = (0, 10, 0, 10))
        u = scatter!(a1, [2.0, 5.0, 8.0], [2.0, 5.0, 2.0]; markersize = 20, color = :gray)
        labels = text!(a1, [2.0, 5.0, 8.0], [3.0, 6.0, 3.0]; text = ["r1", "r2", "r3"], align = (:center, :bottom), fontsize = 14)
        p = scatter!(a2, [8.0, 5.0, 2.0], [8.0, 5.0, 8.0]; markersize = 20, color = :gray)
        masque(
            fig, (cells = linked(interactables(u; id = :u), interactables(p; id = :p), interactables(labels; id = :labels); select = :many),),
        )
    end

    linked_keys = let
        fig = Figure(size = (560, 260))
        a1 = Axis(fig[1, 1]; title = "by cluster", limits = (0, 10, 0, 10))
        a2 = Axis(fig[1, 2]; title = "all cells", limits = (0, 10, 0, 10))
        cells = [(; id = "c$i", cluster = i <= 2 ? "A" : "B") for i in 1:4]
        A = interactables(scatter!(a1, [2.0, 4.0], [2.0, 2.0]; markersize = 20, color = :gray, label = "A"); id = :A, payloads = cells[1:2])
        B = interactables(scatter!(a1, [6.0, 8.0], [5.0, 5.0]; markersize = 20, color = :gray, label = "B"); id = :B, payloads = cells[3:4])
        axislegend(a1; position = :rt)
        # The right panel draws c4, c3, c2, c1, left to right.
        every = interactables(scatter!(a2, [2.0, 4.0, 6.0, 8.0], [5.0, 5.0, 5.0, 5.0]; markersize = 20, color = :gray); id = :every, payloads = reverse(cells))
        # Bound alone, so the legend sits outside the bind value and still picks.
        masque(fig, (cells = linked(A, B, every; key = :id, select = :many),); bind = :cells)
    end

    linked_one = let
        fig = Figure(size = (560, 260))
        a1 = Axis(fig[1, 1]; title = "linked one left", limits = (0, 10, 0, 10))
        a2 = Axis(fig[1, 2]; title = "linked one right", limits = (0, 10, 0, 10))
        u = scatter!(a1, [2.0, 5.0, 8.0], [2.0, 5.0, 2.0]; markersize = 20, color = :gray)
        p = scatter!(a2, [8.0, 5.0, 2.0], [8.0, 5.0, 8.0]; markersize = 20, color = :gray)
        masque(fig, (cell = linked(interactables(u; id = :u), interactables(p; id = :p)),))
    end

    slice_lines = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "slice lines", limits = (0, 4, 0, 4))
        xs = [0.0, 1.0, 2.0, 3.0, 4.0]
        wide = lines!(ax, xs, xs; label = "wide", color = :gray, linewidth = 3)
        narrow = lines!(ax, xs, 4 .- xs; label = "narrow", color = :gray, linewidth = 3)
        masque(
            fig, [
                SegmentInteractable(ax, wide; id = :wide, payloads = [(; label = "wide")]),
                SegmentInteractable(ax, narrow; id = :narrow, payloads = [(; label = "narrow")]),
                SliceInteractable(ax, [wide, narrow]; covers = (:wide, :narrow)),
            ];
            auto = false,
        )
    end

    slice_density = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "slice density")
        rng = MersenneTwister(1)
        d1 = density!(ax, randn(rng, 200); label = "wide")
        d2 = density!(ax, randn(rng, 200) .+ 2; label = "narrow")
        masque(
            fig, [
                PolygonInteractable(ax, d1; id = :wide),
                PolygonInteractable(ax, d2; id = :narrow),
                SliceInteractable(ax, [d1, d2]; covers = (:wide, :narrow)),
            ];
            auto = false,
        )
    end

    slice_auto = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "slice auto = false", limits = (0, 4, 0, 4))
        xs = [0.0, 1.0, 2.0, 3.0, 4.0]
        wide = lines!(ax, xs, xs; label = "wide")
        narrow = lines!(ax, xs, 4 .- xs; label = "narrow")
        masque(fig, SliceInteractable(ax, [wide, narrow]), AxisInteractable(ax); auto = false)
    end

    slice_gap = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "slice gap", limits = (0, 4, 0, 4))
        xs = [0.0, 1.0, 2.0, 3.0, 4.0]
        gappy = lines!(ax, xs, [0.0, 1.0, NaN, 3.0, 4.0]; label = "gappy")
        whole = lines!(ax, xs, 4 .- xs; label = "whole")
        masque(fig, SliceInteractable(ax, [gappy, whole]), AxisInteractable(ax); auto = false)
    end

    return (;
        scatter, lines, series, segments, heatmap, image, image_rgb, heatmap_labels, barplot, poly, poly_shapes, regions,
        polar, axis_polar, scatter_dark, scatter_sizes, scatter_styled, fade_pan, legend_hidden, hidden_plot, added_plot, arrows3d, arrows3d_shared, scatterlines3d,
        scatter3d, lines3d, meshscatter3d, wireframe3d, surface3d, overlap3d, text3d, text, scatter_overlap, text_overlap, poly_overlap, spheres3d, datashader, violin, stairs, arrows2d, band_y, hexbin, scatter_data, scatter_moved, bar_stroke, scatter_dates, hlines, threshold, colorbar_owner, roi_bounds, threshold_cat, axis_cat, roi, roi_grid, view, view_linked, view_twin, view_twin_linked, view3d, view3d_linked, legend, series_legend,
        legend_overlap, legend_template, axis, composite, onchange, controls, many, many_grid, many_grid_seeded, many_grid_regions, linked_pos, linked_keys, linked_one, marquee, slice_lines, slice_density, slice_auto, slice_gap,
    )
end

# The text a notebook prints for one sweep widget's `@bind` value `ev`: the field the case is
# about (its `field`, else its `layerId`), or the whole value for `"*"`. A widget without that
# field prints `nothing` while none of its fields holds a value (a slice or view case).
function sweep_field(key, ev)
    ev isa NamedTuple || return repr(ev)
    i = findfirst(d -> d["key"] == key, kind_sweep_meta())
    name = i === nothing ? nothing : get(kind_sweep_meta()[i], "field", kind_sweep_meta()[i]["layerId"])
    name == "*" && return repr(ev)
    # A recipe part's field, `scatterlines.points`, sits nested in the value.
    v = ev
    for k in (name === nothing ? () : Symbol.(split(name, '.')))
        v = v isa NamedTuple && haskey(v, k) ? getproperty(v, k) : missing
    end
    name !== nothing && v !== missing && return repr(v)
    length(ev) == 1 && return repr(only(ev))
    return all(isnothing, ev) ? "nothing" : repr(ev)
end
