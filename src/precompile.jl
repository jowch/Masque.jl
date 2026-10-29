# A notebook's first widget, first pick and first drag each compile Masque's code for the
# figure's plot types, which took 15-25 s, ~1 s and 5-9 s before this ran at precompile time.
# Each backend extension calls `_precompile_workload` inside its `@compile_workload`, so the
# Makie types it builds are those the backend sees. Keep it to the common kinds; a rare one
# compiles on first use, as before.
#
# `PrecompileTools`' own per-package switch doesn't reach an extension, so Masque reads the same
# `precompile_workload` preference itself; a change recompiles Masque and both extensions.
const _PRECOMPILE_WORKLOAD = Preferences.@load_preference("precompile_workload", true)::Bool

function _precompile_figure()
    xs = collect(1.0:8.0)
    ys = sin.(xs)
    fig = Makie.Figure(; size = (500, 300))
    ax = Makie.Axis(fig[1, 1])
    sc = Makie.scatter!(ax, xs, ys; label = "pts")
    fit = Makie.lines!(ax, xs, cos.(xs); label = "line")
    Makie.barplot!(ax, xs, abs.(ys) ./ 2)
    Makie.Legend(fig[1, 2], ax)
    ax2 = Makie.Axis(fig[2, 1])
    hm = Makie.heatmap!(ax2, reshape(collect(1.0:12.0), 3, 4))
    Makie.Colorbar(fig[2, 2], hm)
    ax3 = Makie.Axis3(fig[1:2, 3])
    Makie.scatter!(ax3, xs, ys, cos.(xs))
    Makie.lines!(ax3, xs, ys, cos.(xs))
    ax4 = Makie.Axis(fig[3, 1])
    Makie.scatter!(ax4, [1, 2, 3], [4, 5, 6])
    Makie.poly!(ax4, Makie.Point2f[(0, 0), (1, 0), (1, 1)])
    Makie.text!(ax4, [1.5], [5.0]; text = ["a"])
    Makie.hlines!(ax4, [2.5])
    return (; fig, ax, sc, fit, ax2, ax3)
end

function _precompile_workload(backend::Symbol)
    # Zero-config: every plot auto-extracted.
    w = masque(_precompile_figure().fig; backend)
    repr(MIME"text/html"(), w)
    APD.Bonds.initial_value(w)
    _sync_view_warmup!(w.render_frame)

    # A pick, views on 2D and 3D axes, a threshold and a region, then their gestures. A fresh
    # figure: a WebGL widget's figure takes no new plots.
    (; fig, ax, sc, fit, ax2, ax3) = _precompile_figure()
    w = masque(
        fig,
        (
            pts = PointInteractable(ax, sc),
            cutoff = ThresholdInteractable(ax; value = 0.0),
            roi = ROIInteractable(ax2; bounds = (1.0, 2.0, 1.0, 2.0)),
            pan = ViewInteractable(ax),
            orbit = ViewInteractable(ax3),
        );
        backend, auto = false,
        onchange = st -> Makie.update!(fit, collect(1.0:8.0), fill(st.cutoff.value, 8)),
    )
    repr(MIME"text/html"(), w)
    _sync_view_warmup!(w.render_frame)
    start = Dict{String, Any}(mount_envelope(w.manifest))
    pick = merge(start, Dict{String, Any}("pts" => Dict{String, Any}("layer" => "pts", "index" => 2, "payload" => nothing)))
    APD.Bonds.transform_value(w, pick)
    w.render_frame(Dict{String, Any}("id" => "pan", "xmin" => 2.0, "xmax" => 7.0, "ymin" => -1.0, "ymax" => 1.0, "settle" => true))
    w.render_frame(Dict{String, Any}("id" => "orbit", "azimuth" => 0.7, "elevation" => 0.3, "settle" => true))
    empty!(_VIEW_WARMUPS)
    return nothing
end
