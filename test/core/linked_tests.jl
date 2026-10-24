using Test, Masque, CairoMakie, Makie
using DataFrames
include(joinpath(@__DIR__, "..", "testutils.jl"))

# `linked(...)` (#346): plots of the same rows share one field, whose value is the rows.
@testset "Linked selections" begin
    commit(w, f, env) = Masque.bond_from_js(w, merge(Dict{String, Any}(Masque.mount_envelope(w.manifest)), Dict{String, Any}(f => env)))
    msg(f) = try
        f()
        ""
    catch e
        e isa ArgumentError || rethrow()
        sprint(showerror, e)
    end

    function two_panels(n = 5)
        fig = Figure(size = (600, 300))
        a1, a2 = Axis(fig[1, 1]), Axis(fig[1, 2])
        su = scatter!(a1, 1:n, 1:n)
        sp = scatter!(a2, 1:n, (1:n) .^ 2)
        return fig, a1, a2, su, sp
    end

    df = DataFrame(cell_id = ["c$i" for i in 1:6], cluster = [1, 1, 2, 2, 3, 3], u = 1:6, p = 6:-1:1)

    @testset "positions: one field, its plots have none, the value is row positions" begin
        fig, _, _, su, sp = two_panels()
        w = masque(fig, (cells = linked(su, sp; select = :many),))
        m = w.manifest
        @test m["fields"] == ["cells"]
        g = only(m["groups"])
        @test g["id"] == "cells" && g["n"] == 5 && g["many"] === true && !haskey(g, "rows")
        @test sort(g["members"]) == ["scatter", "scatter_2"]
        for d in m["layers"]
            @test d["group"] == "cells"
            @test "click" in d["events"]
            @test !haskey(d, "many")
        end
        @test m["initial"]["cells"] == Dict("rows" => Int[])
        @test Masque.initial_bond(w).cells == Int[]
        @test commit(w, "cells", Dict("rows" => [3, 0])).cells == [4, 1]
        @test_throws ArgumentError commit(w, "cells", Dict("rows" => [5]))

        one = masque(fig, (cells = linked(su, sp),))
        @test !haskey(only(one.manifest["groups"]), "many")
        @test Masque.initial_bond(one).cells === nothing
        @test commit(one, "cells", Dict("row" => 2)).cells == 3
        @test commit(one, "cells", nothing).cells === nothing
    end

    @testset "bare, bind, and id" begin
        fig, _, _, su, sp = two_panels()
        @test Masque.initial_bond(masque(fig; bind = linked(su, sp))) === nothing
        w = masque(fig, linked(su, sp; id = :pick))
        @test w.manifest["fields"] == ["pick"]
        w = masque(fig; bind = (cells = linked(su, sp; select = :many),))
        @test w.manifest["fields"] == ["cells"]
        @test w.manifest["initial"]["cells"] == Dict("rows" => Int[])
        # Unnamed and bare: the default name.
        @test masque(fig, linked(su, sp)).manifest["fields"] == ["linked"]
    end

    @testset "keys from payloads: one scatter per cluster, axes as members, a legend" begin
        fig = Figure(size = (600, 300))
        au, ap = Axis(fig[1, 1]), Axis(fig[1, 2])
        pts = []
        for sub in groupby(df, :cluster)
            push!(pts, interactables(scatter!(au, sub.u, sub.u; label = "c$(sub.cluster[1])"); payloads = sub))
            push!(pts, interactables(scatter!(ap, sub.p, sub.p); payloads = sub))
        end
        axislegend(au)
        w = masque(fig, pts..., (cells = linked(au, ap; key = :cell_id, select = :many),))
        m = w.manifest
        @test Set(m["fields"]) == Set(["cells", "legend"])
        g = only(m["groups"])
        @test g["n"] == 6 && g["key"] == "cell_id"
        @test length(g["members"]) == 6
        # The keys stay in Julia: the manifest ships rows, not cell ids.
        @test !haskey(g, "keys")
        @test !occursin("\"c1\"", repr(g))
        # Each panel's plot of a cluster holds that cluster's two rows.
        @test sort(collect(values(g["rows"]))) == [[0, 1], [0, 1], [2, 3], [2, 3], [4, 5], [4, 5]]
        @test commit(w, "cells", Dict("rows" => [5, 0])).cells == ["c6", "c1"]
        @test commit(w, "cells", Dict("rows" => Int[])).cells == String[]
        @test eltype(commit(w, "cells", Dict("rows" => [1])).cells) == String

        # selected= takes the keys.
        w = masque(fig, pts..., (cells = linked(au, ap; key = :cell_id, select = :many),); selected = (cells = ["c3", "c1"],))
        @test w.manifest["initial"]["cells"] == Dict("rows" => [2, 0])
        @test Masque.initial_bond(w).cells == ["c3", "c1"]
        @test occursin("no row with key \"zz\"", msg(() -> masque(fig, pts..., (cells = linked(au, ap; key = :cell_id, select = :many),); selected = (cells = ["zz"],))))

        # Without a key, an axis of several plots can't pair its rows.
        e = msg(() -> masque(fig, pts..., (cells = linked(au, ap),)))
        @test occursin("holds 3", e) && occursin("key = :field", e)
        # A field the payloads lack.
        e = msg(() -> masque(fig, pts..., (cells = linked(au, ap; key = :nope),)))
        @test occursin("`key = :nope` is not a field", e) && occursin("cell_id", e)
    end

    @testset "a key repeated in a plot picks its marks together; a key only one member has" begin
        fig = Figure(size = (600, 300))
        a1, a2 = Axis(fig[1, 1]), Axis(fig[1, 2])
        s_all = scatter!(a1, df.u, df.u)
        sub = df[df.cluster .== 2, :]
        s_sub = scatter!(a2, sub.p, sub.p)
        w = masque(fig, (cells = linked(interactables(s_all; payloads = df), interactables(s_sub; payloads = sub); key = :cell_id),))
        g = only(w.manifest["groups"])
        @test g["n"] == 6
        @test g["rows"]["scatter_2"] == [2, 3]
        # A cell only the left panel has is still the value.
        @test commit(w, "cells", Dict("row" => 0)).cells == "c1"

        # Keyed by cluster: rows are clusters.
        w = masque(fig, (clusters = linked(interactables(s_all; payloads = df), interactables(s_sub; payloads = sub); key = :cluster),))
        g = only(w.manifest["groups"])
        @test g["n"] == 3
        @test g["rows"]["scatter"] == [0, 0, 1, 1, 2, 2]
        @test commit(w, "clusters", Dict("row" => 1)).clusters == 2

        # Members that share no key: almost always "17" against 17.
        e = msg(() -> masque(fig, (cells = linked(interactables(s_all; key = string.(1:6)), interactables(s_sub; key = [1, 2])),)))
        @test occursin("share no key", e) && occursin("isequal", e)
    end

    @testset "a member's own keys" begin
        fig = Figure(size = (600, 300))
        a1, a2 = Axis(fig[1, 1]), Axis(fig[1, 2])
        bars = barplot!(a2, 1:3, [2, 2, 2])
        s = scatter!(a1, df.u, df.u)
        w = masque(fig, (clusters = linked(interactables(s; key = df.cluster), interactables(bars; key = 1:3)),))
        g = only(w.manifest["groups"])
        @test g["n"] == 3
        @test commit(w, "clusters", Dict("row" => 2)).clusters == 3
        @test occursin("its `key` has 2", msg(() -> masque(fig, (c = linked(interactables(s; key = [1, 2]), interactables(bars; key = 1:3)),))))
        # `key` outside a group.
        @test occursin("is listed in none", msg(() -> masque(fig, interactables(s; key = df.cluster))))
    end

    @testset "labels that follow their points, on one axis" begin
        fig = Figure(size = (400, 300))
        ax = Axis(fig[1, 1])
        s = scatter!(ax, 1:3, 1:3)
        t = text!(ax, 1:3, 1:3; text = ["a", "b", "c"])
        w = masque(fig, (cities = linked(s, t),))
        @test only(w.manifest["groups"])["n"] == 3
        @test commit(w, "cities", Dict("row" => 2)).cities == 3
    end

    @testset "errors name the fix" begin
        fig, a1, a2, su, sp = two_panels()
        _, _, _, _, longer = two_panels(7)
        sp7 = scatter!(a2, 1:7, 1:7)
        e = msg(() -> masque(fig, (cells = linked(su, sp7),)))
        @test occursin("has 5", e) && occursin("has 7", e) && occursin("key", e)
        @test occursin("pass `select` to `linked(...)`", msg(() -> masque(fig, (cells = linked(interactables(su; select = :many), sp),))))
        @test occursin("no field of its own", msg(() -> masque(fig, (a = interactables(su), cells = linked(su, sp)))))
        @test occursin("no field of its own", msg(() -> masque(fig; bind = (a = su, cells = linked(su, sp)))))
        @test occursin("two `linked(...)` groups", msg(() -> masque(fig, (c1 = linked(su, sp), c2 = linked(su, sp)))))
        @test occursin("listed twice", msg(() -> masque(fig, (c = linked(su, su, sp),))))
        @test occursin("selected = (cells = …", msg(() -> masque(fig, (cells = linked(su, sp),); selected = (scatter = 1,))))
        @test occursin("one row", msg(() -> masque(fig, (cells = linked(su, sp),); selected = (cells = [1, 2],))))
        @test occursin("positions 1:5", msg(() -> masque(fig, (cells = linked(su, sp; select = :many),); selected = (cells = [9],))))
        hm_fig = Figure(); hax = Axis(hm_fig[1, 1]); hm = heatmap!(hax, rand(3, 3)); hs = scatter!(hax, 1:9, 1:9)
        @test occursin("no marks to link", msg(() -> masque(hm_fig, (c = linked(hm, hs),))))
        @test_throws ArgumentError linked()
        @test_throws ArgumentError linked(su; select = :some)
        @test_throws ArgumentError linked(su; key = 3)
    end

    @testset "selected= by position" begin
        fig, _, _, su, sp = two_panels()
        w = masque(fig, (cells = linked(su, sp; select = :many),); selected = (cells = [4, 2, 4],))
        @test w.manifest["initial"]["cells"] == Dict("rows" => [3, 1])
        @test Masque.initial_bond(w).cells == [4, 2]
        w = masque(fig; bind = linked(su, sp), selected = 3)
        @test w.manifest["initial"]["linked"] == Dict("row" => 2)
        @test Masque.initial_bond(w) == 3
    end

    @testset "onchange: the state carries the group, and a changed table clears it" begin
        fig, _, _, su, sp = two_panels()
        seen = []
        w = masque(fig, (cells = linked(su, sp; select = :many),); onchange = st -> push!(seen, st))
        @test last(seen).cells == Int[]
        @test w.manifest["fields"] == ["cells"]
        counts = Masque._pick_counts(w.manifest)
        @test haskey(counts, "cells")
    end
    @testset "review #417: other fields' selected=, an empty start, names, bind by name" begin
        fig, a1, _, su, sp = two_panels()
        b = barplot!(a1, 1:3, [1, 2, 3])
        # selected= for another field, with a group in the call.
        w = masque(fig, (cells = linked(su, sp), bars = interactables(b)); selected = (bars = 2,))
        @test Masque.initial_bond(w).bars.index == 2
        @test Masque.initial_bond(w).cells === nothing
        w = masque(fig, (cells = linked(su, sp; select = :many), bars = interactables(b)); selected = (bars = 2, cells = [3]))
        @test Masque.initial_bond(w).cells == [3]
        # A `:one` group started empty.
        @test Masque.initial_bond(masque(fig, (cells = linked(su, sp),); selected = (cells = nothing,))).cells === nothing
        # A group named like a layer.
        @test occursin("also a layer's id", msg(() -> masque(fig, linked(su, sp; id = :scatter))))
        # bind by name keeps the group's field.
        w = masque(fig, (cells = linked(su, sp),), interactables(b); bind = (:cells,))
        @test w.manifest["fields"] == ["cells"]
        @test commit(w, "cells", Dict("row" => 1)).cells == 2
        @test Masque.bondtype(linked(su, sp)) === Any
        # A plot's own keys go on a plot listed in the group, not one that joins through its axis.
        @test occursin("joins through its axis", msg(() -> masque(fig, interactables(su; key = 1:5), (c = linked(a1, sp),))))
    end
end
