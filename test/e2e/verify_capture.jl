# Seam closure for the @bind round-trip: feed the value the browser ACTUALLY emitted
# (captured.json, written by click.mjs from the real host.value) through the real Julia
# `transform_value` and assert the typed InteractionEvent. The runtests.jl contract test
# proves transform_value against a payload synthesized from the manifest; this proves
# `layer`/`index` against the byte-for-byte browser emission — stitching emit→consume with no
# synthesized middle (the closest we get to the Pluto round-trip without launching a Pluto
# kernel).
#
# `payload` is deliberately NOT checked against the capture for an element kind: since
# `_bond_payload` (render.jl), the payload is reconstructed from the widget's own manifest —
# `ev.payload === payloads[i]` — and as of #109 there is no browser copy left to discard: a
# real click no longer puts a `"payload"` key on the wire for these kinds at all, so a captured
# payload proves nothing about reconstruction regardless of what it contains (or whether it's
# present). What we assert instead is the contract itself: overwrite the parsed capture's
# `"payload"` with a sentinel and confirm the reconstructed event is unaffected. This also makes
# this file, incidentally, the one place in CI that feeds a real no-`payload` browser capture
# through `transform_value` — the unit tests only ever synthesize one. The z-carrying property
# this file used to pin via the 3D capture is already covered where it now lives, at the level
# that actually consumes it — `test/core/axis3_polar_tests.jl:124` and `:152` assert a 3-D
# scatter's payload is `(; index, x, y, z)` — so dropping that check here loses no coverage.
#
#   julia test/e2e/verify_capture.jl <artifact-dir>
#
# WGLMakie is a weak dep of Masque, so a bare `--project=.` can't `using WGLMakie` — same
# temp-env dance as make_page.jl / examples/webgl_demo.jl.
import Pkg
Pkg.activate(; temp = true)
Pkg.develop(path = normpath(joinpath(@__DIR__, "..", "..")))   # test/e2e -> package root
Pkg.add(["WGLMakie", "JSON3", "AbstractPlutoDingetjes"])
Pkg.instantiate()

using Masque
using WGLMakie
import JSON3
import AbstractPlutoDingetjes as APD

dir = abspath(ARGS[1])
# Parse to Dict{String,Any} (nested too) — mirrors what Pluto hands transform_value, not a
# JSON3 lazy view.
captured = JSON3.read(read(joinpath(dir, "captured.json"), String), Dict{String, Any})

# One widget per capture, each rebuilt from the SAME figure make_page.jl used to produce it.
# `transform_value` reconstructs an element hit's payload out of its own widget's manifest
# rather than trusting the browser's copy, so feeding one widget a capture emitted by a
# different figure would silently reconstruct the wrong element — which is exactly what the
# Axis3 assertion below would then catch.
fig = Figure(; size = (400, 300)); ax = Axis(fig[1, 1]); scatter!(ax, 1:5, (1:5) .^ 2)
w = masque(fig)

fig3 = Figure(; size = (400, 300))
ax3 = Axis3(fig3[1, 1]; azimuth = 0.4, elevation = 0.5)
scatter!(ax3, Point3f[(1, 2, 3), (4, 5, 6), (7, 8, 2)]; markersize = 16, color = :red)
w3 = masque(fig3)

figp = Figure(; size = (400, 300))
axp = PolarAxis(figp[1, 1])
scatter!(
    axp,
    Point2f[(0.0, 1.0), (π / 2, 2.0), (π, 1.5), (3π / 2, 2.5)];
    markersize = 16, color = :red,
)
wp = masque(figp)

# The manifest's own payload object for a given layer/index — the value reconstruction must
# produce regardless of what the capture says.
manifest_payload(w, layer_id::Symbol, index::Integer) =
    only(filter(d -> d["id"] == string(layer_id), w.manifest["layers"]))["payloads"][index + 1]

# Proves the payload half of the contract: copy the parsed capture, overwrite its "payload" with
# an obviously-wrong sentinel, and confirm transform_value still returns the manifest's own
# object — unchanged from what an untouched capture reconstructs. Never touches the .json files
# on disk (`copy` is on the parsed Dict).
function assert_payload_ignored(w, captured, layer_id::Symbol, index::Integer, label::AbstractString)
    poisoned = copy(captured)
    poisoned["payload"] = "SENTINEL-must-never-surface"
    ev_poisoned = APD.Bonds.transform_value(w, poisoned)
    want = manifest_payload(w, layer_id, index)
    ev_poisoned.payload === want ||
        error("$label: payload not reconstructed from the manifest (got $(ev_poisoned.payload), want $want)")
    ev_untouched = APD.Bonds.transform_value(w, captured)
    return ev_untouched.payload === ev_poisoned.payload ||
        error("$label: poisoning the capture's payload changed the reconstructed result")
end

ev = APD.Bonds.transform_value(w, captured)   # the REAL browser emission -> InteractionEvent

ev isa Masque.InteractionEvent || error("transform_value did not return an InteractionEvent: $(typeof(ev))")
ev.layer === :scatter || error("layer mismatch: $(ev.layer)")
ev.index == 0 || error("index mismatch: $(ev.index)")
assert_payload_ignored(w, captured, :scatter, 0, "scatter")

println("seam OK — browser host.value -> ", ev)

# Axis3 case (WS-3D): same seam. The z-carrying payload shape is pinned in
# test/core/axis3_polar_tests.jl (lines 124, 152), not here — see the header comment.
captured3 = JSON3.read(read(joinpath(dir, "captured3d.json"), String), Dict{String, Any})
ev3 = APD.Bonds.transform_value(w3, captured3)
ev3 isa Masque.InteractionEvent || error("transform_value (3D) did not return an InteractionEvent: $(typeof(ev3))")
ev3.layer === :scatter || error("3D layer mismatch: $(ev3.layer)")
ev3.index == 0 || error("3D index mismatch: $(ev3.index)")
assert_payload_ignored(w3, captured3, :scatter, 0, "Axis3")

println("seam OK (Axis3) — browser host.value -> ", ev3)

# PolarAxis case: same seam.
capturedp = JSON3.read(read(joinpath(dir, "capturedpolar.json"), String), Dict{String, Any})
evp = APD.Bonds.transform_value(wp, capturedp)
evp isa Masque.InteractionEvent || error("transform_value (polar) did not return an InteractionEvent: $(typeof(evp))")
evp.layer === :scatter || error("polar layer mismatch: $(evp.layer)")
evp.index == 0 || error("polar index mismatch: $(evp.index)")
assert_payload_ignored(wp, capturedp, :scatter, 0, "PolarAxis")

println("seam OK (PolarAxis) — browser host.value -> ", evp)
