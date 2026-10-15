# `onchange` frames (#334): the shipped gesture closure called directly, as in
# bench/gesture_channel.jl. Each frame runs the function, rebuilds the plan and the manifest, and
# renders. The pan frame on the same figure is the baseline: an `onchange` frame should cost
# what a pan frame costs plus the function itself.
#
# Run: julia --project="${MASQUE_DEV_ENV:-$HOME/.julia/environments/masque-dev}" bench/onchange_frames.jl [cairo|webgl]

using Masque, Printf, Random
backend = get(ARGS, 1, "cairo")
backend == "webgl" ? (using WGLMakie) : (using CairoMakie)
Random.seed!(0)
include(joinpath(@__DIR__, "mpsize.jl"))
backend == "webgl" && include(joinpath(@__DIR__, "pluto_packed.jl"))

p50(v) = sort(v)[cld(length(v), 2)]
input(cut; settle) = Dict{String, Any}(
    "onchange" => true, "settle" => settle,
    "state" => Dict{String, Any}("cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => cut)),
)

function timed(f, n)
    f()
    ms = Float64[]
    for _ in 1:n
        t0 = time_ns()
        f()
        push!(ms, (time_ns() - t0) / 1.0e6)
    end
    return p50(ms)
end

# A 10k-point scatter, a line the function refits, and a threshold that drives it. On WebGL two
# 300×300 heatmaps sit beside it, so the frame's scene is large while only the line changes.
fig = Figure(size = (700, 400))
ax = Axis(fig[1, 1])
x = randn(10_000)
y = 2 .* x .+ randn(10_000)
sc = scatter!(ax, x, y; markersize = 3)
fit = lines!(ax, [-4.0, 4.0], [0.0, 0.0]; color = :crimson)
if backend == "webgl"
    heatmap!(Axis(fig[1, 2]), randn(300, 300))
    heatmap!(Axis(fig[1, 3]), randn(300, 300))
end
cutoff = ThresholdInteractable(ax; orientation = :vertical, value = 0.0)
refit(st) = begin
    keep = x .> st.cutoff.value
    b = sum((x[keep] .- sum(x[keep]) / count(keep)) .* y[keep]) / sum((x[keep] .- sum(x[keep]) / count(keep)) .^ 2)
    a = sum(y[keep]) / count(keep) - b * sum(x[keep]) / count(keep)
    update!(fit, [-4.0, 4.0], [a - 4b, a + 4b])
end
w = masque(
    fig, (pts = interactables(sc), cutoff = cutoff), ViewInteractable(ax);
    backend = Symbol(backend), onchange = refit,
)
Masque._sync_view_warmup!(w.render_frame)

n = 10
drag = timed(() -> w.render_frame(input(0.5; settle = false)), n)
rel = timed(() -> w.render_frame(input(0.5; settle = true)), n)
fl = Masque._finallimits(ax)
pan(settle) = Dict{String, Any}(
    "id" => "view", "xmin" => fl.origin[1] + 0.1, "xmax" => fl.origin[1] + 0.1 + fl.widths[1],
    "ymin" => fl.origin[2], "ymax" => fl.origin[2] + fl.widths[2], "settle" => settle,
)
pdrag = timed(() -> w.render_frame(pan(false)), n)
prel = timed(() -> w.render_frame(pan(true)), n)
a = w.render_frame(input(0.5; settle = false))
b = w.render_frame(input(0.5; settle = true))
@printf("%s onchange frame p50: in-drag %.0f ms, release %.0f ms (pan: %.0f / %.0f ms)\n", backend, drag, rel, pdrag, prel)
@printf("manifest %.0f KB (MsgPack)\n", mp(b["manifest"]) / 1024)
if backend == "webgl"
    @printf("scene %.0f KB packed\n", packed_bytes(b["scene"]) / 1024)
else
    @printf("PNG in-drag %.0f KB, release %.0f KB\n", length(a["png"]) / 1024, length(b["png"]) / 1024)
end
