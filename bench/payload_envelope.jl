# Phase 0 perf spike — measure the payload envelope that bounds every payload-heavy roadmap
# item after it (richer tooltips, animation frames, SVG, multi-select). Re-runnable so the
# numbers can't rot as those features land. Findings live in docs/dev/perf-findings.md.
#
# Run: julia --project="${MASQUE_DEV_ENV:-$HOME/.julia/environments/masque-dev}" bench/payload_envelope.jl
#
# Two payload terms (see src/render.jl `show`):
#   - base64 PNG  → embedded in the HTML <img src>; the "large base64 → editor lag" driver.
#   - manifest    → shipped via published_to_js (MsgPack on the wire) each render.
# The click return value (JS→Julia) is tiny (layer/index/payload) and not swept here.

using Masque, CairoMakie, Printf, Random
Random.seed!(0)   # deterministic geometry/PNG so the committed numbers are exactly reproducible
# (render-ms still varies run-to-run — it's wall-clock timing, not a size).

include(joinpath(@__DIR__, "mpsize.jl"))   # mp(x): the MsgPack size of a manifest

kb(bytes) = round(bytes / 1024; digits = 1)
b64bytes(w) = (length(w.b64) * 3) ÷ 4                  # base64 chars → decoded bytes

# hit-element count: payload entries for list layers, ncols×nrows cells for :grid (heatmap)
# layers — whose cells live in `geometry`, not `payloads`, so payload-count alone reads 0.
function nhits(L)
    g = L["geometry"]
    return g isa AbstractDict ? get(g, "ncols", 0) * get(g, "nrows", 0) : length(get(L, "payloads", []))
end

function row(label, w)
    nlayers = length(w.manifest["layers"])
    nelem = sum(nhits, w.manifest["layers"]; init = 0)
    return @printf(
        "  %-34s  png=%8s KB   manifest=%8s KB   layers=%2d  elems/cells=%7d\n",
        label, kb(b64bytes(w)), kb(mp(w.manifest)), nlayers, nelem
    )
end

println("\n=== A. base64 PNG vs plot density (default width, px_per_unit) ===")
let
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1]); lines!(ax, 1:10, rand(10))
    row("line, 10 pts", masque(f))
end
for n in (100, 1_000, 10_000)
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
    scatter!(ax, rand(n), rand(n); markersize = 6)
    row("scatter, $n pts", masque(f))
end
for d in (50, 200)
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
    heatmap!(ax, 1:d, 1:d, rand(d, d))
    row("heatmap, $(d)×$(d)", masque(f))
end
# Per-cell payloads (#290): one short (row, col) label pair per cell, on top of `values[]`.
for d in (50, 200)
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
    hm = heatmap!(ax, 1:d, 1:d, rand(d, d))
    w = masque(f, interactables(hm; payloads = (i, j) -> (; row = "r$i", col = "c$j")))
    row("heatmap, $(d)×$(d), cell labels", w)
end

println("\n=== B. manifest vs payload richness (scatter, N=1000) — bounds M2.3 tooltips ===")
let
    pts = [Point2f(rand(), rand()) for _ in 1:1000]
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1]); scatter!(ax, pts)
    for len in (0, 50, 200)
        pl = [Dict("html" => "x"^len) for _ in 1:1000]
        w = masque(f, PointInteractable(ax, pts; id = :s, payloads = pl))
        row("payload html len=$len/elem", w)
    end
end

println("\n=== C. px_per_unit (display width) sweep — scatter 1000 ===")
for maxw in (300, 700)
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
    scatter!(ax, rand(1000), rand(1000); markersize = 6)
    row("max_width=$maxw", masque(f; max_width = maxw))
end

println("\n=== D. projected animation cost (Tier-1) = frames × per-frame PNG ===")
let
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1]); scatter!(ax, rand(1000), rand(1000); markersize = 6)
    per = b64bytes(masque(f))   # same config as section A's scatter-1000 → comparable per-frame size
    for nf in (30, 120)
        @printf(
            "  %-34s  total≈%8s KB  (%d frames × %s KB)\n",
            "$nf-frame scrub", kb(per * nf), nf, kb(per)
        )
    end
