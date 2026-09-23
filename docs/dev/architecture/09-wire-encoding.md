# 9. Wire encoding & precision

`published_to_js` serializes the manifest as **generic MsgPack** maps/arrays (the `Dict{String,Any}` /
`Any[]` root defeats the TypedArray binary fast-path even though leaf vectors are numeric). The
encoding levers were **de-speculated by a measurement experiment** (`bench/encoding_experiment.jl` →
`perf-findings.md`), which changed the verdict from my first design guess:

- **Scalar precision — int-pixel quantization (the win, implemented).** Geometry was `Float32` *pixel*
  coordinates, overkill for ~1px hit-testing. Rounding coords to `Int` measured **58% off the geometry
  term** (5.00 → 2.10 B/coord; 732 → 307 KB at 50k circles) — and it needs **no structural change**:
  MsgPack already encodes small ints in 1–3 bytes, the frontend reads numbers either way, and ≤0.5px
  rounding is inside the hit-test tolerance. *Implemented:* `src/interactables.jl` builds per-element
  geometry vectors as `Int` via `_q(x) = round(Int, x)` (circles/segments/rects/polygons/regions + grid
  edges); on a whole realistic manifest the saving is ~17 % (geometry is one term among the payload's
  Float64 `x`/`y`). `Float16` is *not* the way down: MsgPack has no float16 (it promotes to float32 → no
  saving) and is lossy above 2048px.
- **Container structure — typed-array fast-path (rejected by the experiment).** Lifting geometry to a
  top-level typed numeric vector to engage the binary fast-path measured only **~5% beyond int-quantization**
  (2.00 vs 2.10 B/coord) — because compact ints already sit near the 2-byte binary floor. The structural
  manifest-shape change is **not worth 5%**; dropped. (It would only pay off if we kept *floats*, 5→4 B,
  which int-quantization already beats.)
- **The precision split (a real constraint).** Per-element **geometry** is quantizable to pixels, but the
  **`AxisTransform` lims/viewport must stay `Float64`**: the M4 drag path inverts pixel→data through them and
  the error amplifies — and at O(1)/axis the precision costs nothing. Only per-element geometry is quantized.

The other manifest term — heatmap/image values ([§8](08-scaling.md)) — is bounded by what is shipped,
not by a denser encoding. A sub-pixel grid ships one source value per screen pixel of the axis
viewport. The earlier cap (drop the matrix, keep the edges) measured 4.78 MB → 9.8 KB at 1000²; that
drop is what the sample replaced. Int-pixel geometry quantization shipped in PR #9. Reach for those
before a quadtree ([§7](07-scope.md)).

