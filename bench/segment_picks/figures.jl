# Figures for click.mjs: the per-click and hover cost of many held segment picks (#478).
# The notebooks next to this file show them on one backend each; see click.mjs for the run.
include(joinpath(@__DIR__, "..", "selection_look", "figures.jl"))

# One short horizontal segment per row of `look_cells`, centred on its point.
seg_points(xs, ys; w = 0.08) = [p for i in eachindex(xs) for p in (Point2f(xs[i] - w, ys[i]), Point2f(xs[i] + w, ys[i]))]

function seg_panels(d)
    fig = Figure(size = (700, 340))
    a1 = Axis(fig[1, 1]; title = "UMAP")
    a2 = Axis(fig[1, 2]; title = "PCA")
    l1 = linesegments!(a1, seg_points(d.u1, d.u2); linewidth = 1)
    l2 = linesegments!(a2, seg_points(d.p1, d.p2); linewidth = 1)
    return fig, l1, l2
end

# Two panels of 10 000 segments as one `linked` group, the first 5 000 rows held.
function seg_linked(d = look_cells(); nsel = 5000)
    fig, l1, l2 = seg_panels(d)
    group = linked(interactables(l1; id = :umap), interactables(l2; id = :pca); select = :many)
    return masque(fig, (cells = group,); selected = (cells = collect(1:nsel),))
end

# The same panels as two separate `:many` fields, 5 000 held in each.
function seg_two(d = look_cells(); nsel = 5000)
    fig, l1, l2 = seg_panels(d)
    rows = collect(1:nsel)
    return masque(
        fig, interactables(l1; id = :umap, select = :many), interactables(l2; id = :pca, select = :many);
        selected = (umap = rows, pca = rows),
    )
end

# One panel, 5 000 of 10 000 held.
function seg_one(d = look_cells(); nsel = 5000)
    fig = Figure(size = (360, 340))
    ax = Axis(fig[1, 1])
    l = linesegments!(ax, seg_points(d.u1, d.u2); linewidth = 1)
    return masque(fig, interactables(l; id = :umap, select = :many); selected = (umap = collect(1:nsel),))
end

# The image px of segment k's midpoint (0-based) on layer `id`, for click.mjs.
function seg_at(w, id, k)
    L = only(filter(l -> string(l["id"]) == id, w.manifest["layers"]))
    g = L["geometry"]
    return [(g[4k + 1] + g[4k + 3]) / 2, (g[4k + 2] + g[4k + 4]) / 2]
end

# Where click.mjs clicks and hovers: an unheld segment on each widget (rows past 5 000), and a
# mark of the scatter `look_linked` group, the closed-mark baseline.
function seg_coords(linkedw, twow, onew, scatterw)
    g = only(filter(l -> string(l["id"]) == "umap", scatterw.manifest["layers"]))["geometry"]
    return (
        linked = seg_at(linkedw, "umap", 9999), linked_hover = seg_at(linkedw, "umap", 9000),
        two = seg_at(twow, "umap", 9999), one = seg_at(onew, "umap", 9999), scatter = [g[3 * 9999 + 1], g[3 * 9999 + 2]],
    )
end