end
println("\n=== E. render latency — Julia half of the click→re-render round-trip (warmed) ===")
# The click message (JS→Julia) is tiny + Pluto auto-throttles stale events; the felt latency is
# dominated by Julia re-rendering the figure and re-emitting the payload. Browser paint +
# websocket transfer ride on top (needs live Pluto to measure; this is the floor).
let
    cases = (
        ("scatter 1000", () -> (f = Figure(size = (600, 400)); ax = Axis(f[1, 1]); scatter!(ax, rand(1000), rand(1000)); f)),
        ("scatter 10000", () -> (f = Figure(size = (600, 400)); ax = Axis(f[1, 1]); scatter!(ax, rand(10000), rand(10000)); f)),
        ("heatmap 200×200", () -> (f = Figure(size = (600, 400)); ax = Axis(f[1, 1]); heatmap!(ax, 1:200, 1:200, rand(200, 200)); f)),
    )
    for (label, mk) in cases
        f = mk(); masque(f)                                  # warm up render path for this fig shape
        t = minimum(@elapsed(masque(mk())) for _ in 1:3)     # fresh fig each run; take the best of 3
        @printf("  %-34s  render+encode ≈ %6.0f ms\n", label, t * 1000)
    end
end

println("\n=== F. polygon surfaces — :polygons vertex-dense envelope ===")
# Polygon ring geometry: one subvector per element. A solid element is a flat [x0,y0,…] ring.
# An element with holes is a list of those rings (exterior, then each hole). Vertices are
# projected to integer px (1–3 B/coord). The key new term vs scatter: per-element cost
# scales with ring vertex count, not just a fixed few coords — a violin KDE ring is ~400 pts,
# a contourf level may be an exterior plus its holes.
function _ringverts(ring)
    return (ring isa AbstractVector && !isempty(ring) && first(ring) isa AbstractVector) ?
        sum(length(r) ÷ 2 for r in ring; init = 0) : length(ring) ÷ 2
end
function npolyverts(L)
    g = L["geometry"]
    return (g isa AbstractVector) ? sum(_ringverts, g; init = 0) : 0
end
function poly_row(label, w)
    polylayers = filter(l -> l["kind"] == "polygons", w.manifest["layers"])
    isempty(polylayers) && (println("  $label — no :polygons layer"); return)
    n_elems = sum(nhits, polylayers; init = 0)
    n_verts = sum(npolyverts, polylayers; init = 0)
    geom_b = sum(mp(l["geometry"]) for l in polylayers; init = 0)
    total_b = mp(w.manifest)
    return @printf(
        "  %-40s  png=%6s KB   manifest=%6s KB   elems=%4d  verts=%6d  ~%5d B/elem  ~%d B/vert\n",
        label,
        kb(b64bytes(w)),
        kb(total_b),
        n_elems,
        n_verts,
        round(Int, total_b / max(n_elems, 1)),
        round(Int, geom_b / max(n_verts, 1)),
    )
end
let
    # Band: one ring (lower curve + reversed upper), ~2×N boundary vertices.
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
    band!(ax, 1:100, cumsum(randn(100)), cumsum(randn(100)) .+ 2)
    poly_row("band, 100 x-pts (1 ring)", masque(f))
end
let
    # Violin: one closed KDE ring per group — the densest per-element case.
    # Makie's default npoints=200 → each ring is ~400 boundary vertices.
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
    violin!(ax, repeat(1:3, 200), randn(600))
    poly_row("violin, 3 groups (~400 verts/ring)", masque(f))
end
let
    # Contourf: one element per filled polygon. A level with a hole ships the exterior and
    # each hole, so the vertex count includes both.
    # Default levels ≈ 8; each level may produce several ring pieces over the grid.
    xs = LinRange(-2, 2, 50)
    ys = LinRange(-2, 2, 50)
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
    contourf!(ax, xs, ys, [sin(x) * cos(y) for x in xs, y in ys])
    poly_row("contourf, 50×50, default levels", masque(f))
