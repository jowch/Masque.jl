# 4. Custom interactions — same infra, three ergonomic tiers

The convergent lesson from Bokeh / Plotly / Vega-Lite / Observable Plot: **linkage is payload-based,
and the user should never write JavaScript.** A user's custom interaction produces `HitLayer`s like
everything else. The three tiers, with worked examples, are on the user site's
[Custom hits](../../src/custom.md) page:

- **A — declarative regions** (`RegionInteractable`): circles, rectangles, and polygons in data
  space, one payload each. The framework owns how they react.
- **B — a closure against the live context** (`FunctionInteractable`): `f(ctx)::Vector{HitLayer}`,
  for geometry computed after layout. One function can return layers on several axes.
- **C — a full struct**: implement `hitlayers` (plus optional `validate`, `events`, `hoverstyle`,
  `hit_tol`, and `bondtype`/`transform_bond` for a non-element commit, [§5](05-bond-value.md)).
  It is indistinguishable from a built-in: same manifest path, same overlay, same `@bind`.
  Tooltip content comes from `Masque.tooltip_spec(i)` ([§10](10-tooltips.md)); the `tooltip_*`
  keywords on `masque()` are styling only.

**Linkage = shared payloads through Pluto reactivity.** Two interactables writing the same payload
field into the same `@bind` variable *are* linked brushing — the Pluto reactive graph is our
`ColumnDataSource`. No central mutable selection store is introduced; that is the point of the
no-server architecture.

**No tier supplies rendering.** All three declare *geometry* — where the regions are and what
payload each carries. What gets drawn belongs to Makie (the base frame) or to the overlay's fixed
chrome — highlights and the ROI box (`frontend/src/mount.ts`), tooltips ([§10](10-tooltips.md)). An
interaction that recomputes a preview frame in Julia during a gesture ([§12](12-gesture-channel.md))
needs a fourth tier supplying rendering as well as geometry. That tier is the extension point; no
API is specified here, and nothing in [§12](12-gesture-channel.md) depends on one. See
[§12.9](12-gesture-channel.md#129-prerequisites-for-a-user-facing-surface).
