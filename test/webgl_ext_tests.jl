using Test
using Masque
using WGLMakie
import Makie

const _WGLExt = Base.get_extension(Masque, :MasqueWGLMakieExt)

# Smoke tests for the serialization bridge (no browser). The browser render is covered by
# the spikes; these guard the Julia-side encoder + the version-coupled serialize_scene path.

@testset "scene_payload encoding" begin
    fig = Figure(; size = (400, 300))
    ax = Axis(fig[1, 1])
    lines!(ax, 1:10, (1:10) .^ 2)
    scatter!(ax, 1:10, (1:10) .^ 2)
    Makie.update_state_before_display!(fig)

    payload = _WGLExt.scene_payload(fig)

    @test payload isa Dict{String, Any}
    @test haskey(payload, "plots") || haskey(payload, "children")

    # STRICT: mirror published_to_js — only Dict, Base.Array, and scalars. A StaticArray/Vec
    # is NOT a Base.Array, so a leftover Vec falls through to `false` (it slips past JSON3 but
    # published_to_js rejects it — the real-Pluto bug this guards against).
    function ok(x)
        if x isa AbstractDict
            return all(ok, values(x))
        elseif x isa Base.Array
            return all(ok, x)
        else
            return x isa Union{Real, AbstractString, Bool, Nothing}
        end
    end
    @test ok(payload)

    # observables were tagged, not left live
    found_obs = Ref(false); found_buf = Ref(false)
    walk(x) = x isa Dict ? (
            haskey(x, "__obs__") && (found_obs[] = true);
            haskey(x, "__t__") && (found_buf[] = true); foreach(walk, values(x))
        ) :
        x isa AbstractVector ? foreach(walk, x) : nothing
    walk(payload)
    @test found_obs[]   # {__obs__}
    @test found_buf[]   # {__t__}
end

@testset "Axis3 serializes (what CairoBackend rejects)" begin
    fig = Figure(; size = (400, 300))
    ax = Axis3(fig[1, 1])
    lines!(ax, cos.(0:0.1:6), sin.(0:0.1:6), 0:0.1:6)
    Makie.update_state_before_display!(fig)
    @test _WGLExt.scene_payload(fig) isa Dict{String, Any}
end

@testset "masque(fig) widget (WGLMakie loaded)" begin
    import HypertextLiteral: JavaScript
    import JSON3
    fig = Figure(; size = (400, 300))
    ax = Axis(fig[1, 1])
    scatter!(ax, 1:5, rand(5))
    w = masque(fig, Masque.AbstractInteractable[]; backend = :webgl, auto = false)
    @test w isa _WGLExt.WebGLWidget
    @test w.scene isa Dict{String, Any}
    @test (w.width, w.height) == (400, 300)

    fig_v = Figure(; size = (400, 300))
    ax_v = Axis(fig_v[1, 1])
    scatter!(ax_v, 1:5, rand(5))
    wv = masque(fig_v, [ViewInteractable(ax_v)]; backend = :webgl, auto = false)
    @test wv isa _WGLExt.WebGLWidget
    @test wv.render_frame isa Function

    # scene must be JSON3-safe (Makie can emit NaN in transformed-position buffers; _plain scrubs them)
    @test JSON3.write(w.scene) isa String

    # self-contained HTML (inline JSON instead of published_to_js) — the integration points
    html = sprint(
        show, MIME"text/html"(),
        _WGLExt._widget_html(
            w;
            scene_expr = JavaScript(JSON3.write(w.scene)),
            manifest_expr = JavaScript(JSON3.write(w.manifest)),
            bundle_js = JavaScript(JSON3.write("/*bundle*/")),
            shim_js = JavaScript(JSON3.write("/*shim*/")),
        ),
    )
    @test occursin("canvas", html)
    @test occursin("mountWebGL", html)
    @test occursin("createObjectURL", html)      # blob delivery (no server / no file://)
    @test occursin("window.__MasqueWGL", html)     # M2: bundle/shim blob URLs cached once per notebook
    # #175: shim scoped to our bundle copy. The prelude sits inside a JS string literal, so it
    # must carry an escaped `\n`, not a raw newline (a raw one is a JS SyntaxError).
    @test occursin("\"const Bonito = globalThis.__MasqueWGL.bonito;\\n\" + ", html)
    @test occursin("window.Masque.mount", html)    # Masque's overlay reused verbatim
    @test occursin("requestFrame", html)