end
let
    # Same recipe with holes: a radial Gaussian. Four of the five polygons are an exterior
    # plus one hole, so the vertex count includes both rings of each element.
    xg = LinRange(-2, 2, 40)
    yg = LinRange(-2, 2, 40)
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
    contourf!(ax, xg, yg, [exp(-(x^2 + y^2)) for x in xg, y in yg]; levels = 5)
    poly_row("contourf, 40×40 Gaussian, levels=5", masque(f))
end

println("\n=== G. text labels — :rects box (4 ints) + (; text, index, x, y) payload ===")
# Text labels reuse v1's :rects primitive (no new geometry kind); the only new wire term is the
# payload's string `text` field. masque(fig) auto-detects text! as id=:text (src/introspect.jl).
function text_row(label, w)
    textlayers = filter(l -> l["id"] == "text", w.manifest["layers"])
    isempty(textlayers) && (println("  $label — no text layer"); return)
    n_elems = sum(nhits, textlayers; init = 0)
    geom_b = sum(mp(l["geometry"]) for l in textlayers; init = 0)
    pl_b = sum(mp(l["payloads"]) for l in textlayers; init = 0)
    return @printf(
        "  %-40s  png=%6s KB   manifest=%6s KB   labels=%4d  ~%3d B/label (geom=%dB payload=%dB)\n",
        label, kb(b64bytes(w)), kb(mp(w.manifest)), n_elems,
        round(Int, (geom_b + pl_b) / max(n_elems, 1)),
        round(Int, geom_b / max(n_elems, 1)), round(Int, pl_b / max(n_elems, 1))
    )
end
let
    # Small labelled-scatter picker (matches the demo cell shape) — the realistic case.
    n = 5
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
    xs, ys = rand(n) .* 10, rand(n) .* 10
    scatter!(ax, xs, ys)
    text!(ax, xs, ys; text = ["Label $(k)" for k in 1:n], fontsize = 16)
    text_row("scatter+labels, $n labels", masque(f))
end
let
    # A denser label grid — still low-N vs. scatter (labels are inherently sparse: legible text
    # needs screen-space room, unlike point markers).
    n = 100
    f = Figure(size = (900, 700)); ax = Axis(f[1, 1])
    xs, ys = rand(n) .* 10, rand(n) .* 10
    text!(ax, xs, ys; text = ["L$(k)" for k in 1:n], fontsize = 10)
    text_row("text-only, $n labels", masque(f))
end
let
    # The same 100 labels on an Axis3 (#292): each adds `z` to its payload and one index to the
    # layer's front-to-back `order`.
    n = 100
    f = Figure(size = (900, 700)); ax = Axis3(f[1, 1])
    xs, ys, zs = rand(n) .* 10, rand(n) .* 10, rand(n) .* 10
    text!(ax, xs, ys, zs; text = ["L$(k)" for k in 1:n], fontsize = 10)
    w = masque(f)
    text_row("text-only on Axis3, $n labels", w)
    o = only(filter(l -> l["id"] == "text", w.manifest["layers"]))["order"]
    @printf("  %-40s  order=%dB\n", "", mp(o))
end

println("\n=== H. slice series — data-space Float64 xy (not integer px) ===")
# SliceInteractable ships the probe series as Float64, not the quantized Int geometry every
# other kind uses. One series of N vertices is 2N float64s (9 B each on the wire) plus a
# small dict. View gestures rebuild the whole manifest each frame, so this term is paid again
# on every camera move when a slice is present.
let
    for n in (100, 1_000)
        f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
        xs = collect(range(0, 1; length = n))
        ys = sin.(xs)
        s = SliceInteractable(ax; series = [(; id = :curve, x = xs, y = ys)])
        w = masque(f, s)
        layer = only(filter(l -> l["kind"] == "slice", w.manifest["layers"]))
        xy_b = mp(layer["geometry"]["series"][1]["xy"])
        @printf(
            "  %-40s  png=%6s KB   manifest=%6s KB   xy=%6s KB  (%d pts)\n",
            "slice, 1 series", kb(b64bytes(w)), kb(mp(w.manifest)), kb(xy_b), n,
        )
    end
