# Upstream canary (#176): run the Makie and WGL accessor canaries against Makie master.
# Driven by .github/workflows/UpstreamCanary.yml; also runs locally.
#
#   julia test/upstream/canary.jl setup <Makie.jl checkout> <env dir>
#   julia --project=<env dir> test/upstream/canary.jl load <Makie.jl checkout>
#   julia --project=<env dir> test/upstream/canary.jl makie
#   julia --project=<env dir> test/upstream/canary.jl wgl
#
# Each stage fails with its own message, so a red run says which thing broke: `setup` is
# resolution (master left Masque's one-minor pin, or the Julia version), `load` is master not
# precompiling or loading, `makie`/`wgl` is an accessor canary. Only the canary files run,
# never the suite.

import Pkg
import Test

const MASQUE_ROOT = normpath(joinpath(@__DIR__, "..", ".."))
const TEST_DIR = joinpath(MASQUE_ROOT, "test")
# The packages Masque loads from the Makie monorepo. Not GLMakie: it needs a display server and
# Masque never loads it. ComputePipeline is developed too: the released backends pin
# `Makie = "=x.y.z"` and record `[sources]` paths, so mixing a developed Makie with registry
# backends does not resolve.
const UPSTREAM_PKGS = ["ComputePipeline", "Makie", "CairoMakie", "WGLMakie"]

# GitHub annotation when running in Actions, plain text otherwise.
function report(level, title, msg)
    if haskey(ENV, "GITHUB_ACTIONS")
        println("::$level title=$title::", replace(msg, "\n" => "%0A"))
    else
        println(uppercase(level), ": ", title, ": ", msg)
    end
    if haskey(ENV, "GITHUB_STEP_SUMMARY")
        open(io -> println(io, "- **", title, "**: ", msg), ENV["GITHUB_STEP_SUMMARY"], "a")
    end
    return nothing
end

upstream_commit(checkout) =
try
    readchomp(`git -C $checkout rev-parse HEAD`)
catch
    "unknown commit"
end

function setup(checkout, env)
    commit = upstream_commit(checkout)
    mkpath(env)
    Pkg.activate(env)
    specs = [Pkg.PackageSpec(; path = MASQUE_ROOT); [Pkg.PackageSpec(; path = joinpath(checkout, p)) for p in UPSTREAM_PKGS]]
    try
        # One call, so the resolver sees Masque's compat and master's versions together.
        Pkg.develop(specs)
    catch err
        msg = sprint(showerror, err)
        if err isa Pkg.Resolve.ResolverError
            if occursin("julia", lowercase(msg)) && occursin("restricted to versions", msg) &&
                    !occursin("compatibility requirements with Masque", msg)
                report(
                    "error", "Makie master does not support Julia $VERSION",
                    "Resolution refused at MakieOrg/Makie.jl@$commit because of Julia compat. " *
                        "This is not an accessor shape break.\n$msg"
                )
            else
                report(
                    "error", "Makie master left Masque's compat pin",
                    "Resolution refused at MakieOrg/Makie.jl@$commit: master's versions are outside " *
                        "Masque's [compat] (one minor each). This is not an accessor shape break; the " *
                        "CompatHelper pull request runs the canaries once a release widens the bound.\n$msg"
                )
            end
        else
            report("error", "Could not develop Makie master", "MakieOrg/Makie.jl@$commit: $msg")
        end
        exit(2)
    end
    return nothing
end

function load(checkout)
    commit = upstream_commit(checkout)
    try
        @eval Main begin
            using Masque, CairoMakie, WGLMakie
            import Makie
        end
    catch err
        report(
            "error", "Makie master does not load on Julia $VERSION",
            "MakieOrg/Makie.jl@$commit failed to precompile or load. This is not an accessor " *
                "shape break.\n" * sprint(showerror, err)
        )
        exit(3)
    end
    versions = join(
        (
            "$name $(pkgversion(Base.invokelatest(getglobal, Main, Symbol(name))))" for
                name in ("Makie", "CairoMakie", "WGLMakie")
        ), ", "
    )
    report("notice", "Upstream under test", "MakieOrg/Makie.jl@$commit: $versions, Julia $VERSION")
    return nothing
end

function canary(which)
    file, title = which == "makie" ?
        ("makie_compat_tests.jl", "Makie accessor canary failed") :
        ("wgl_compat_tests.jl", "WGL accessor canary failed")
    commit = get(ENV, "MAKIE_COMMIT", "unknown commit")
    @eval Main begin
        using Test, Masque
        import Makie
    end
    if which == "makie"
        @eval Main using CairoMakie
    else
        @eval Main begin
            using WGLMakie
            const _WGLExt = Base.get_extension(Masque, :MasqueWGLMakieExt)
        end
    end
    try
        # Each top-level `@testset` throws on failure after printing its summary, which names
        # the failing testset.
        Base.include(Main, joinpath(TEST_DIR, file))
    catch err
        report(
            "error", title,
            "$file failed against MakieOrg/Makie.jl@$commit. The Test Summary above names the " *
                "failing testset." * (
                err isa LoadError && err.error isa Test.TestSetException ? "" :
                    "\n" * first(sprint(showerror, err), 2000)
            )
        )
        exit(1)
    end
    return nothing
end

if abspath(PROGRAM_FILE) == @__FILE__
    cmd = get(ARGS, 1, "")
    if cmd == "setup" && length(ARGS) == 3
        setup(ARGS[2], ARGS[3])
    elseif cmd == "load" && length(ARGS) == 2
        load(ARGS[2])
    elseif cmd in ("makie", "wgl") && length(ARGS) == 1
        canary(cmd)
    else
        println(stderr, "usage: canary.jl setup <checkout> <env> | load <checkout> | makie | wgl")
        exit(64)
    end
end
