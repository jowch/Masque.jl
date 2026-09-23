# Shared by contourf_holes_cairo.jl and contourf_holes_webgl.jl.
# A radial Gaussian (holes contain the next level) and a two-peak field whose peaks sit
# above the top edge (those holes are empty).
function build_contourf_holes()
    xs = range(-2, 2, length = 40)
    ys = range(-2, 2, length = 40)
    fig = Figure(; size = (480, 400))
    ax = Axis(fig[1, 1]; limits = (-2, 2, -2, 2))
    contourf!(ax, xs, ys, [exp(-(x^2 + y^2)) for x in xs, y in ys]; levels = 5)
    gaussian = masque(fig)

    xs2 = range(-3, 3, length = 50)
    ys2 = range(-2, 2, length = 40)
    fig2 = Figure(; size = (480, 360))
    ax2 = Axis(fig2[1, 1]; limits = (-3, 3, -2, 2))
    z2 = [exp(-((x - 1.2)^2 + y^2)) + exp(-((x + 1.2)^2 + y^2)) for x in xs2, y in ys2]
    contourf!(ax2, xs2, ys2, z2; levels = [0.2, 0.5, 0.9])
    peaks = masque(fig2)
    return (; gaussian, peaks)
end
