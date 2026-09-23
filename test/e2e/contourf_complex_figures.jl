# Shared by contourf_complex_cairo.jl and contourf_complex_webgl.jl.
# Busier than the gaussian: several holes in one band, an island in a hole, a dented ring.
function build_contourf_complex()
    xs = range(-3, 3, length = 80)
    ys = range(-3, 3, length = 80)
    centers = [(0.85, 0.0), (-0.42, 0.73), (-0.42, -0.73)]
    fig = Figure(; size = (480, 420))
    ax = Axis(fig[1, 1]; limits = (-3, 3, -3, 3), title = "pedestal")
    z = [
        0.22 * exp(-(x^2 + y^2) / 6) +
            sum(exp(-((x - cx)^2 + (y - cy)^2) / 0.18) for (cx, cy) in centers)
            for x in xs, y in ys
    ]
    contourf!(ax, xs, ys, z; levels = [0.12, 0.28, 0.65])
    pedestal = masque(fig)

    figb = Figure(; size = (480, 420))
    axb = Axis(figb[1, 1]; limits = (-3, 3, -3, 3), title = "bump")
    zb = [exp(-((hypot(x, y) - 1.6)^2) / 0.1) + 0.35 * exp(-(x^2 + y^2) / 0.15) for x in xs, y in ys]
    contourf!(axb, xs, ys, zb; levels = [0.15, 0.4, 0.8])
    bump = masque(figb)

    figd = Figure(; size = (480, 420))
    axd = Axis(figd[1, 1]; limits = (-3, 3, -3, 3), title = "dented")
    zd = [exp(-((hypot(x, y) - 1.4)^2) / 0.12) - 0.45 * exp(-((x - 1.4)^2 + y^2) / 0.08) for x in xs, y in ys]
    contourf!(axd, xs, ys, zd; levels = [0.2, 0.45, 0.7])
    dented = masque(figd)
    return (; pedestal, bump, dented)
end
