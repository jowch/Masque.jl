# Shared by the `:webgl` benches (`webgl_payload_size.jl`, `vs_cairo.jl`,
# `gesture_channel_webgl.jl`): the bytes a scene costs once Pluto packs it.
#
# `published_to_js` objects travel inside Pluto's notebook state, which Pluto MsgPack-encodes
# (`Pluto.pack`, `src/webserver/MsgPack.jl`) for the websocket and base64-encodes into a static
# export. Its typed-array extension ships a `Vector{Float32}` (and the other JS typed-array
# eltypes) as raw bytes plus a short header; every map, key, string, and scalar is ordinary
# MsgPack. `packed_bytes` calls Pluto's own `pack`, so it counts all of that.
#
# `numeric_bytes` is the older figure: the raw bytes of every concrete numeric vector, with no
# maps, keys, or strings. It is a lower bound on `packed_bytes`, printed next to it so the two are
# never confused again (#178).
#
# MsgPack is compositional, so the packed bytes of a key plus its value are exactly that entry's
# share of the whole. `atlas_bytes` sums that share for the glyph-atlas keys WGLMakie emits, and
# `shader_bytes` for the GLSL source each plot carries.

import Pluto

packed_bytes(x) = length(Pluto.pack(x))

function numeric_bytes(x)
    if x isa AbstractDict
        return sum(numeric_bytes, values(x); init = 0)
    elseif x isa AbstractArray
        T = eltype(x)
        isconcretetype(T) && isbitstype(T) && T <: Number && return sizeof(T) * length(x)
        return sum(numeric_bytes, x; init = 0)
    end
    return 0
end

const ATLAS_KEYS = ("glyph_data", "atlas_updates", "atlas")
const SHADER_KEYS = ("vertex_source", "fragment_source")

# Packed bytes of every entry under one of `keys` (key included), anywhere in the tree.
function keyed_bytes(x, keys)
    if x isa AbstractDict
        return sum(pairs(x); init = 0) do (k, v)
            string(k) in keys ? packed_bytes(k) + packed_bytes(v) : keyed_bytes(v, keys)
        end
    elseif x isa AbstractArray && !(isbitstype(eltype(x)) && eltype(x) <: Number)
        return sum(v -> keyed_bytes(v, keys), x; init = 0)
    end
    return 0
end

atlas_bytes(x) = keyed_bytes(x, ATLAS_KEYS)
shader_bytes(x) = keyed_bytes(x, SHADER_KEYS)
