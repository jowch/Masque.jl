# Shared figures for the `selects`-box notebooks (Cairo / WGL), driven by roi_grid_click.mjs.
# The box owns the `@bind` value: a click on its target layer outside the box must not replace
# what the box holds (a `GridWindowEvent`, or a `Vector{ElementEvent}` over points). The image is
# 12 × 8 cells so a cell is many screen pixels wide and a click lands on one cell for sure.

function build_roi_grid()
    nx, ny = 12, 8
    vals = [Float64(i + 10 * j) for i in 1:nx, j in 1:ny]
    fig = Figure(size = (480, 320))
    ax = Axis(fig[1, 1]; title = "roi over grid", limits = (0, nx, 0, ny))
    heatmap!(ax, 0 .. Float64(nx), 0 .. Float64(ny), vals)
    return masque(
        fig,
        [
            RectInteractable(ax; grid = (collect(0.0:1.0:nx), collect(0.0:1.0:ny), vals), id = :img),
            ROIInteractable(ax; bounds = (2.0, 6.0, 2.0, 6.0), selects = :img, id = :roi),
        ],
    )
end

function build_roi_points()
    pts = [(1.0, 1.0), (3.0, 3.0), (5.0, 5.0), (7.0, 7.0), (9.0, 9.0)]
    fig = Figure(size = (480, 320))
    ax = Axis(fig[1, 1]; title = "roi over points", limits = (0, 10, 0, 10))
    scatter!(ax, first.(pts), last.(pts); markersize = 16, color = :gray)
    return masque(
        fig,
        [
            PointInteractable(ax, pts; id = :pts, payloads = ["a", "b", "c", "d", "e"]),
            ROIInteractable(ax; bounds = (2.0, 6.0, 2.0, 6.0), selects = :pts, id = :roi),
        ],
    )
end

roi_grid_meta(w) = Dict(
    "width" => w.manifest["width"], "height" => w.manifest["height"],
    "selection" => get(w.manifest, "selection", nothing),
    "selectionTarget" => get(w.manifest, "selectionTarget", nothing),
    "layers" => w.manifest["layers"],
)

# The readout the docs gallery cell does: `region.i1:region.i2` throws on a `GridCellEvent`.
function roi_grid_readout(region)
    region === nothing && return "nothing"
    isempty(region.i1:region.i2) && return "empty"
    return "i=$(region.i1):$(region.i2) j=$(region.j1):$(region.j2)"
end

# A cell that reads the brushed points the way the docs box-select example does.
function roi_points_readout(picks)
    picks === nothing && return "nothing"
    return "n=$(length(picks)) $(join((p.payload for p in picks), ","))"
end
