# Figures for hover.mjs: how long hovering a line takes to fade the axis's other lines (#464).
# The notebooks next to this file show them on one backend each; see hover.mjs for the run.
using Random

# Line k of n, `m` samples: a random walk lifted to its own height, so the lines stack and a
# pointer at a line's middle sample lands on that line.
walks(n, m; seed = 1) = (rng = MersenneTwister(seed); [k .+ 0.3 .* cumsum(randn(rng, m)) ./ sqrt(m) for k in 1:n])

# `n` lines of `m` samples drawn by one `series!`: one layer, a line per element.
function fade_series(n, m)
    fig = Figure(size = (700, 400))
    ax = Axis(fig[1, 1]; title = "series, $n × $m")
    Y = reduce(vcat, permutedims.(walks(n, m)))
    s = series!(ax, 1:m, Y; color = :tab10)
    return masque(fig, interactables(s; id = :s))
end

# `n` lines of `m` samples, one `lines!` each: a layer per line.
function fade_lines(n, m)
    fig = Figure(size = (700, 400))
    ax = Axis(fig[1, 1]; title = "lines!, $n × $m")
    ps = [lines!(ax, 1:m, y) for y in walks(n, m)]
    return masque(fig, (interactables(p; id = Symbol("l$k")) for (k, p) in enumerate(ps))...)
end

const FADE_CASES = [
    (:series, 10, 100), (:series, 10, 1000), (:series, 10, 10_000),
    (:series, 100, 100), (:series, 100, 1000), (:series, 1000, 100),
    (:lines, 10, 1000), (:lines, 100, 1000),
]

fade_widgets() = [(kind == :series ? fade_series : fade_lines)(n, m) for (kind, n, m) in FADE_CASES]

# For each widget, the image px of the middle sample of its first and last line, and the
# number of vertices its manifest ships, for hover.mjs.
function fade_coords(ws)
    return map(zip(FADE_CASES, ws)) do ((kind, n, m), w)
        Ls = filter(l -> l["kind"] == "lines", w.manifest["layers"])
        g(L, k) = L["geometry"][k]
        first_, last_ = kind == :series ? (g(only(Ls), 1), g(only(Ls), n)) : (g(Ls[1], 1), g(Ls[end], 1))
        mid(v) = (j = 2 * (length(v) ÷ 4); [v[j + 1], v[j + 2]])
        (; name = "$kind $n×$m", a = mid(first_), b = mid(last_), vertices = sum(L -> sum(length, L["geometry"]) ÷ 2, Ls))
    end
end
