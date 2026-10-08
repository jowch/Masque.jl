# Shared figures for the agent kind-sweep notebooks (Cairo / WGL).
# Each widget is one interactable kind (interaction + visual). `selected=` is baked only
# on supported kinds (`circles`, `rects`, `polygons`, `segments`, `polyline`, `lines`). `circle` marks a
# kind whose highlight is a circle, so the driver checks r == geometry r (no halo offset).
# Grid / threshold / roi / view are hover-click or drag only. `scatter_dark` is a dark
# Makie figure so the split recipe (dodge fill both figures, flat chrome edge stroke on
# light/dark) is live-checked on dark axes too; `scatter` and `scatter_dark` are built from
# the scatter plot object (not raw points) so `colors` resolves and the tooltip-accent check has
# something to derive from.
#
# `selectedIndex`/`tip` are the BAKED-selected element (where `selected` isn't `nothing`) — used
# for the persisted-wash / selected-survives-unhover checks. `hoverIndex`/`hoverTip` are a
# DIFFERENT element for the standard hover-recipe check: hovering an already-selected mark draws
# no highlight (see CLAUDE.md), so a kind with a baked selection needs its own, distinct hover
# target to exercise the normal recipe at all. The one-element `lines` row is the exception:
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
# kind_sweep.mjs's `hitPoint` does (barplot's `tintIndex`/`clickIndex` 0 -> `rects` centre;
# heatmap's `tintIndex` 11 -> the `grid` cell midpoint from `xedges`/`yedges`; poly's `clickIndex`
# 1 -> the 2nd ring's centroid, i.e. the GOLDENROD ring, not orchid), then
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

using Random

kind_sweep_meta() = [
    Dict(
        "key" => "scatter", "layerId" => "scatter", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "beta", "hoverIndex" => 0, "hoverTip" => "alpha", "mode" => "element",
    ),
    Dict(
        "key" => "lines", "layerId" => "lines", "layerKind" => "lines",
        "selected" => "ring", "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "curve", "hoverIndex" => 0, "hoverTip" => "curve", "mode" => "element",
        # The hover readout at the third plotted point, (2.0, 0.4) (#262).
        "readout" => Dict("vertex" => 2, "text" => ["x2", "y0.4"]),
    ),
    Dict(
        "key" => "series", "layerId" => "series", "layerKind" => "lines",
        "selected" => "ring", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
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
        "key" => "barplot", "layerId" => "bars", "layerKind" => "rects",
        "selected" => "wash", "circle" => false, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "value", "hoverIndex" => 0, "hoverTip" => "value",
        "tintColor" => "rgb(128,128,128)", "mode" => "element",
    ),
    Dict(
        "key" => "poly", "layerId" => "poly", "layerKind" => "polygons",
        "selected" => "wash", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "ring1", "hoverIndex" => 1, "hoverTip" => "ring2",
        # clickIndex 1 is the 2nd ring — goldenrod (0.55 alpha over the axis background), not
        # orchid (that's ring 0 / selectedIndex).
        "tintColor" => "rgb(235,206,132)", "mode" => "element",
    ),
    Dict(
        # `poly!` given shapes (`Vector{Rect2f}`) rather than point rings: one element per rect.
        "key" => "poly_shapes", "layerId" => "poly", "layerKind" => "polygons",
        "selected" => "wash", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "rect-a", "hoverIndex" => 1, "hoverTip" => "rect-b", "mode" => "element",
    ),
    Dict(
        # RegionInteractable's rects layer: the base id `:zone` plus the `_r` suffix.
        "key" => "regions", "layerId" => "zone_r", "layerKind" => "rects",
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
        # `scatterlines!` on Axis3 (#273): the markers are the `:scatterlines` layer, drawn
        # over the `:scatterlines_line` layer, so a hover on a marker takes the marker.
        "key" => "scatterlines3d", "layerId" => "scatterlines", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "index", "hoverIndex" => 0, "hoverTip" => "index", "mode" => "element",
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
        "key" => "roi", "layerId" => "roi", "layerKind" => "roi",
        "selected" => nothing, "circle" => false, "selectedIndex" => 0, "clickIndex" => 0,
        "tip" => "", "hoverIndex" => 0, "hoverTip" => "", "mode" => "drag",
    ),
    Dict(
        "key" => "view", "layerId" => "view", "layerKind" => "view",
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
        "links" => Dict(
            "cases" => [
                Dict("index" => 0, "label" => "quad"),
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
        series!(ax, ys; linewidth = 4)
        masque(fig; selected = Dict(:series => [1]))
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
            selected = Dict(:poly => [1]),
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
        masque(
            fig,
            RegionInteractable(ax, zones; id = :zone, payloads = [(; label = "zone-a"), (; label = "zone-b")]);
            selected = Dict(:zone_r => [1]),
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
        )
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
        masque(fig; selected = Dict(:scatterlines => [2]))
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
        masque(
            fig, ThresholdInteractable(ax; orientation = :horizontal, value = 4.0, id = :threshold);
            auto = false,
        )
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

    view = let
        pts = [(1.0, 1.0), (7.0, 1.0), (1.0, 7.0), (7.0, 7.0)]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "view-pan", limits = (0, 8, 0, 8))
        sc = scatter!(ax, first.(pts), last.(pts); markersize = 14, color = :gray)
        masque(fig, interactables(sc; id = :pts), ViewInteractable(ax; id = :view))
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
        series!(ax, ys; linewidth = 4)
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

    # AxisInteractable (whole-axis catch-all readout) + ColorbarInteractable (bounded-bbox
    # readout) sharing one widget/bond with a real, pre-existing selection (`:pts`) alongside
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
        cb = Colorbar(fig[1, 2], sc)
        masque(
            fig,
            [
                PointInteractable(
                    ax, sc; id = :pts,
                    payloads = [(; label = "alpha"), (; label = "beta"), (; label = "gamma")],
                ),
                ColorbarInteractable(cb; id = :colorbar),
                # Sorted LAST: an `AxisInteractable`'s hit test has no bounding check at all — a
                # true whole-image catch-all (geometry.ts's "axis" case with `geometry ===
                # nothing`). Placed before `:pts`/`:colorbar` in `build_manifest`'s stable layer
                # order, it would win every click meant for the scatter marks or the colorbar
                # (the layer-ordering hazard #113 calls out).
                AxisInteractable(ax; id = :axis),
            ];
            selected = Dict(:pts => [2]),
            auto = false,
        )
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

    return (;
        scatter, lines, series, segments, heatmap, image, image_rgb, barplot, poly, poly_shapes, regions,
        polar, axis_polar, scatter_dark, scatter_sizes, scatter_styled, arrows3d, arrows3d_shared, scatterlines3d, arrows2d, band_y, hexbin, scatter_data, scatter_moved, bar_stroke, scatter_dates, hlines, threshold, threshold_cat, axis_cat, roi, view, legend, series_legend,
        legend_overlap, legend_template, axis, slice_lines, slice_density, slice_auto,
    )
end
