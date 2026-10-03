# WGL half of the upstream canary: the WGLMakie/Bonito internals ext/MasqueWGLMakieExt.jl
# reads (`_serialize_scene`, `_headless_screen`, `_wgl_bundle_path`) and the Bonito symbols the
# renderer bundle calls into our shim. The Makie half is test/makie_compat_tests.jl.
# Included by test/webgl_ext_tests.jl, and run on its own against Makie master by
# test/upstream/canary.jl. Expects `Masque`, `WGLMakie`, `Makie`, `Test`, and `_WGLExt` in scope.

@testset "version-coupling guard (WGLMakie/Bonito internals)" begin
    # This extension rides UNSTABLE WGLMakie/Bonito internals: the session-free
    # `serialize_scene`, the `Screen` + `NoConnection` atlas-population dance, and the JS
    # bundle's `setup_scene_init` export the shim calls (assets/masque-webgl.js). A WGLMakie
    # bump can move any of these and break the widget IN THE BROWSER with no Julia error —
    # the other testsets would still pass. Each check below names one coupling point so a
    # bump fails loudly *here*, cueing "re-verify the wire format" instead of a confusing
    # downstream symptom. Exercises the WGL-only compat block (`_wgl_bundle_path`,
    # `_headless_screen`, `_serialize_scene` in ext/MasqueWGLMakieExt.jl), not just `isdefined`.

    @test isdefined(_WGLExt.Bonito, :NoConnection)   # session-free serialize (no live Pluto)
    @test isdefined(WGLMakie, :ScreenConfig)
    @test isdefined(WGLMakie, :serialize_scene)
    @test isdefined(WGLMakie, :Screen)
    @test isdefined(Makie, :merge_screen_config)
    @test isdefined(Makie, :push_screen!)
    @test isdefined(Makie, :delete_screen!)
    @test :session in fieldnames(WGLMakie.Screen)    # screen.session = NoConnection session

    fig = Figure(; size = (300, 200)); ax = Axis(fig[1, 1]); scatter!(ax, 1:6, (1:6) ./ 6)
    Makie.update_state_before_display!(fig)

    # _headless_screen(f, scene): f sees a live, session-attached screen; detached after.
    n0 = length(fig.scene.current_screens)
    sess_seen = _WGLExt._headless_screen(fig.scene) do screen
        screen isa WGLMakie.Screen && screen.session !== nothing
    end
    @test sess_seen === true
    @test length(fig.scene.current_screens) == n0

    # _serialize_scene(scene) directly (not just via scene_payload's _plain wrapper).
    raw = _WGLExt._headless_screen(fig.scene) do screen
        _WGLExt._serialize_scene(fig.scene)
    end
    @test haskey(raw, :plots) || haskey(raw, "plots") || haskey(raw, :children) || haskey(raw, "children")

    payload = _WGLExt.scene_payload(fig)
    @test haskey(payload, "plots") || haskey(payload, "children")   # scene nesting

    uuids = String[]
    walk(x) = x isa AbstractDict ?
        (haskey(x, "uuid") && push!(uuids, string(x["uuid"])); foreach(walk, values(x))) :
        x isa AbstractVector ? foreach(walk, x) : nothing
    walk(payload)
    @test !isempty(uuids)

    bundle = read(_WGLExt._wgl_bundle_path(), String)
    @test occursin("setup_scene_init", bundle)
    @test occursin("find_plots", bundle)
    @test occursin("deserialize_scene", bundle)
    @test occursin("start_renderloop", bundle)
    @test occursin("delete_scene", bundle)
end