end

@testset "PolarAxis scene is JSON3-safe (pagepolar e2e)" begin
    import JSON3
    fig = Figure(; size = (400, 300))
    ax = PolarAxis(fig[1, 1])
    scatter!(ax, Point2f[(0.0, 1.0), (π / 2, 2.0)]; markersize = 14, color = :red)
    w = masque(fig; backend = :webgl)
    @test w.manifest["transforms"]["ax1"]["ispolar"] === true
    @test JSON3.write(w.scene) isa String
    @test JSON3.write(w.manifest) isa String
end

@testset "LScene is refused on :webgl, the same as :cairo (#172)" begin
    fu = Figure(; size = (400, 300)); LScene(fu[1, 1])
    err = (@test_throws ArgumentError Masque.context(Masque._resolve_backend(:webgl), fu, 2.0, 700)).value
    @test occursin("LScene", err.msg)
    @test occursin("Axis3", err.msg)
    @test !occursin("WGLMakie", err.msg)
    # A mixed figure is refused at masque() time, not rendered with the LScene left bare.
    fm = Figure(; size = (400, 300)); ax = Axis(fm[1, 1]); scatter!(ax, 1:3, 1:3); LScene(fm[1, 2])
    @test_throws ArgumentError masque(fm; backend = :webgl)
end

@testset "context populates per-axis transforms (axis-keyed interactable)" begin
    fig = Figure(; size = (400, 300))
    ax = Axis(fig[1, 1])
    lines!(ax, 1:5, (1:5) .^ 2)
    Makie.update_state_before_display!(fig)

    ctx = Masque.context(Masque._resolve_backend(:webgl), fig, 2.0, 700)
    @test ctx.transforms isa Dict{Symbol, Masque.AxisTransform}   # not Dict{Symbol,Any}
    @test haskey(ctx.transforms, :ax1)                           # was empty -> KeyError

    # an axis-keyed interactable must build its manifest without KeyError now
    thr = Masque.ThresholdInteractable(ax; value = 10.0)
    w = masque(fig, [thr]; backend = :webgl, auto = false)
    @test w isa _WGLExt.WebGLWidget
    @test !isempty(w.manifest["transforms"])
end

@testset "scene_payload leaves no screen attached" begin
    fig = Figure(; size = (300, 200)); ax = Axis(fig[1, 1]); lines!(ax, 1:4, 1:4)
    Makie.update_state_before_display!(fig)
    n0 = length(fig.scene.current_screens)
    _WGLExt.scene_payload(fig)
    @test length(fig.scene.current_screens) == n0   # the serialization screen is cleaned up
end

@testset "backend wiring" begin
    b = Masque._resolve_backend(:webgl)
    @test b isa _WGLExt.WebGLBackend
    @test b isa Masque.AbstractBackend
    @test isfile(_WGLExt.SHIM_JS)
    @test isfile(_WGLExt._wgl_bundle_path())   # the version-matched renderer is on disk
end

include("wgl_compat_tests.jl")

@testset "@bind round-trip contract (click payload -> InteractionEvent)" begin
    import JSON3
    import AbstractPlutoDingetjes as APD
    IE = Masque.InteractionEvent

    fig = Figure(; size = (400, 300)); ax = Axis(fig[1, 1])
    scatter!(ax, 1:5, (1:5) .^ 2)
    w = masque(fig; backend = :webgl)   # auto-extract -> one :scatter circles layer
    layer = only(w.manifest["layers"])
    @test layer["id"] == "scatter"

    k = 2
    # deliberately wrong browser-reported payload — an element kind reconstructs from the
    # manifest instead, so this must be ignored rather than echoed back.
    wrong = JSON3.read(JSON3.write(Dict("bogus" => true)))
    js = Dict{String, Any}("layer" => layer["id"], "index" => k, "payload" => wrong)

    ev = APD.Bonds.transform_value(w, js)
    @test ev isa IE
    @test ev.layer === :scatter
    @test ev.index == k + 1
    @test ev.payload === layer["payloads"][k + 1]   # reconstructed, not `wrong`

    @test APD.Bonds.initial_value(w) === nothing
    @test APD.Bonds.transform_value(w, nothing) === nothing

    # second item has no "payload" key at all — reconstruction doesn't need one
    # a plain scatter has no selects-ROI, so an items envelope is not a vector bond
    multi = Dict{String, Any}("items" => [js, Dict{String, Any}("layer" => "scatter", "index" => 0)])
    @test_throws ArgumentError APD.Bonds.transform_value(w, multi)
