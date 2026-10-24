# Figures for click.mjs: the per-click cost of the selected look at 5 000 picks (#394), and of
# a linked group's click and hover (#346).
# The notebooks next to this file show them on one backend each; see click.mjs for the run.
using Random

function look_cells(n = 10_000; k = 8, seed = 1)
    rng = MersenneTwister(seed)
    cl = rand(rng, 1:k, n)
    cu = [(3cos(2π * c / k), 3sin(2π * c / k)) for c in 1:k]
    cp = [(c - k / 2, (-1)^c * 1.5) for c in 1:k]
    u1 = [cu[c][1] + 0.6randn(rng) for c in cl]
    u2 = [cu[c][2] + 0.6randn(rng) for c in cl]
    p1 = [cp[c][1] + 0.4randn(rng) for c in cl]
    p2 = [cp[c][2] + 0.4randn(rng) for c in cl]
    return (; n, k, cl, u1, u2, p1, p2)
end

# Two panels of 10 000 marks, the same 5 000 rows picked in both.
function look_brush(d = look_cells(); nsel = 5000)
    fig = Figure(size = (700, 340))
    a1 = Axis(fig[1, 1]; title = "UMAP")
    a2 = Axis(fig[1, 2]; title = "PCA")
    s1 = scatter!(a1, d.u1, d.u2; markersize = 4, color = d.cl, colormap = :tab10)
    s2 = scatter!(a2, d.p1, d.p2; markersize = 4, color = d.cl, colormap = :tab10)
    rows = collect(1:nsel)
    return masque(
        fig, interactables(s1; id = :umap, select = :many), interactables(s2; id = :pca, select = :many);
        selected = (umap = rows, pca = rows),
    )
end

# The same two panels as one `linked` group (#346), the same 5 000 rows picked: a click edits
# one row, and each panel draws every held row.
function look_linked(d = look_cells(); nsel = 5000)
    fig = Figure(size = (700, 340))
    a1 = Axis(fig[1, 1]; title = "UMAP")
    a2 = Axis(fig[1, 2]; title = "PCA")
    s1 = scatter!(a1, d.u1, d.u2; markersize = 4, color = d.cl, colormap = :tab10)
    s2 = scatter!(a2, d.p1, d.p2; markersize = 4, color = d.cl, colormap = :tab10)
    group = linked(interactables(s1; id = :umap), interactables(s2; id = :pca); select = :many)
    return masque(fig, (cells = group,); selected = (cells = collect(1:nsel),))
end

# One scatter per cluster in each panel and a legend whose entries name a cluster in both:
# hovering an entry previews about 1 250 marks per panel.
function look_legend(d = look_cells())
    fig = Figure(size = (760, 340))
    au = Axis(fig[1, 1]; title = "UMAP")
    ap = Axis(fig[1, 2]; title = "PCA")
    ints = []
    targets = Dict{String, Vector{Symbol}}()
    for c in 1:d.k
        rows = findall(==(c), d.cl)
        su = scatter!(au, d.u1[rows], d.u2[rows]; markersize = 4, label = "c$c")
        sp = scatter!(ap, d.p1[rows], d.p2[rows]; markersize = 4)
        idu, idp = Symbol("u$c"), Symbol("p$c")
        push!(ints, interactables(su; id = idu, select = :many), interactables(sp; id = idp, select = :many))
        targets["c$c"] = [idu, idp]
    end
    leg = Legend(fig[1, 3], au)
    push!(ints, LegendInteractable(leg; targets))
    return masque(fig, ints...)
end

# 100 000 marks, 5 000 picked.
function look_big(; n = 100_000, nsel = 5000)
    rng = MersenneTwister(3)
    fig = Figure(size = (420, 380))
    ax = Axis(fig[1, 1])
    s = scatter!(ax, randn(rng, n), randn(rng, n); markersize = 3, color = rand(rng, 1:8, n), colormap = :tab10)
    return masque(fig, interactables(s; id = :big, select = :many); selected = (big = collect(1:nsel),))
end

# The image px of one mark of each widget, and of the legend's first entry, for click.mjs.
function look_coords(brush, legend, big, link)
    at(w, id, k) = (L = only(filter(l -> string(l["id"]) == id, w.manifest["layers"])); g = L["geometry"]; [g[3k + 1], g[3k + 2]])
    leg = only(filter(l -> get(l, "links", nothing) !== nothing, legend.manifest["layers"]))
    return (
        brush = at(brush, "umap", 9999), legend = leg["geometry"][1:2], big = at(big, "big", 99_999),
        linked = at(link, "umap", 9999), linked_hover = at(link, "umap", 9998),
    )
end
