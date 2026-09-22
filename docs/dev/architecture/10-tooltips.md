# 10. Tooltips

The `masque"..."` / `Markup` template system. Tooltips are its first consumer; the mechanism
generalises to any surface that overlays structured content on hover (labels, annotations,
panels). User-facing usage (defaults, `masque"..."` examples, styling kwargs) is on the site's
[Tooltips page](https://jowch.github.io/Masque.jl/dev/tooltips/); this section is the mechanism
and wire contract behind it.

## 10.1 Mental model

Every Masque interactable carries a `payloads` array — one JSON-serialisable value per element,
built at render time in Julia. **The payload is data; the template is layout.** When the user
hovers over an element, the browser reads that element's payload entry and interpolates it
into the template to produce the tooltip HTML — no round-trip to Julia, no live callback.

This is forced by the no-server constraint: a statically-exported Masque widget has no Julia
kernel to call. Any content the tooltip shows must already be in the manifest at render time,
either as a template (O(1) per layer) or as data in the payload (O(N) per element, the same
O(N) the interactable already ships for hit-testing). A per-element callback
(`tooltip = p -> @htl"..."`) would require either a live kernel or pre-calling it for every
element at build time — the former is unavailable offline, the latter collapses into a
per-element string array and is O(N × string-bytes) on the wire. The template approach avoids
both.

## 10.2 The `masque"..."` macro and `Markup` type

`masque"..."` is a string macro (exported; underlying function `@masque_str`) that produces a
`Masque.Markup` value. It is the only way to author a template; there is no
`masque(runtime_string)` form.

`Markup` stores the parsed template as an ordered list of segments: each segment is either a
literal `String` (emitted verbatim as HTML into the tooltip) or a
`Field(name::Symbol, spec::Union{Nothing,String})` (a placeholder resolved in the browser from
the hovered element's payload entry).

`$(field)` **does not read a Julia variable** — it is a placeholder for a browser-side payload
lookup resolved at hover time. `$(field:spec)` formats the value with a
[d3-format](https://d3js.org/d3-format) spec before escaping. There is no Julia-object
interpolation in templates.

The literal portions of `masque"..."` are treated as raw HTML; the author is responsible for
escaping `<` and `&` in literal text (same contract as `@htl`). Because `masque"..."` requires a
string literal, a runtime-computed string must travel as a field inside the payload:
pre-render it into `payloads` and reference it with `$(that_field)`.

## 10.3 Validation

Template validation happens at two distinct points. The **documented boundary** between them
is: *Julia validates structure; the browser validates meaning.*

**Phase 1 — macro-expansion (structural, no payload).** The macro parses the template string
at compile time and catches unbalanced/empty/unclosed `$(...)` delimiters, non-identifier field
names, and structurally-invalid d3-format specs. Errors surface as `TemplateValidationError`
with a caret underline pointing at the offending span, attached to the source file and line of
the `masque"..."` call — the user sees them the instant the cell parses, before `masque()` is ever
called.

**Phase 2 — build-time field check (payload-aware).** When `masque()` / `build_manifest` is
called with a `Markup` tooltip, each template's field names are resolved against the actual
payload keys. A field present in the template but absent from the payload is a build-time
`ArgumentError`, with a "did you mean?" suggestion (Levenshtein edit distance ≤ 2). This check
only runs when the layer's payloads are `NamedTuple`s (the default for the built-in
interactables); for `Dict`-valued or heterogeneous payloads, it's skipped and a missing
`$(field)` renders empty at hover instead. `:grid` (heatmap/image) layers carry no per-element
payload; a template there resolves the synthesised fields `$(i)`, `$(j)`, and `$(value)`, which
are likewise not field-validated at build.

d3-format spec *structure* (the type character and arrangement of flags) is validated in Julia
against d3's canonical grammar; the *meaning* of precision, trim, and sign modifiers is only
resolved by the browser's `format()` — a spec can pass Julia and still format unexpectedly
(check d3-format's behaviour for that type character).

A `@generated` compile-time field check (to catch typos before `build_manifest`, for
concretely-typed `NamedTuple` payloads) is deferred — it's a no-op on `Vector{Any}` /
heterogeneous payloads, so Phase 2 stays the only build-time check for now.

## 10.4 Wire format

Each entry in the manifest `layers` array carries at most one of these two optional fields:

| Field | Wire type | Present when |
|---|---|---|
| `template` | `Segment[]` | `tooltip` is a `Markup` |
| `tooltip` | `false` | suppress requested |
| *(neither present)* | — | auto-table default |

`Segment` is `string \| { f: string, spec?: string }` — a literal run or a field placeholder.
The template is **pre-parsed in Julia** at build time and shipped as structured data; the
browser never re-parses a template string.

The per-element `tooltips[]` string array that pre-M2.3 versions emitted is retired. Tooltip
content is entirely client-side, rendered on hover from the existing `payloads[i]` entry — this
keeps the tooltip wire cost O(1) per layer regardless of element count; the per-element
envelope is unchanged (see `perf-findings.md` §"Scope bounds for downstream phases" for the
measured comparison).

The top-level manifest field `tipStyle` (`Record<string,string>`, optional) is a CSS-var dict
of set `tooltip_*` kwargs, applied once to the shadow host at mount.

The top-level `background` field (CSS colour string; optional on `build_manifest` directly, but
`masque()` always sets it) is the figure's own
background colour (`fig.scene.backgroundcolor[]`) — the tooltip's light/dark theme is derived
from it client-side via CSS relative-colour syntax (`lch(from var(--masque-fig-bg) …)`, with a
static-light/OS-dark `@supports not (…)` fallback for browsers without it), not just OS
`prefers-color-scheme`, so a dark figure on a light Pluto page still gets a dark tooltip. A
per-layer `colors` field (optional; a single CSS string, or a shared palette + one index per
element) drives a 3px accent border in the hovered element's own colour — resolved only for a
`PointInteractable(ax, p::Makie.Scatter)`-derived layer whose colour is resolvable; omitted
(no accent) otherwise. Both are O(1)-per-manifest/per-layer, same cost-model rationale as
`tipStyle` above (see `perf-findings.md`'s figure-background/`colors` reconciliation entry).

`HitLayer` carries `template?: TemplateSegment[]`, `tooltip?: false`, and `colors?: string |
{palette, index}`; `Manifest` carries `tipStyle?: Record<string, string>` and `background?:
string`. See `frontend/src/types.ts`.

## 10.5 Security model

**Template markup is author-trusted.** The literal HTML in `masque"..."` is inserted as
`innerHTML` without sanitisation. The author who writes a Pluto notebook already has arbitrary
Julia code execution, so sanitising their own template structure is theater (and a
sanitisation library such as DOMPurify adds ~8–15 KB gzip for no real benefit in this context).
A `<script>` tag in a literal template segment executes — expected for authors who
intentionally embed scripts in their tooltips.

**Interpolated data is escaped by default.** Every value resolved from `$(field)` and every
cell in the auto-table is HTML-escaped with the OWASP five-character set (`& < > " '`) before
insertion.

**URL-context caveat.** HTML escaping does not neutralise scheme injection. If `$(x)` is used
as a *whole* `href` or `src` attribute value and the data contains a `javascript:` URL, the
scheme survives escaping and can execute — author responsibility if a template constructs
`<a href="$(x)">` over untrusted URL data.

## 10.6 Deferred / forward path

| Capability | Status | Forward path |
|---|---|---|
| Per-element function tier (`tooltip = p -> @htl"..."`) | **Cut** — O(N) build footgun; per-element *values* belong in the payload | Partially covered by `$(field:raw)` (below) |
| `$(field:raw)` — unescaped field interpolation | Deferred | Explicit opt-in marker (Bokeh `{safe}`-style); pre-render HTML into a payload field, inject unescaped |
| Per-layer `tooltip_*` style override | Deferred | Non-breaking kwarg on the per-layer interactable constructor |
| Compile-time field validation (`@generated`) | Deferred | No-op on heterogeneous payloads; build-time Phase 2 runs for `NamedTuple` payloads |
| Mark-anchored tooltip placement (circles/rects/segments/polyline/lines/polygons/grid) | **Shipped** (tooltip-anchor-chrome PR) | Box centred above the mark's top edge, gap 10px; flips below on top-clip, shifts + moves the caret (`--masque-caret-x`) on side-clip. `frontend/src/geometry.ts`'s `anchorFor`/`computeAnchoredPlacement`. A `:lines` anchor slides to the nearest point on the whole path. |
| Caret edge-flipping / viewport-collision clamping (axis/threshold/ROI/view — cursor-following) | **Shipped** (first overlay polish PR) | Card stays inside the overlay; caret flips via `.flip-x` / `.flip-y` |
| Inline date formatting | Deferred (would add `d3-time-format`) | Format dates in Julia into a payload string field |
| Following a Pluto notebook theme toggle | **N/A** — official Pluto has none | OS `prefers-color-scheme` *is* Pluto's theme (Settings is help text; no class / `data-theme` / JS event). Revisit only if Pluto ships a real override with a stable signal. |

