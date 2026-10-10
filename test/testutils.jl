# Shared fixtures for test/core/*.jl. Included (not a module) so every file that pulls
# it in gets these names at its own top level — each core/*.jl file does
# `using Test, Masque, CairoMakie, Makie` then `include(joinpath(@__DIR__, "..", "testutils.jl"))`
# so it can also run standalone via `julia --project=. test/core/<file>.jl`.
#
# core_tests.jl chains all of test/core/*.jl's includes of this file into one process for
# the Core group, so the whole body is guarded to run once per session — plain redefinition
# would otherwise be harmless but noisy (a `WARNING: Method definition ... overwritten`
# per file).
if !@isdefined(MASQUE_TESTUTILS_LOADED)
    const MASQUE_TESTUTILS_LOADED = true

    using Masque: hitlayers, validate, events, HitLayer, build_manifest, MasqueWidget
    import Masque as IP

    # CairoBackend lives in the extension (weak CairoMakie dep) — reach it via
    # Base.get_extension rather than a bare name, same pattern the extension itself uses.
    const _CairoExt = Base.get_extension(Masque, :MasqueCairoMakieExt)

    # finalize + context the way masque does internally
    function ctx_for(fig; max_width = 700)
        bk = IP._resolve_backend(:cairo)
        Makie.update_state_before_display!(fig)
        ppu = IP._ppu(bk, fig, max_width)
        return bk, ppu, IP.context(bk, fig, ppu, max_width)
    end

    function drawn_near(img, cx, cy; tol = 8)
        ih, iw = size(img)
        notwhite(c) = !(Float64(Makie.red(c)) > 0.95 && Float64(Makie.green(c)) > 0.95 && Float64(Makie.blue(c)) > 0.95)
        x, y = round(Int, cx), round(Int, cy)
        for dy in -tol:tol, dx in -tol:tol
            xx, yy = x + dx, y + dy
            (1 <= xx <= iw && 1 <= yy <= ih) || continue
            notwhite(img[yy, xx]) && return true
        end
        return false
    end

    # The canonical fixture the original core_tests.jl built once, inside the outer
    # `@testset "Masque" begin ... end` (pts/fig/ax/bk/ppu/ctx), and many nested testsets read
    # by bare name. `@testset` wraps its body in a `let`, so those names were locals of the
    # OUTER testset's `let` — a nested `@testset`'s own `let` assigning `fig = Figure(...)`
    # reassigns that already-existing enclosing local rather than shadowing it (Julia's `let`
    # closes over a name that already exists in an enclosing scope), so later testsets
    # silently inherited whatever a previous, possibly unrelated testset last left behind
    # (see PR "Split core_tests.jl by concern with per-testset fixtures" for the audit) —
    # every testset moved out of that single-file chain now calls this instead of relying on
    # leftover state from a sibling testset.
    const DEFAULT_PTS = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]

    function default_fixture(; max_width = 700)
        pts = DEFAULT_PTS
        fig = Figure(size = (600, 400))
        ax = Axis(fig[1, 1])
        scatter!(ax, first.(pts), last.(pts); color = :red, markersize = 16)
        bk, ppu, ctx = ctx_for(fig; max_width)
        return (; fig, ax, pts, bk, ppu, ctx)
    end

    # One commit through the bond: `env` (one layer's wire envelope, or `{items}` for `field`)
    # set into the widget's starting value, decoded, and that field's value returned. A widget
    # or manifest whose bind is bare returns the value itself.
    function commit_field(w, env; field = nothing)
        m = w isa AbstractDict ? w : w.manifest
        owners = w isa AbstractDict ? Dict{String, IP.LayerOwner}() : w.owners
        f = something(field, env isa AbstractDict && haskey(env, "layer") ? string(env["layer"]) : nothing)
        f === nothing && error("commit_field: name the field of an {items} envelope")
        # A hand-built manifest lists no fields: decode the one envelope as that layer's field.
        haskey(m, "fields") || return IP._field_value(m, owners, f, env)
        js = merge(Dict{String, Any}(IP.mount_envelope(m)), Dict{String, Any}(f => env))
        v = IP.bond_from_js(m, owners, js)
        return get(m, "bare", false) === true ? v : getproperty(v, Symbol(f))
    end
end
