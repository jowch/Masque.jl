# 9. Wire encoding & precision

`published_to_js` serializes the manifest as **generic MsgPack** maps/arrays (the `Dict{String,Any}` /
`Any[]` root defeats the TypedArray binary fast-path even though leaf vectors are numeric). The
encoding levers were **de-speculated by a measurement experiment** (`bench/encoding_experiment.jl` →
`perf-findings.md`), which changed the verdict from my first design guess:

- **Scalar precision — int-pixel quantization (the win, implemented).** Geometry was `Float32` *pixel*
  coordinates, overkill for ~1px hit-testing. Rounding coords to `Int` cut the geometry term by more
  than half — and it needs **no structural change**: MsgPack already encodes small ints in 1–3
  bytes, the frontend reads numbers either way, and ≤0.5px rounding is inside the hit-test tolerance.
  *Implemented:* `src/interactables.jl` builds per-element geometry vectors via `_q(x)` (`round(Int,
  x)`, non-finite values pass through as `Float32` so a `NaN` gap survives) for
  circles/segments/rects/polygons/regions + grid edges; on a whole realistic manifest the saving is
  smaller, since geometry is one term among the payload's Float64 `x`/`y`. `Float16` is *not* the
  way down: MsgPack has no float16 (it promotes to float32 → no saving) and is lossy above 2048px.
- **Container structure — typed-array fast-path (rejected by the experiment).** Lifting geometry to a
  top-level typed numeric vector to engage the binary fast-path measured only a few percent beyond
  int-quantization — because compact ints already sit near the 2-byte binary floor. The structural
  manifest-shape change is **not worth it**; dropped. (It would only pay off if we kept *floats*,
  which int-quantization already beats.)
- **The precision split (a real constraint).** Per-element **geometry** is quantizable to pixels, but the
  **`AxisTransform` lims/viewport must stay `Float64`**: the drag path inverts pixel→data through
  them and
  the error amplifies — and at O(1)/axis the precision costs nothing. Only per-element geometry is quantized.

The other manifest term — heatmap/image values ([§8](08-scaling.md)) — is bounded by what is shipped,
not by a denser encoding. A sub-pixel grid ships one source value per screen pixel of the axis
viewport (the before/after sizes are in `perf-findings.md`). Reach for these levers before a
quadtree ([§7](07-scope.md)).

