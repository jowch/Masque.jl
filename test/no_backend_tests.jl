using Masque
using Makie   # bare Makie: Figure/Axis/scatter! don't need a rendering backend to construct
using Test

@testset "masque(fig) with no backend extension loaded" begin
    fig = Figure(; size = (300, 200))
    ax = Axis(fig[1, 1])
    scatter!(ax, 1:5, rand(5))

    err = try
        masque(fig)
        nothing
    catch e
        e
    end
    @test err isa ArgumentError
    @test occursin("CairoMakie", err.msg)
    @test occursin("WGLMakie", err.msg)
end

@testset "backend = symbol with no backend extension loaded (#236)" begin
    fig = Figure(; size = (300, 200))
    scatter!(Axis(fig[1, 1]), 1:5, rand(5))
    for (name, pkg) in ((:cairo, "CairoMakie"), (:webgl, "WGLMakie"))
        err = (@test_throws ArgumentError masque(fig; backend = name)).value
        @test occursin("using $pkg", err.msg)
    end
    err = (@test_throws ArgumentError masque(fig; backend = :gl)).value
    @test occursin("unknown backend", err.msg) && occursin(":cairo, :webgl", err.msg)
end

# ---- cross-backend parity invariant: pure golden-data comparison, no Makie backend ----
# The two committed goldens per corpus figure must agree structurally. This is the test
# that catches a one-sided context() divergence (the Colorbar-misbind class) whatever its
# downstream symptom — order-tolerant, so it survives Dict-iteration changes across Julia
# versions. JSON3 comes from the test extras; skip loudly on a bare root env.
if Base.find_package("JSON3") === nothing
    @warn "SKIPPING cross-backend parity invariant testset — JSON3 not in this env; run via Pkg.test()"
else
    @eval using JSON3
    @testset "cross-backend parity invariant (golden fixtures)" begin
        dir = joinpath(@__DIR__, "fixtures", "parity")
        names = sort(unique(replace.(filter(endswith(".json"), readdir(dir)), r"\.(cairo|webgl)\.json$" => "")))
        @test !isempty(names)
        for name in names
            ca = JSON3.read(read(joinpath(dir, "$name.cairo.json"), String))
            wg = JSON3.read(read(joinpath(dir, "$name.webgl.json"), String))
            @testset "$name" begin
                # matched-ppu quotient → identical canvas geometry
                @test ca[:width] == wg[:width] && ca[:height] == wg[:height] && ca[:scaling] == wg[:scaling]
                # layers: same multiset of (id, kind, axis) — the misbind class fails HERE
                lkey(L) = (L[:id], L[:kind], L[:axis])
                @test sort(lkey.(ca[:layers])) == sort(lkey.(wg[:layers]))
                # the pairwise match below keys on the triple — a duplicate would silently
                # compare against the wrong twin, so fail loud if a future corpus makes one
                @test allunique(lkey.(wg[:layers]))
                wmap = Dict(lkey(L) => L for L in wg[:layers])
                for L in ca[:layers]
                    haskey(wmap, lkey(L)) || continue   # multiset mismatch already reported above
                    W = wmap[lkey(L)]
                    @test L[:geometry] == W[:geometry]
                    @test length(L[:payloads]) == length(W[:payloads])
                    pkeys(p) = p isa AbstractDict ? Set(keys(p)) : typeof(p)
                    @test pkeys.(L[:payloads]) == pkeys.(W[:payloads])
                    for f in (:events, :template, :selects, :tooltip, :style)
                        @test get(L, f, nothing) == get(W, f, nothing)
                    end
                end
                # transforms: same ids, same per-id declarative shape
                @test Set(keys(ca[:transforms])) == Set(keys(wg[:transforms]))
                for k in keys(ca[:transforms])
                    haskey(wg[:transforms], k) || continue
                    tc, tw = ca[:transforms][k], wg[:transforms][k]
                    for f in (:valueaxis, :xscale, :yscale, :xlims, :ylims, :viewport, :xreversed, :yreversed, :xcats, :ycats, :is3d, :ispolar, :polar)
                        @test get(tc, f, nothing) == get(tw, f, nothing)
                    end
                end
            end
        end
        # colorbar oracle: the colorbar layer must key a transform whose valueaxis is
        # non-null on BOTH backends — a misbind to :ax1 (null valueaxis) fails here even
        # though nothing crashes (the silent-wrong-readout class is exactly this).
        @testset "colorbar valueaxis oracle" begin
            for b in ("cairo", "webgl")
                m = JSON3.read(read(joinpath(dir, "colorbar.$b.json"), String))
                L = only(filter(l -> l[:id] == "colorbar", m[:layers]))
                @test get(m[:transforms][Symbol(L[:axis])], :valueaxis, nothing) !== nothing
            end
        end
    end
end

# #269: Pluto and the REPL run with `--depwarn=no`, which hides a plain `Base.depwarn`. Run a
# deprecated form in a child process with that flag and check the warning still shows, once
# per call site. The `tooltip_*` keywords are its only deprecation since 0.3; when they go in
# 0.4, point this at the next deprecation or drop it.
@testset "deprecations warn without --depwarn=yes (#269)" begin
    code = """
    using Masque, Test
    @noinline site() = Masque._merge_tooltip_kwargs(nothing, (; bg = :red))
    @test_logs (:warn, r"`tooltipstyle = \\(; bg = …\\)`. Removed in 0.4") (site(); site(); site())
    """
    julia(flag, code) = `$(Base.julia_cmd()) $flag --startup-file=no --project=$(Base.active_project()) -e $code`
    @test success(pipeline(julia("--depwarn=no", code); stdout, stderr))
    # `--depwarn=error` still turns the warning into an error.
    code = """
    using Masque, Test
    @test_throws ErrorException Masque._merge_tooltip_kwargs(nothing, (; bg = :red))
    """
    @test success(pipeline(julia("--depwarn=error", code); stdout, stderr))
    # Every deprecation goes through `_deprecate`, which forces the warning.
    root = pkgdir(Masque)
    calls = String[]
    for dir in ("src", "ext"), (path, _, files) in walkdir(joinpath(root, dir)), f in files
        endswith(f, ".jl") && occursin("Base.depwarn(", read(joinpath(path, f), String)) &&
            push!(calls, relpath(joinpath(path, f), root))
    end
    @test calls == [joinpath("src", "Masque.jl")]
end
