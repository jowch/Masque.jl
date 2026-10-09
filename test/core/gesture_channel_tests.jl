using Test, Masque, CairoMakie, Makie, FileIO
include(joinpath(@__DIR__, "..", "testutils.jl"))

# `show` publishes the manifest through Pluto. A bare `IOBuffer` refuses that, so the ordering
# test supplies the hook Pluto puts on the display IO. `with_js_link` stays unsupported here;
# the mount `<img>` does not need it.
function _pluto_display_io()
    buf = IOBuffer()
    io = IOContext(buf, :pluto_published_to_js => (io, x) -> print(io, "null"))
    return io, buf
end

@testset "Gesture channel (#102)" begin
    @testset "no ViewInteractable -> no render_frame" begin
        (; fig, ax, pts) = default_fixture()
        w = masque(fig, [PointInteractable(ax, pts)]; auto = false)
        @test w.render_frame === nothing
    end

    @testset "2D pan: frame + manifest travel together, ppu drops during the gesture" begin
        fig = Figure(size = (600, 400))
        ax = Axis(fig[1, 1])
        pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]
        scatter!(ax, first.(pts), last.(pts))
        w = masque(fig, [ViewInteractable(ax), PointInteractable(ax, pts)]; auto = false)
        @test w.render_frame isa Function

        aid = only(k for (k, t) in w.manifest["transforms"] if t["is3d"] == false)
        t0 = w.manifest["transforms"][aid]
        xlims0, ylims0 = t0["xlims"], t0["ylims"]

        new_xmin, new_xmax = xlims0[1] - 1.0, xlims0[2] - 1.0
        new_ymin, new_ymax = ylims0[1] + 0.5, ylims0[2] + 0.5
        resp = w.render_frame(
            Dict(
                "id" => "view", "xmin" => new_xmin, "xmax" => new_xmax,
                "ymin" => new_ymin, "ymax" => new_ymax, "settle" => false,
            ),
        )
        @test haskey(resp, "png") && resp["png"] isa Vector{UInt8} && !isempty(resp["png"])
        @test haskey(resp, "manifest")   # §12.4/§12.5: a camera-moving frame always ships a manifest

        # Coherence (tripwire #1): the returned manifest's own transform reflects the NEW
        # camera, not a stale one — build_manifest re-derives it from ax.limits[], which the
        # closure just mutated.
        m2 = resp["manifest"]
        t2 = m2["transforms"][aid]
        @test t2["xlims"][1] ≈ new_xmin atol = 1.0e-6
        @test t2["xlims"][2] ≈ new_xmax atol = 1.0e-6
        @test t2["ylims"][1] ≈ new_ymin atol = 1.0e-6
        @test t2["ylims"][2] ≈ new_ymax atol = 1.0e-6
        # The manifest's own coordinate space (viewBox/scaling) stays pinned to the MOUNT ppu
        # across every frame — only the render resolution drops — so width/height/scaling never
        # move even though the axis limits did.
        @test m2["width"] == w.manifest["width"] && m2["height"] == w.manifest["height"]
        @test m2["scaling"] == w.manifest["scaling"]

        # ppu=1 mid-gesture vs the mount ppu on settle: decode both PNGs' pixel dimensions.
        img_gesture = FileIO.load(IOBuffer(resp["png"]))
        resp_settle = w.render_frame(
            Dict(
                "id" => "view", "xmin" => new_xmin, "xmax" => new_xmax,
                "ymin" => new_ymin, "ymax" => new_ymax, "settle" => true,
            ),
        )
        img_settle = FileIO.load(IOBuffer(resp_settle["png"]))
        @test size(img_settle, 1) > size(img_gesture, 1)
        @test size(img_settle, 2) > size(img_gesture, 2)

        # Mutating the axis limits for a frame is real (not throwaway): the underlying `ax` is
        # the same object the notebook's own `fig` holds, matching the "camera stays wherever
        # the gesture left it until the cell re-runs" contract (§12.3/§12.8).
        @test ax.limits[][1] ≈ new_xmin atol = 1.0e-6
    end

    @testset "3D orbit: azimuth/elevation drive the same axis live" begin
        fig = Figure(size = (400, 400))
        ax = Axis3(fig[1, 1])
        scatter!(ax, Makie.Point3f[(1, 2, 3), (4, 5, 6)])
        w = masque(fig, [ViewInteractable(ax)]; auto = false)
        @test w.render_frame isa Function

        resp = w.render_frame(Dict("id" => "view", "azimuth" => 0.7, "elevation" => 0.2, "settle" => false))
        @test ax.azimuth[] ≈ 0.7 atol = 1.0e-9
        @test ax.elevation[] ≈ 0.2 atol = 1.0e-9
        view_layer = only(l for l in resp["manifest"]["layers"] if l["kind"] == "view")
        @test view_layer["geometry"]["azimuth"] ≈ 0.7 atol = 1.0e-9
        @test view_layer["geometry"]["elevation"] ≈ 0.2 atol = 1.0e-9
    end

    @testset "3D zoom and pan move the limits (#321)" begin
        fig = Figure(size = (400, 400))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5)
        pts = Makie.Point3f[(0, 0, 0), (1, 1, 1), (0.5, 0.5, 0.5)]
        scatter!(ax, pts)
        w = masque(fig, [ViewInteractable(ax), PointInteractable(ax, pts)]; auto = false)
        g = only(l for l in w.manifest["layers"] if l["kind"] == "view")["geometry"]
        lim = g["limits"]
        @test length(lim) == 6 && lim[1] < 0 && lim[2] > 1 && lim[5] < 0 && lim[6] > 1

        # `panx`/`pany` move the picture one image px right/down: check against the projection.
        bk = Masque._resolve_backend(:cairo)
        ctx = Masque.context(bk, fig, Masque._ppu(bk, fig, 700), 700)
        c = Point3d((lim[1] + lim[2]) / 2, (lim[3] + lim[4]) / 2, (lim[5] + lim[6]) / 2)
        q0 = data_to_image_px(ctx, ax, c)
        qx = data_to_image_px(ctx, ax, c .+ 20 .* Point3d(g["panx"]...))
        qy = data_to_image_px(ctx, ax, c .+ 20 .* Point3d(g["pany"]...))
        @test qx[1] - q0[1] ≈ 20 atol = 0.5
        @test qx[2] - q0[2] ≈ 0 atol = 0.5
        @test qy[1] - q0[1] ≈ 0 atol = 0.5
        @test qy[2] - q0[2] ≈ 20 atol = 0.5

        # Zoom: limits around the middle point. The corners fall outside and stop hitting.
        zl = Float64[0.4, 0.6, 0.4, 0.6, 0.4, 0.6]
        resp = w.render_frame(Dict("id" => "view", "limits" => zl, "settle" => true))
        fl = ax.finallimits[]
        @test collect(minimum(fl)) ≈ [0.4, 0.4, 0.4] atol = 1.0e-6
        @test collect(maximum(fl)) ≈ [0.6, 0.6, 0.6] atol = 1.0e-6
        @test ax.azimuth[] ≈ 0.4 atol = 1.0e-9
        m = resp["manifest"]
        @test only(l for l in m["layers"] if l["kind"] == "view")["geometry"]["limits"] ≈ zl atol = 1.0e-6
        circ = only(l for l in m["layers"] if l["kind"] == "circles")["geometry"]
        @test all(isnan, circ[[1, 2, 4, 5]])   # centres; the pixel radius stays
        @test all(isfinite, circ[7:9])

        # An orbit after a zoom keeps the zoomed limits.
        w.render_frame(Dict("id" => "view", "azimuth" => 0.9, "elevation" => 0.3, "settle" => false))
        @test collect(maximum(ax.finallimits[])) ≈ [0.6, 0.6, 0.6] atol = 1.0e-6
        @test_throws ArgumentError w.render_frame(Dict("id" => "view", "limits" => [1.0, 0.0, 0, 1, 0, 1]))
    end

    @testset "a line crossing the zoomed limits keeps its drawn part (#321)" begin
        box = ((0.4, 0.4, 0.4), (0.6, 0.6, 0.6))
        @test all(Masque._clip_segment(box, (0, 0, 0), (1, 1, 1)) .≈ (0.4, 0.6))
        @test Masque._clip_segment(box, (0, 0, 0), (0.1, 0.1, 0.1)) === nothing
        @test Masque._clip_segment(box, (0.5, 0, 0.5), (0.5, 1, 0.5)) == (0.4, 0.6)   # parallel to two faces
        @test Masque._clip_segment(box, (0.7, 0, 0.5), (0.7, 1, 0.5)) === nothing

        fig = Figure(size = (400, 400))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5)
        lines!(ax, [0, 0.5, 1], [0, 0.5, 1], [0, 0.5, 1])
        path = [(0, 0, 0), (0.5, 0.5, 0.5), (1, 1, 1)]
        w = masque(
            fig, [
                ViewInteractable(ax),
                SegmentInteractable(ax, path; id = :edges),
                SegmentInteractable(ax, [(0, 0, 0), (0.1, 0.1, 0.1), (0, 0, 0), (1, 1, 1)]; mode = :pairs, id = :pairs),
            ]
        )
        lay(m, id) = only(l for l in m["layers"] if l["id"] == id)
        @test lay(w.manifest, "edges")["kind"] == "polyline"   # nothing cut yet
        m = w.render_frame(Dict("id" => "view", "limits" => [0.4, 0.6, 0.4, 0.6, 0.4, 0.6], "settle" => true))["manifest"]
        bk = Masque._resolve_backend(:cairo)
        ctx = Masque.context(bk, fig, Masque._ppu(bk, fig, 700), 700)
        px(p) = collect(data_to_image_px(ctx, ax, p))
        a, mid, b = px((0.4, 0.4, 0.4)), px((0.5, 0.5, 0.5)), px((0.6, 0.6, 0.6))

        # The plotted line: one run from where it enters the box to where it leaves.
        g = only(lay(m, "lines")["geometry"])
        @test length(g) == 6 && all(isfinite, g)
        @test g ≈ vcat(a, mid, b) atol = 1
        # A per-edge path ships one pair per edge, so element k is still edge k.
        e = lay(m, "edges")
        @test e["kind"] == "segments"
        @test e["geometry"] ≈ vcat(a, mid, mid, b) atol = 1
        # A pair wholly outside is a gap; the crossing one keeps its inside part.
        q = lay(m, "pairs")["geometry"]
        @test all(isnan, q[1:4])
        @test q[5:8] ≈ vcat(a, b) atol = 1
    end

    @testset "unknown layer id fails loud" begin
        (; fig, ax, pts) = default_fixture()
        w = masque(fig, [ViewInteractable(ax; id = :view), PointInteractable(ax, pts)]; auto = false)
        @test_throws ArgumentError w.render_frame(Dict("id" => "nope", "xmin" => 0.0, "xmax" => 1.0, "ymin" => 0.0, "ymax" => 1.0))
    end

    @testset "display writes the mount image before the view warmup" begin
        fig3 = Figure(size = (400, 400))
        ax3 = Axis3(fig3[1, 1])
        scatter!(ax3, Makie.Point3f[(1, 2, 3), (4, 5, 6)])
        az0, el0, lim0 = ax3.azimuth[], ax3.elevation[], ax3.limits[]
        w3 = masque(fig3, [ViewInteractable(ax3)]; auto = false)
        @test w3.render_frame isa Function
        @test !Masque._view_warmup_finished(w3.render_frame)
        sender3 = @async begin
            io, buf = _pluto_display_io()
            show(io, MIME"text/html"(), w3)
            html = String(take!(buf))
            # This task is the stand-in for Pluto's cell task: `show` has the bytes, and the
            # warmup waits for this task to finish before it touches the camera.
            @test occursin("data:image/png;base64,", html)
            @test !Masque._view_warmup_finished(w3.render_frame)
            @test ax3.azimuth[] ≈ az0 atol = 1.0e-12
            @test ax3.elevation[] ≈ el0 atol = 1.0e-12
            return html
        end
        wait(sender3)
        Masque._sync_view_warmup!(w3.render_frame)
        @test Masque._view_warmup_finished(w3.render_frame)
        @test ax3.azimuth[] ≈ az0 atol = 1.0e-12
        @test ax3.elevation[] ≈ el0 atol = 1.0e-12
        @test ax3.limits[] == lim0   # the warmup's zoom frame is put back too

        fig2 = Figure(size = (600, 400))
        ax2 = Axis(fig2[1, 1])
        pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]
        scatter!(ax2, first.(pts), last.(pts))
        lim0 = ax2.limits[]
        w2 = masque(fig2, [ViewInteractable(ax2), PointInteractable(ax2, pts)]; auto = false)
        sender2 = @async begin
            io, buf = _pluto_display_io()
            show(io, MIME"text/html"(), w2)
            html = String(take!(buf))
            @test occursin("data:image/png;base64,", html)
            @test !Masque._view_warmup_finished(w2.render_frame)
            @test ax2.limits[] == lim0
            return html
        end
        wait(sender2)
        Masque._sync_view_warmup!(w2.render_frame)
        @test Masque._view_warmup_finished(w2.render_frame)
        @test ax2.limits[] == lim0
    end

    # Block after the first discarded frame, once the camera has moved and before `finally`
    # puts it back. `release` is what lets that frame's caller continue.
    function _pause_after_first_frame!(render_frame, nudged, release)
        state = Masque._view_warmup_state(render_frame)
        inner = state.apply
        hits = Ref(0)
        state.apply = function (input)
            out = inner(input)
            hits[] += 1
            if hits[] == 1
                put!(nudged, nothing)
                take!(release)
            end
            return out
        end
        return state
    end

    @testset "cancel waits until the in-flight warmup restores the camera" begin
        fig = Figure(size = (400, 400))
        ax = Axis3(fig[1, 1])
        scatter!(ax, Makie.Point3f[(1, 2, 3), (4, 5, 6)])
        az0, el0 = ax.azimuth[], ax.elevation[]
        w = masque(fig, [ViewInteractable(ax)]; auto = false)
        nudged = Channel{Nothing}(1)
        release = Channel{Nothing}(1)
        _pause_after_first_frame!(w.render_frame, nudged, release)
        sender = @async begin
            io, _ = _pluto_display_io()
            show(io, MIME"text/html"(), w)
        end
        wait(sender)
        take!(nudged)
        @test abs(ax.azimuth[] - az0) > 1.0e-8 || abs(ax.elevation[] - el0) > 1.0e-8
        canceller = @async Masque._cancel_view_warmup!(w.render_frame)
        seen = false
        for _ in 1:100
            yield()
            state = Masque._view_warmup_state(w.render_frame)
            state !== nothing && state.cancelled && (seen = true)
            seen && !istaskdone(canceller) && break
        end
        @test seen && !istaskdone(canceller)
        put!(release, nothing)
        wait(canceller)
        @test ax.azimuth[] ≈ az0 atol = 1.0e-12
        @test ax.elevation[] ≈ el0 atol = 1.0e-12
        # The next mount on this figure must sample the restored camera, not the nudge.
        w2 = masque(fig, [ViewInteractable(ax)]; auto = false)
        @test ax.azimuth[] ≈ az0 atol = 1.0e-12
        @test ax.elevation[] ≈ el0 atol = 1.0e-12
        Masque._sync_view_warmup!(w2.render_frame)
    end

    @testset "a drag during warmup waits and keeps the requested camera" begin
        fig = Figure(size = (400, 400))
        ax = Axis3(fig[1, 1])
        scatter!(ax, Makie.Point3f[(1, 2, 3), (4, 5, 6)])
        az0, el0 = ax.azimuth[], ax.elevation[]
        requested_az, requested_el = az0 + 0.4, el0 - 0.15
        w = masque(fig, [ViewInteractable(ax)]; auto = false)
        go = Channel{Nothing}(1)
        entered = Ref(false)
        result = Ref{Any}(nothing)
        drag = @async begin
            take!(go)
            entered[] = true
            result[] = w.render_frame(
                Dict("id" => "view", "azimuth" => requested_az, "elevation" => requested_el, "settle" => false),
            )
        end
        sender = @async begin
            io, buf = _pluto_display_io()
            show(io, MIME"text/html"(), w)
            @test occursin("data:image/png;base64,", String(take!(buf)))
            @test !Masque._view_warmup_finished(w.render_frame)
            @test ax.azimuth[] ≈ az0 atol = 1.0e-12
            put!(go, nothing)
            while !entered[]
                yield()
            end
            # The drag is inside `render_frame` and this task has not ended, so the deferred
            # warmup has not started. Returning is what lets it run; the drag waits for that.
            @test !Masque._view_warmup_finished(w.render_frame)
        end
        wait(sender)
        wait(drag)
        @test Masque._view_warmup_finished(w.render_frame)
        @test ax.azimuth[] ≈ requested_az atol = 1.0e-9
        @test ax.elevation[] ≈ requested_el atol = 1.0e-9
        view_layer = only(l for l in result[]["manifest"]["layers"] if l["kind"] == "view")
        @test view_layer["geometry"]["azimuth"] ≈ requested_az atol = 1.0e-9
        @test view_layer["geometry"]["elevation"] ≈ requested_el atol = 1.0e-9
        yield()
        @test ax.azimuth[] ≈ requested_az atol = 1.0e-9
        @test ax.elevation[] ≈ requested_el atol = 1.0e-9
    end

    @testset "show then render_frame on the displaying task does not deadlock" begin
        fig = Figure(size = (400, 400))
        ax = Axis3(fig[1, 1])
        scatter!(ax, Makie.Point3f[(1, 2, 3), (4, 5, 6)])
        az0, el0 = ax.azimuth[], ax.elevation[]
        requested_az, requested_el = az0 + 0.25, el0 + 0.1
        w = masque(fig, [ViewInteractable(ax)]; auto = false)
        worker = @async begin
            io, _ = _pluto_display_io()
            show(io, MIME"text/html"(), w)
            @test !Masque._view_warmup_finished(w.render_frame)
            return w.render_frame(
                Dict("id" => "view", "azimuth" => requested_az, "elevation" => requested_el, "settle" => false),
            )
        end
        watchdog = Timer(60)
        @async begin
            wait(watchdog)
            istaskdone(worker) || Base.throwto(worker, ErrorException("warmup join deadlocked"))
        end
        resp = try
            fetch(worker)
        finally
            close(watchdog)
        end
        @test Masque._view_warmup_finished(w.render_frame)
        @test ax.azimuth[] ≈ requested_az atol = 1.0e-9
        @test ax.elevation[] ≈ requested_el atol = 1.0e-9
        view_layer = only(l for l in resp["manifest"]["layers"] if l["kind"] == "view")
        @test view_layer["geometry"]["azimuth"] ≈ requested_az atol = 1.0e-9
    end

    @testset "MasqueWidget 3-arg constructor still works (render_frame defaults to nothing)" begin
        w = Masque.MasqueWidget("", Dict{String, Any}(), 100)
        @test w.render_frame === nothing
    end
end