@testset "shim-completeness canary (Bonito/Connection symbols the bundle references)" begin
    # The bundle calls bare Bonito.<x> and Bonito.Connection.<x> (the prelude points them at the
    # scoped shim; the checks at the end of this testset lock that) with no
    # compile-time check against our shim (frontend/src/wgl-shim.ts) — a WGLMakie bump that
    # references a new one silently produces a browser TypeError (this guarded against
    # `send_warning`, added after `on_shader_error` started calling it). This asserts the
    # shim is a SUPERSET of what the installed bundle references, not equal to it — the shim
    # also provides members like `lock_loading` that the bundle doesn't call directly.
    # `Bonito.X` and `Connection.X` are two different namespaces (the shim object vs.
    # `ConnStub`), so each is matched against only its own region of wgl-shim.ts — a flat
    # symbol-name match would let e.g. a future `Bonito.on(...)` false-pass against
    # `ConnStub`'s `on()` method.
    bundle = read(_WGLExt._wgl_bundle_path(), String)

    shim_path = joinpath(pkgdir(Masque), "frontend", "src", "wgl-shim.ts")
    @test isfile(shim_path)
    shim_src = read(shim_path, String)
    # strip `//` line comments first, so a comment merely *mentioning* a symbol name (e.g.
    # this testset's own docstring) can't be mistaken for the shim providing it. Not
    # string-literal-aware — a future `"http://…"` in wgl-shim.ts would get truncated too;
    # harmless today (no `//` inside any string literal in the file).
    stripped = join((replace(l, r"//.*$" => "") for l in split(shim_src, '\n')), '\n')

    # Scope both regions to inside makeBonitoShim() specifically — `obs()` (above it in this
    # file) also has a `return { ... }` object literal, and a file-wide match would grab
    # that one instead (verified: it did, until this was scoped).
    shim_fn = match(r"export function makeBonitoShim\(\) \{(.*?)\n\}\n"s, stripped)
    @test !isnothing(shim_fn)   # loud if wgl-shim.ts is restructured, not a silent no-op
    shim_body = shim_fn.captures[1]
    conn_region = match(r"class ConnStub \{(.*?)\n    \}"s, shim_body)
    obj_region = match(r"return \{(.*?)\n    \}"s, shim_body)
    @test !isnothing(conn_region)
    @test !isnothing(obj_region)

    members(s) = Set(m.captures[1] for m in eachmatch(r"^\s*(?:static\s+)?([A-Za-z_]\w*)\s*[:=(]"m, s))
    provided_conn = members(conn_region.captures[1])
    provided_obj = members(obj_region.captures[1])

    # identifier-boundary lookbehind: without it, a hypothetical bundle identifier like
    # `WebSocketConnection.foo` would match `Connection\.` mid-word and inflate
    # `referenced_conn` with a symbol the shim was never meant to provide.
    referenced_obj = Set(m.captures[1] for m in eachmatch(r"(?<![A-Za-z0-9_])Bonito\.([A-Za-z_]+)", bundle))
    referenced_conn = Set(m.captures[1] for m in eachmatch(r"(?<![A-Za-z0-9_])Connection\.([A-Za-z_]+)", bundle))
    @test !isempty(referenced_obj)   # a regex/region miss must not silently pass the canary
    @test !isempty(referenced_conn)

    missing_obj = setdiff(referenced_obj, provided_obj)
    missing_conn = setdiff(referenced_conn, provided_conn)
    @test missing_obj == Set{String}()    # `Evaluated:` on failure names exactly what's missing
    @test missing_conn == Set{String}()

    # #175: `_widget_html` scopes the shim by prepending `const Bonito = …` to the bundle, which
    # only shadows a bare `Bonito` identifier. A bundle that reached the global another way
    # (`window.Bonito`, `globalThis.Bonito`, `self.Bonito`), or declared its own top-level
    # `Bonito`, would bypass the prelude or make it a SyntaxError. The regex above matches
    # `window.Bonito.x` too, so it cannot catch that; these can.
    @test !occursin(r"(?:window|globalThis|self)\s*(?:\.\s*Bonito\b|\[\s*[\"']Bonito[\"']\s*\])", bundle)
    @test !occursin(r"(?:^|[;{}\s])(?:const|let|var|function|class)\s+Bonito\b"m, bundle)
    @test !occursin(r"\bimport\b[^;]*\bBonito\b", bundle)
end

@testset "WGL accessors rewrap a moved internal" begin
    # Negative path for the WGL-only compat block, mirroring test/makie_compat_tests.jl's
    # "accessors rewrap a moved internal" — a shape break must produce the Masque message,
    # not a raw MethodError/FieldError.
    @test_throws r"^Masque: WGLMakie/Bonito internal `serialize_scene`" _WGLExt._serialize_scene(nothing)
    @test_throws r"^Masque: WGLMakie/Bonito internal `headless screen construction`" _WGLExt._headless_screen(identity, nothing)
end
