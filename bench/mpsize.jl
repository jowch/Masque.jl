# Shared by bench/payload_envelope.jl and bench/gesture_channel.jl.
#
# ponytail: a msgpack *size* counter, not a msgpack library — models Pluto's published_to_js
# wire format (MsgPack) without adding MsgPack.jl to the package deps. We only need the byte
# count, and the spec's sizing rules are a few lines. Upgrade to MsgPack.jl if exact bytes
# ever matter. Encodings: https://github.com/msgpack/msgpack/blob/master/spec.md
_str(n) = (n < 32 ? 1 : n < 256 ? 2 : n < 65536 ? 3 : 5) + n
_int(n) = (-32 <= n < 128 ? 1 : abs(n) < 128 ? 2 : abs(n) < 32768 ? 3 : abs(n) < 2^31 ? 5 : 9)
_hdr(n) = n < 16 ? 1 : n < 65536 ? 3 : 5
mp(x::AbstractString) = _str(ncodeunits(x))
mp(x::Symbol) = _str(ncodeunits(String(x)))
mp(::Nothing) = 1
mp(x::Bool) = 1
mp(x::Integer) = _int(Int(x))                   # element geometry is Int[] now (quantized, 1–3 B/coord)
mp(x::Float32) = 5                              # msgpack float32 (grid values[] + threshold/roi geom)
mp(x::AbstractFloat) = 9                              # float64 (axis transform lims/viewport)
mp(x::AbstractDict) = _hdr(length(x)) + sum(k -> mp(k) + mp(x[k]), keys(x); init = 0)
mp(x::NamedTuple) = _hdr(length(x)) + sum(p -> _str(ncodeunits(String(p[1]))) + mp(p[2]), pairs(x); init = 0)
mp(x::Union{AbstractVector, Tuple}) = _hdr(length(x)) + sum(mp, x; init = 0)
mp(x) = _hdr(length(x)) + 5 * length(x)               # Point2f & friends → array of Float32 (not hit by these cases)