end

@testset "@bind payload reconstruction matches Masque._bond_payload (WGL/Cairo must not drift)" begin
    import AbstractPlutoDingetjes as APD
    IE = Masque.InteractionEvent

    fig = Figure(; size = (400, 300)); ax = Axis(fig[1, 1])
    pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]
    scatter!(ax, first.(pts), last.(pts))
    payloads = [(; label = "p1"), (; label = "p2"), (; label = "p3")]
    pt = PointInteractable(ax, pts; id = :scatter, payloads = payloads)
    w = masque(fig, pt; backend = :webgl, auto = false)

    ev = APD.Bonds.transform_value(w, Dict{String, Any}("layer" => "scatter", "index" => 1, "payload" => "wrong"))
    @test ev isa Masque.ElementEvent && ev.index == 2
    @test ev.payload === payloads[2]
    # both backends call Masque.bond_from_js — not a second copy of the transform
    @test ev == Masque.bond_from_js(w, Dict{String, Any}("layer" => "scatter", "index" => 1, "payload" => "ignored"))

    # out-of-range index: same fail-loud contract as the Cairo widget
    @test_throws ArgumentError APD.Bonds.transform_value(
        w, Dict{String, Any}("layer" => "scatter", "index" => 99, "payload" => nothing)
    )
end

@testset "initial_value hydration parity: :webgl must not drift from :cairo on selected=" begin
    # WebGLWidget's initial_value previously returned `nothing` unconditionally, so :webgl had no
    # selected= hydration while :cairo did (both now share src/render.jl's _hydrated_selection).
    # The control above (no selected=) can't catch that; this case can.
    import AbstractPlutoDingetjes as APD
    IE = Masque.InteractionEvent

    fig = Figure(; size = (400, 300)); ax = Axis(fig[1, 1])
    scatter!(ax, 1:5, (1:5) .^ 2)
    w = masque(fig; backend = :webgl, selected = 2)
    layer = only(w.manifest["layers"])
    @test layer["id"] == "scatter"
    @test layer["selected"] == [1]

    hydrated = APD.Bonds.initial_value(w)
    @test hydrated isa Masque.ElementEvent
    @test hydrated.layer === :scatter && hydrated.index == 2
    @test hydrated.payload == layer["payloads"][2]

    # several indices highlight and leave the bond nothing
    wmany = masque(fig; backend = :webgl, selected = [2, 4])
    @test only(wmany.manifest["layers"])["selected"] == [1, 3]
    @test APD.Bonds.initial_value(wmany) === nothing
end

# MUST run last in this file: this loads CairoMakie on top of the already-loaded WGLMakie.
# After that, implicit masque() defaults to Cairo (sysimage-safe) — nothing after this
# testset may rely on the WGLMakie-only auto-resolution path.
# ---- cross-backend parity harness: within-backend golden drift (:webgl half) ----
# (JSON3 is already a hard dep of this GROUP — no guard needed; see core_tests.jl's
# guarded twin for the regeneration discipline.) Runs BEFORE the both-loaded testset
# below loads CairoMakie: goldens come from a WGLMakie-only env, so the live
# manifests should be built in one too.
include("parity_corpus.jl")
@testset "parity goldens (:webgl drift)" begin
    dir = joinpath(@__DIR__, "fixtures", "parity")
    for (name, build) in _parity_corpus()
        fig, ints = build()
        bk = Masque._resolve_backend(:webgl)
        ctx = Masque.context(bk, fig, Masque._ppu(bk, fig, 700), 700)
        live = JSON3.read(JSON3.write(Masque.build_manifest(ints, ctx)))
        golden = JSON3.read(read(joinpath(dir, "$name.webgl.json"), String))
        @test live == golden
    end
end

