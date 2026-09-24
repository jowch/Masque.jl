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
    ),
    Dict(
        "key" => "series", "layerId" => "series", "layerKind" => "lines",
        "selected" => "ring", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "series 1", "hoverIndex" => 1, "hoverTip" => "series 2", "mode" => "element",
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
        "key" => "polar", "layerId" => "polar", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "north", "hoverIndex" => 0, "hoverTip" => "east", "mode" => "element",
    ),
    Dict(
        "key" => "scatter_dark", "layerId" => "scatter_dark", "layerKind" => "circles",
        "selected" => "wash", "circle" => true, "selectedIndex" => 1, "clickIndex" => 0,
        "tip" => "beta", "hoverIndex" => 0, "hoverTip" => "alpha", "mode" => "element",
    ),
    Dict(
        "key" => "arrows3d", "layerId" => "arrows3d", "layerKind" => "segments",
        "selected" => "ring", "circle" => false, "selectedIndex" => 0, "clickIndex" => 1,
        "tip" => "index", "hoverIndex" => 1, "hoverTip" => "index", "mode" => "element",
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
]

function build_kind_sweep()
    scatter = let
        pts = [(1.0, 1.0), (2.0, 2.0), (3.0, 1.2)]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "scatter")
        # Built from the plot object (not raw pts) so PointInteractable resolves `colors` from
        # `color=` — the mark-colour-derivation check needs a resolvable mark colour.
        sc = scatter!(ax, first.(pts), last.(pts); color = :gray, markersize = 22)
        masque(
            fig,
            PointInteractable(
                ax, sc; id = :scatter,
                payloads = [(; label = "alpha"), (; label = "beta"), (; label = "gamma")],
            );
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
        )
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

    hlines = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "hlines", limits = (0, 5, 0, 5))
        scatter!(ax, [1.0, 4.0], [1.0, 4.0]; markersize = 8, color = :gray)
        hlines!(ax, [1.5, 3.5]; color = :gray, linewidth = 3)
        vlines!(ax, [2.5]; color = :gray, linewidth = 3)
        masque(fig; selected = Dict(:hlines => [1]))
    end

    threshold = let
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "threshold", limits = (0, 10, 0, 10))
        scatter!(ax, [2.0, 8.0], [2.0, 8.0]; markersize = 10, color = :gray)
        masque(fig, ThresholdInteractable(ax; orientation = :horizontal, value = 4.0, id = :threshold))
    end

    roi = let
        pts = [(1.0, 1.0), (3.0, 3.0), (5.0, 5.0), (7.0, 7.0), (9.0, 9.0)]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "roi", limits = (0, 10, 0, 10))
        scatter!(ax, first.(pts), last.(pts); markersize = 14, color = :gray)
        masque(
            fig,
            [
                PointInteractable(ax, pts; id = :pts),
                ROIInteractable(ax; bounds = (2.0, 6.0, 2.0, 6.0), selects = :pts, id = :roi),
            ],
        )
    end

    view = let
        pts = [(1.0, 1.0), (7.0, 1.0), (1.0, 7.0), (7.0, 7.0)]
        fig = Figure(size = (480, 260))
        ax = Axis(fig[1, 1]; title = "view-pan", limits = (0, 8, 0, 8))
        scatter!(ax, first.(pts), last.(pts); markersize = 14, color = :gray)
        masque(fig, [PointInteractable(ax, pts; id = :pts), ViewInteractable(ax; id = :view)])
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
    # `auto_interactables`) would win every hit under the legend box.
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
            ],
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
            ],
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
            ],
        )
    end

    return (;
        scatter, lines, series, segments, heatmap, image, image_rgb, barplot, poly,
        polar, scatter_dark, arrows3d, hlines, threshold, roi, view, legend, series_legend,
        legend_overlap, legend_template, axis, slice_lines, slice_density,
    )
end