end
println("\n=== I. line readout samples — data-space Float32 x, y beside integer-px geometry ===")
# A 2D `lines` layer ships each path's data samples (`points`) so the hover readout shows the
# plotted value, not one inverted from rounded pixels (#262). Each sample is two Float32s
# (5 B each on the wire); the drawn geometry is integer pixels (1-3 B per coordinate).
let
    for n in (100, 1_000, 10_000)
        f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
        lines!(ax, 1:n, cumsum(randn(n)))
        w = masque(f)
        layer = only(filter(l -> l["kind"] == "lines", w.manifest["layers"]))
        g_b, p_b = mp(layer["geometry"]), mp(layer["points"])
        @printf(
            "  %-40s  manifest=%7s KB   geometry=%7s KB   points=%7s KB  (×%.1f)\n",
            "lines, $n pts", kb(mp(w.manifest)), kb(g_b), kb(p_b), (g_b + p_b) / g_b,
        )
    end
    # On an Axis3 (#502) each sample also ships its `z` (`zpoints`), one more Float32. Its own
    # RNG, so the sections after this one draw the same numbers as before it was added.
    rng = Random.Xoshiro(502)
    for n in (100, 1_000, 10_000)
        f = Figure(size = (600, 450)); ax = Axis3(f[1, 1])
        lines!(ax, range(0, 10; length = n), cumsum(randn(rng, n)), cumsum(randn(rng, n)))
        w = masque(f)
        layer = only(filter(l -> l["kind"] == "lines", w.manifest["layers"]))
        g_b, p_b = mp(layer["geometry"]), mp(layer["points"]) + mp(layer["zpoints"])
        @printf(
            "  %-40s  manifest=%7s KB   geometry=%7s KB   points=%7s KB  (×%.1f)\n",
            "lines on Axis3, $n pts", kb(mp(w.manifest)), kb(g_b), kb(p_b), (g_b + p_b) / g_b,
        )
    end
end
println("\n=== J. surface on Axis3 — projected vertex grid, depth order, thinned to a fixed stride ===")
# A `:surface` layer (#259) ships each shipped point's integer-px `xy`, its Float32 `z` (and
# `x`/`y` per point for a matrix grid, or `value` for a separate colour matrix), and one quad
# index per quad in depth order. A dense grid is thinned to one point per
# SURFACE_MIN_SCREEN_PX of the axis's longer side. Build time is the layer's own `hitlayers`
# call (projection, quantize, depth sort), best of 5, which every orbit settle frame repeats.
let
    sbump(n) = (xs = range(-3, 3; length = n); (xs, xs, [exp(-(a^2 + b^2) / 2) + 0.1sin(3a) for a in xs, b in xs]))
    for n in (50, 100, 200, 500, 1000), form in (:vector, :matrix, :value)
        xs, ys, zs = sbump(n)
        f = Figure(size = (600, 450)); ax = Axis3(f[1, 1])
        X = form === :matrix ? [x for x in xs, _ in ys] : xs
        Y = form === :matrix ? [y for _ in xs, y in ys] : ys
        form === :value ? surface!(ax, X, Y, zs; color = zs .^ 2) : surface!(ax, X, Y, zs)
        w = masque(f)
        layer = only(filter(l -> l["kind"] == "surface", w.manifest["layers"]))
        g = layer["geometry"]
        Makie.update_state_before_display!(f)
        bk = Masque._resolve_backend(:cairo)
        ctx = Masque.context(bk, f, Masque._ppu(bk, f, 700), 700)
        si = only(filter(i -> i isa SurfaceInteractable, interactables(f)))
        Masque.hitlayers(si, ctx)
        ms = minimum(@elapsed(Masque.hitlayers(si, ctx)) for _ in 1:5) * 1000
        @printf(
            "  %-30s  shipped=%4d×%-4d  manifest=%7s KB   layer=%7s KB  (%.1f B/pt)   build=%6.1f ms\n",
            "surface $(n)×$(n), $(form)", g["ni"], g["nj"], kb(mp(w.manifest)), kb(mp(layer)),
            mp(layer) / (g["ni"] * g["nj"]), ms,
        )
    end
