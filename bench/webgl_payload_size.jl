# Re-runnable size bench for the :webgl wire format. The `:webgl` payload is a NEW format
# (scene_payload + the vendored WGLMakie bundle), separate from Masque core's PNG+manifest envelope in
# docs/dev/perf-findings.md — so per the profiling standing practice it gets its own committed bench
# here. This prints the live numbers; the recorded envelope lives in
# docs/dev/perf-findings.md's "`:webgl` envelope" section — re-run this and update that section
# when the wire format changes.
#
#   julia --project="${MASQUE_DEV_ENV:-$HOME/.julia/environments/masque-dev}" bench/webgl_payload_size.jl
#
# PACKED vs NUMERIC vs JSON: Pluto's `published_to_js` ships the scene inside its MsgPack-encoded
# state. `packed` is that encoding, from Pluto's own `pack` (see bench/pluto_packed.jl), and is
# the per-cell figure. `shaders` is the part of it that is GLSL source (every plot carries its own
# vertex and fragment shader), `atlas` the part under the glyph-atlas keys. `numeric` is the raw
# bytes of the numeric vectors alone, the figure this bench used to report as the wire; it leaves
# out every map, key, and string, which on these scenes is most of the packed size (#178). The
# JSON size is a labeled upper-bound proxy.
#
# The `gzip` columns measure M2's deferred compression levers reproducibly (via system gzip -9,
# no Julia dep): gzip-of-packed is what compressing the shipped scene would leave (but needs a JS
# msgpack decoder to use), gzip-of-numeric compresses the numeric bytes alone, and gzip-of-JSON is
# the cheap browser path (DecompressionStream → JSON.parse). All deferred — see
# docs/dev/perf-findings.md.

using Masque, WGLMakie
import JSON3
include(joinpath(@__DIR__, "pluto_packed.jl"))

# scene_payload/_wgl_bundle_path live in the :webgl extension (WGLMakie is a weak dep of
# Masque), so reach them via Base.get_extension — same pattern test/runtests.jl uses for the Cairo
# extension.
const _WGLExt = Base.get_extension(Masque, :MasqueWGLMakieExt)

println(
    "WGLMakie bundle (shipped once per notebook, M2): ",
    round(filesize(_WGLExt._wgl_bundle_path()) / 1.0e6; digits = 2), " MB"
)

# Concatenate the raw bytes of every typed numeric Vector: the input to the gzip-bin lever.
function numeric_blob!(buf, x)
    if x isa AbstractDict
        for v in values(x)
            numeric_blob!(buf, v)
        end
    elseif x isa AbstractVector && eltype(x) <: Number
        append!(buf, reinterpret(UInt8, Vector(x)))
    elseif x isa AbstractVector
        for v in x
            numeric_blob!(buf, v)
        end
    end
    return buf
end

# Glyph tiles in the scene: (count, packed bytes of each tile's entry) for every
# `atlas_updates[hash] => [uv, sdf, width, minimum]`.
function atlas_tiles(x, out = Int[])
    if x isa AbstractDict
        for (k, v) in x
            if string(k) == "atlas_updates" && v isa AbstractDict
                for (h, t) in v
                    push!(out, packed_bytes(h) + packed_bytes(t))
                end
            else
                atlas_tiles(v, out)
            end
        end
    elseif x isa AbstractVector && !(eltype(x) <: Number)
        foreach(v -> atlas_tiles(v, out), x)
    end
    return out
end

# system gzip -9 (no Julia dep); returns compressed length in bytes, or nothing if gzip is absent.
function gzip_len(bytes)
    Sys.which("gzip") === nothing && return nothing
    path = tempname()
    try
        write(path, bytes)
        return length(read(pipeline(`gzip -9 -c $path`)))
    finally
        rm(path; force = true)
    end
end

mb(x) = x === nothing ? "n/a" : string(round(x / 1.0e6; digits = 2))

cases = [
    "2D lines (200 pts)" => () -> (f = Figure(; size = (600, 450)); ax = Axis(f[1, 1]); lines!(ax, range(0, 4π, 200), sin.(range(0, 4π, 200))); f),
    "2D scatter+text (40)" => () -> (f = Figure(; size = (600, 450)); ax = Axis(f[1, 1]; title = "t"); xs = range(0, 4π, 40); scatter!(ax, xs, sin.(xs)); f),
    "3D helix (300 pts)" => () -> (f = Figure(; size = (600, 450)); ax = Axis3(f[1, 1]); ts = range(0, 6π, 300); lines!(ax, cos.(ts), sin.(ts), ts ./ 6); f),
]
kb(x) = x === nothing ? "n/a" : string(round(x / 1024; digits = 1))
println("scene payload, per cell — PACKED (Pluto MsgPack, what ships) · shader and atlas shares · numeric sum · gzip levers · JSON proxy:")
for (name, mk) in cases
    fig = mk()
    Makie.update_state_before_display!(fig)
    scene = _WGLExt.scene_payload(fig)
    packed = packed_bytes(scene)
    shaders = shader_bytes(scene)
    atlas = atlas_bytes(scene)
    blob = numeric_blob!(UInt8[], scene)
    tiles = atlas_tiles(scene)
    jsonstr = JSON3.write(scene)
    println(
        "  ", rpad(name, 24),
        "packed ", packed, " B (", mb(packed), " MB)",
        "  shaders ", shaders, " B",
        "  atlas ", atlas, " B",
        "  numeric ", length(blob), " B",
        "  (gzip-packed ", mb(gzip_len(Pluto.pack(scene))),
        " · gzip-bin ", mb(gzip_len(blob)),
        " · gzip-json ", mb(gzip_len(Vector{UInt8}(jsonstr))),
        " · JSON proxy ", mb(length(jsonstr)), ")",
        "  tiles ", length(tiles),
        isempty(tiles) ? "" : string(" (", kb(minimum(tiles)), "–", kb(maximum(tiles)), " KB, mean ", kb(sum(tiles) / length(tiles)), " KB)"),
    )
end