@testset "backend = :webgl, max_width and px_per_unit keywords (#236)" begin
    fig = Figure(; size = (600, 400)); scatter!(Axis(fig[1, 1]), 1:3, 1:3)
    @test Masque._resolve_backend(nothing) isa _WGLExt.WebGLBackend   # the one loaded
    w = masque(fig)
    @test w isa _WGLExt.WebGLWidget && w.px_per_unit == 2.0 && w.display_css == 600
    @test w.manifest["scaling"] == 2.0
    err = (@test_throws ArgumentError masque(fig; backend = :cairo)).value
    @test occursin("using CairoMakie", err.msg)
    w = masque(fig; backend = :webgl, max_width = 300)
    @test w.display_css == 300 && w.px_per_unit == 2.0    # WebGL's density ignores max_width
    w = masque(fig; px_per_unit = 3)
    @test w.px_per_unit == 3.0 && w.manifest["scaling"] == 3.0 && w.manifest["width"] == 1800

    b = @test_deprecated _WGLExt.WebGLBackend(; px_per_unit = 3.0, max_width = 300)
    w = masque(fig; backend = b)
    @test w.px_per_unit == 3.0 && w.display_css == 300
    w = masque(fig; backend = b, px_per_unit = 1.5, max_width = 500)   # masque's keywords win
    @test w.px_per_unit == 1.5 && w.display_css == 500
end

@testset "a scatter's outline lies outside the marker on WebGL (#246)" begin
    fig = Figure(; size = (400, 300)); ax = Axis(fig[1, 1])
    s = scatter!(ax, [1.0], [1.0]; markersize = 20, strokewidth = 8)
    bk = Masque._resolve_backend(:webgl)
    ctx = Masque.context(bk, fig, Masque._ppu(bk, fig, 700), 700)
    @test ctx.marker_stroke == 1.0
    r = only(Masque.hitlayers(only(interactables(ax, s)), ctx)).geometry[3]
    @test r == round(Int, (0.3525 * 20 + 8) * ctx.scaling)
end

@testset "masque(fig) with both backends loaded defaults to Cairo" begin
    using CairoMakie
    cairo_ext = Base.get_extension(Masque, :MasqueCairoMakieExt)
    fig = Figure(; size = (300, 200)); ax = Axis(fig[1, 1]); scatter!(ax, 1:5, rand(5))

    implicit = masque(fig)
    @test implicit isa Masque.MasqueWidget

    cairo = masque(fig; backend = :cairo)
    @test cairo isa Masque.MasqueWidget

    wgl = masque(fig; backend = :webgl)
    @test wgl isa _WGLExt.WebGLWidget
end