end
println("\n=== K. select = :many — the `many` flag, and the bond value the browser sends ===")
# A `:many` layer (#335) adds one `many` flag to the manifest. Its bond value is
# `{items: [{layer, index}, …]}`, one entry per pick, sent from the browser on each click; that
# value's MsgPack size is what Pluto carries back to Julia.
let n = 1_000
    f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
    sc = scatter!(ax, rand(n), rand(n); markersize = 6)
    one, many = masque(f; bind = sc), masque(f, interactables(sc; select = :many); bind = sc)
    @printf("  manifest, scatter %d:  :one %s B   :many %s B\n", n, mp(one.manifest), mp(many.manifest))
    for k in (1, 100, 1_000)
        v = Dict("scatter" => Dict("items" => [Dict("layer" => "scatter", "index" => i - 1) for i in 1:k]))
        @printf("  bond value, %5d picks:  %8.1f KB  (%.1f B/pick)\n", k, mp(v) / 1024, mp(v) / k)
    end
end
println("\n=== L. points on Axis3 — top-first `order` and sphere `ellipses` ===")
# Overlapping marks answer with the one drawn on top (#331). On an Axis3 a `meshscatter!` layer
# ships a top-first `order` (one index per drawn point) on both backends, and on WebGL a
# `scatter!` layer does too. A sphere also ships its drawn outline as an ellipse, three
# integers in image px² (`ellipses`), on any axis.
let
    for (kind, n) in ((:scatter, 1_000), (:meshscatter, 100), (:meshscatter, 1_000))
        f = Figure(size = (600, 450)); ax = Axis3(f[1, 1])
        xs, ys, zs = rand(n), rand(n), rand(n)
        kind === :scatter ? scatter!(ax, xs, ys, zs) : meshscatter!(ax, xs, ys, zs; markersize = 0.02)
        w = masque(f)
        layer = only(w.manifest["layers"])
        o = get(layer, "order", nothing); e = get(layer, "ellipses", nothing)
        @printf(
            "  %-28s  manifest=%6s KB   geometry=%6s KB   order=%6s KB   ellipses=%6s KB\n",
            "$(kind) $(n) on Axis3", kb(mp(w.manifest)), kb(mp(layer["geometry"])),
            o === nothing ? "-" : kb(mp(o)), e === nothing ? "-" : kb(mp(e)),
        )
    end
end

println("\n=== L. regions on a grid — each cell's region id, as runs over the cells ===")
# `regions = R` (#359) ships `regions`, flat `[id, n, …]` pairs over the row-major cells, so it
# costs about one pair per region boundary crossed along each row. Three shapes: a label image of
# round objects on a background, a crop cut into small fragments (a mask editor's), and a whole
# image cut into fragments, the uncropped worst case.
let
    f = Figure(size = (600, 600)); ax = Axis(f[1, 1])
    for n in (512, 2048)
        Random.seed!(1)
        R = zeros(Int, n, n)
        r = n ÷ 40
        for k in 1:200
            cx, cy = rand(1:n), rand(1:n)
            for i in max(1, cx - r):min(n, cx + r), j in max(1, cy - r):min(n, cy + r)
                (i - cx)^2 + (j - cy)^2 <= r^2 && (R[i, j] = k)
            end
        end
        hm = heatmap!(ax, rand(Float32, n, n))
        plain = masque(f, (cells = interactables(hm),))
        labels = masque(f, (cells = interactables(hm; regions = R),))
        @printf(
            "  %4d×%-4d label image, 200 objects:  manifest %8.1f KB  → %8.1f KB with regions\n",
            n, n, mp(plain.manifest) / 1024, mp(labels.manifest) / 1024
        )
        delete!(ax, hm)
    end
    # 121×121 cut into 4×4 blocks: 961 fragments, the densest case a crop editor ships.
    n = 121
    R = [(i - 1) ÷ 4 + ((j - 1) ÷ 4) * cld(n, 4) + 1 for i in 1:n, j in 1:n]
    hm = heatmap!(ax, rand(Float32, n, n))
    plain = masque(f, (cells = interactables(hm; select = :many),))
    frags = masque(f, (cells = interactables(hm; select = :many, regions = R),))
    @printf(
        "  %d×%d crop, %d fragments:     manifest %8.1f KB  → %8.1f KB with regions\n",
        n, n, maximum(R), mp(plain.manifest) / 1024, mp(frags.manifest) / 1024
    )
    delete!(ax, hm)
    # A whole 2048×2048 image cut into square fragments, the uncropped worst case: the runs cost
    # one pair per fragment edge per row. Each pick's value is decoded into a `GridSelection`
    # that names the regions it holds whole; time that decode for a mask of half the grid.
    n = 2048
    for s in (16, 8)
        R = [(i - 1) ÷ s + ((j - 1) ÷ s) * cld(n, s) + 1 for i in 1:n, j in 1:n]
        hm = heatmap!(ax, rand(Float32, n, n))
        plain = masque(f, (cells = interactables(hm; select = :many),))
        frags = masque(f, (cells = interactables(hm; select = :many, regions = R),))
        g = only(l for l in frags.manifest["layers"] if l["id"] == "cells")["geometry"]
        env = Dict("runs" => [x for j in 0:(n ÷ 2 - 1) for x in (j, 0, n)])
        Masque._grid_selection(:cells, env, n, n, g)
        t = @elapsed sel = Masque._grid_selection(:cells, env, n, n, g)
        a = @allocated Masque._grid_selection(:cells, env, n, n, g)
        @printf(
            "  %d×%d image, %5d fragments of %d×%d:  manifest %8.1f KB  → %8.1f KB with regions;  decode %6.1f ms, %5.1f MB (%d regions held)\n",
            n, n, maximum(R), s, s, mp(plain.manifest) / 1024, mp(frags.manifest) / 1024, 1000t, a / 2^20, length(sel.regions)
        )
        delete!(ax, hm)
    end