@testset "gesture channel (#133): webgl frame is a scene plus a manifest" begin
    function json_ok(x)
        if x isa AbstractDict
            return all(json_ok, values(x))
        elseif x isa Base.Array
            return all(json_ok, x)
        else
            return x isa Union{Real, AbstractString, Bool, Nothing}
        end
    end

    fig = Figure(; size = (400, 300))
    ax = Axis(fig[1, 1]; limits = (0.0, 10.0, 0.0, 5.0))
    pts = [(1.0, 1.0), (2.0, 2.0), (3.0, 3.0)]
    scatter!(ax, first.(pts), last.(pts))
    w = masque(
        fig, [ViewInteractable(ax), PointInteractable(ax, pts)];
        backend = :webgl, auto = false,
    )
    @test w.render_frame isa Function

    resp = w.render_frame(
        Dict(
            "id" => "view", "xmin" => 1.0, "xmax" => 9.0, "ymin" => 0.5, "ymax" => 4.5, "settle" => false,
        ),
    )
    @test resp["pxPerUnit"] == 1.0
    @test resp["width"] == 400 && resp["height"] == 300
    @test resp["scene"] isa Dict{String, Any}
    @test json_ok(resp["scene"])
    @test !haskey(resp, "png")
    m2 = resp["manifest"]
    t2 = only(t for t in values(m2["transforms"]) if t["is3d"] == false)
    @test t2["xlims"][1] ≈ 1.0 atol = 1.0e-6
    @test t2["xlims"][2] ≈ 9.0 atol = 1.0e-6
    @test t2["ylims"][1] ≈ 0.5 atol = 1.0e-6
    @test t2["ylims"][2] ≈ 4.5 atol = 1.0e-6
    @test m2["width"] == w.manifest["width"] && m2["height"] == w.manifest["height"]
    @test m2["scaling"] == w.manifest["scaling"]

    settled = w.render_frame(
        Dict(
            "id" => "view", "xmin" => 1.0, "xmax" => 9.0, "ymin" => 0.5, "ymax" => 4.5, "settle" => true,
        ),
    )
    @test settled["pxPerUnit"] == w.px_per_unit
    @test ax.limits[][1] ≈ 1.0 atol = 1.0e-6

    @test_throws ArgumentError w.render_frame(
        Dict("id" => "nope", "xmin" => 0.0, "xmax" => 1.0, "ymin" => 0.0, "ymax" => 1.0),
    )

    fig3 = Figure(; size = (300, 300))
    ax3 = Axis3(fig3[1, 1])
    scatter!(ax3, Makie.Point3f[(1, 2, 3), (4, 5, 6)])
    w3 = masque(fig3, [ViewInteractable(ax3)]; backend = :webgl, auto = false)
    orb = w3.render_frame(Dict("id" => "view", "azimuth" => 0.7, "elevation" => 0.2, "settle" => false))
    @test ax3.azimuth[] ≈ 0.7 atol = 1.0e-9
    @test ax3.elevation[] ≈ 0.2 atol = 1.0e-9
    view_layer = only(l for l in orb["manifest"]["layers"] if l["kind"] == "view")
    @test view_layer["geometry"]["azimuth"] ≈ 0.7 atol = 1.0e-9
    @test haskey(orb, "scene") && !haskey(orb, "png")

    fig0 = Figure(; size = (200, 150))
    ax0 = Axis(fig0[1, 1])
    scatter!(ax0, 1:3, 1:3)
    w0 = masque(
        fig0, [PointInteractable(ax0, [(1.0, 1.0), (2.0, 2.0), (3.0, 3.0)])];
        backend = :webgl,
        auto = false,
    )
    @test w0.render_frame === nothing

    import HypertextLiteral: JavaScript
    import JSON3
    html = sprint(
        show, MIME"text/html"(),
        _WGLExt._widget_html(
            w;
            scene_expr = JavaScript(JSON3.write(w.scene)),
            manifest_expr = JavaScript(JSON3.write(w.manifest)),
            bundle_js = JavaScript(JSON3.write("/*bundle*/")),
            shim_js = JavaScript(JSON3.write("/*shim*/")),
            request_frame_expr = Masque._request_frame_js(IOBuffer(), w.render_frame),
        ),
    )
    @test occursin("const requestFrame = null", html)
    @test occursin("window.Masque.mount", html)
end

@testset "webgl show outside Pluto gives a sized placeholder (#288)" begin
    fig = Figure(; size = (300, 200))
    ax = Axis(fig[1, 1])
    scatter!(ax, 1:3, 1:3)
    w = masque(fig; backend = :webgl)
    html = sprint(show, MIME"text/html"(), w)
    @test occursin("masque-webgl-static", html)
    @test occursin("aspect-ratio:$(w.width) / $(w.height)", html)
    @test !occursin("<script", html)
    @test !occursin("<canvas", html)
end

@testset "webgl show kicks the view warmup before it runs" begin
    fig = Figure(; size = (300, 200))
    ax = Axis3(fig[1, 1])
    scatter!(ax, Makie.Point3f[(1, 2, 3), (4, 5, 6)])
    az0, el0 = ax.azimuth[], ax.elevation[]
    w = masque(fig, [ViewInteractable(ax)]; backend = :webgl, auto = false)
    sender = @async begin
        buf = IOBuffer()
        io = IOContext(buf, :pluto_published_to_js => (io, x) -> print(io, "null"))
        show(io, MIME"text/html"(), w)
        html = String(take!(buf))
        state = Masque._view_warmup_state(w.render_frame)
        return (;
            html, kicked = state !== nothing && state.started && state.task isa Task && !state.done,
            az = ax.azimuth[], el = ax.elevation[],
        )
    end
    got = fetch(sender)
    @test occursin("<canvas", got.html)
    @test got.kicked
    @test got.az ≈ az0 atol = 1.0e-12
    @test got.el ≈ el0 atol = 1.0e-12
    Masque._sync_view_warmup!(w.render_frame)
    @test Masque._view_warmup_finished(w.render_frame)
    @test ax.azimuth[] ≈ az0 atol = 1.0e-12
    @test ax.elevation[] ≈ el0 atol = 1.0e-12
end