end

println("\n=== M. linked(...) — one group of plots, its rows, and the value ===")
# A `linked(...)` group (#346) adds one `groups` entry and a `group` tag per member layer. By
# position it ships no rows; with `key` each member ships each mark's row, about one small
# integer per mark. The value is `{rows: [...]}`, one 0-based row per pick, and Julia turns it
# into the keys by rebuilding the key table from the payloads.
let n = 10_000
    f = Figure(size = (700, 340)); a1, a2 = Axis(f[1, 1]), Axis(f[1, 2])
    x, y = rand(n), rand(n)
    s1 = scatter!(a1, x, y; markersize = 4); s2 = scatter!(a2, y, x; markersize = 4)
    ids = [(; id = "cell$i") for i in 1:n]
    two = masque(f, (u = interactables(s1; select = :many), p = interactables(s2; select = :many)))
    pos = masque(f, (cells = linked(s1, s2; select = :many),))
    plain_ids = masque(f, (u = interactables(s1; select = :many, payloads = ids), p = interactables(s2; select = :many, payloads = reverse(ids))))
    keyed = masque(f, (cells = linked(interactables(s1; payloads = ids), interactables(s2; payloads = reverse(ids)); key = :id, select = :many),))
    g = only(keyed.manifest["groups"])
    @printf("  two :many scatters of %d:     manifest %8.1f KB\n", n, mp(two.manifest) / 1024)
    @printf("  the same, linked by position:  manifest %8.1f KB\n", mp(pos.manifest) / 1024)
    @printf("  two :many scatters with ids:   manifest %8.1f KB\n", mp(plain_ids.manifest) / 1024)
    @printf("  the same, linked by id:        manifest %8.1f KB  (rows %.1f KB)\n", mp(keyed.manifest) / 1024, mp(g["rows"]) / 1024)
    mount = Dict{String, Any}(Masque.mount_envelope(keyed.manifest))
    for k in (1, 100, 5_000)
        v = Dict{String, Any}("cells" => Dict("rows" => collect(0:(k - 1))))
        env = merge(mount, v)
        Masque.bond_from_js(keyed, env)
        t = @elapsed Masque.bond_from_js(keyed, env)
        @printf("  value, %5d rows:  %7.1f KB  (%.1f B/row);  Julia decode by id %6.1f ms\n", k, mp(v) / 1024, mp(v) / k, 1000t)
    end
end

println()
