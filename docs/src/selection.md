# Selection

## Reacting to a click

Every `masque(...)` bond value is `nothing` until a click, then an [`InteractionEvent`](@ref)
with `layer` (the clicked interactable's `id`), `index` (0-based, within that layer), and
`payload`. A cell that reads the bond re-runs on every click:

```julia
@bind ev masque(fig, PointInteractable(ax, pts; id = :scatter))
```

```julia
ev === nothing ? "nothing selected" : "clicked #$(ev.index) in :$(ev.layer)"
```

## Linked selection across plots

Because `layer`/`index`/`payload` are plain data, one click can drive any number of
downstream cells — filter a table, highlight a second plot, recompute a fit. Give the
`payloads` on two interactables the same shape and key on it to link them without any Masque
API:

```julia
rows = ev === nothing ? data : filter(r -> r.id == ev.payload["id"], data)
```

## `selected=` — pre-highlighting on mount

A click's highlight (above, and more on this below) is per-viewer browser state: it lives in
the widget in front of one person, which is right for a UI gesture — two people looking at
the same live notebook, or the same static export, shouldn't fight over each other's
highlight. `selected=` draws a highlight too, but it's the opposite kind of thing: it's
carried in the manifest, declarative, computed once by the notebook, and the same for every
viewer. The two happen to render with the same recipe today; that's not a reason to treat
them as one mechanism — an author's assertion and a reader's click are different claims about
the plot.

Pass `selected` to any `masque(...)` call to highlight elements the moment the widget mounts,
before any click:

```julia
masque(fig, PointInteractable(ax, pts; id = :scatter); selected = Dict(:scatter => [0, 2]))
```

`selected` is a `layer_id => indices` map. Indices are 0-based and match
`InteractionEvent.index`. Supported kinds: `circles` / `rects` / `polygons` (selected wash)
and `segments` / `polyline` (selected ring). Unsupported kinds (`grid`, `axis`, …) or
out-of-range indices throw `ArgumentError` at build time — fail loud, like a wrong-length
`payloads=`. Keys are layer ids: for the single-layer kinds that's the interactable's `id`,
but [`RegionInteractable`](@ref) splits into suffixed layers (`:id_c` circles / `:id_r` rects
/ `:id_p` polygons) — key on those.

A click isn't bound by that kind list, because it isn't drawing from `selected=` at all:
clicking a heatmap/image cell pins that cell even though `:grid` can't take a `selected=`
pre-highlight, and clicking a legend entry pins every element of the series it links to, not
the legend swatch itself (see [Legend](@ref)).

## Persisting a selection across re-renders

Clicking an element pins it highlighted immediately, in the browser — no round trip through
Julia, no bond to feed back into anything. Clicking a different element moves the highlight;
it doesn't accumulate, since the echo mirrors the bond value and that's a single
[`InteractionEvent`](@ref). Enter/Space on a keyboard-focused element commits through the
same path as a mouse click. A `selects`-[`ROIInteractable`](@ref)'s release pins everything
its box enclosed, the same way — see [Multi-element selectors](@ref) below.

The highlight resets when the widget remounts, by design: an index is only meaningful
relative to the data that produced it, and a remount means the figure was rebuilt upstream —
possibly with elements reordered, added, or removed. Restoring the old highlight onto
whatever now sits at that index would be silently wrong; dropping it is the honest behavior.

If you want a highlight to survive a rebuild, say so explicitly with `selected=` (above) —
give it the indices you believe still apply in the new figure. That's necessarily something
only you, the notebook author, can assert; nothing in the manifest tells Masque whether index
3 in the rebuilt figure is "the same" point as index 3 in the old one.

One thing you no longer have any reason to try: feeding a widget's own bond value back into
that same call's `selected=`,

```julia
# DOESN'T WORK — ev and masque(...; selected=...) are in the same cell, feeding each other
@bind ev masque(fig, PointInteractable(ax, pts; id = :scatter); selected = Dict(:scatter => [ev.index]))
```

is a Pluto reactive cycle: Pluto detects it and reports **"Cyclic references"** instead of
running the cell. A click already pins on its own, so this pattern buys you nothing.

The click-echo is a single element, last pick wins — it's not built for accumulating a
*growing* set across many clicks. For that, see
[`examples/demo.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/demo.jl)'s
"Selection round-trip" cells: a persistent `Ref` accumulates clicked indices across reruns
and feeds the growing set to a second figure's `selected=`. That's a different job from the
highlight above — accumulation instead of last-pick-wins — and it remains the right tool for
it.

## Multi-element selectors

[`ROIInteractable`](@ref) is an [`AbstractSelector`](@ref): pair it with a
`selects = :scatter` keyword pointing at another layer, and its drag box selects every
element of `:scatter` it currently encloses, rather than the single `{layer, index}` an
ordinary click reports. `selects` only works when the target layer is a `circles` or `grid`
kind — i.e. built from [`PointInteractable`](@ref) or the grid form of
[`RectInteractable`](@ref) — pointing it at any other kind fails loud. The bond value becomes
a `Vector{InteractionEvent}` — one entry per enclosed point — instead of a single
`InteractionEvent`:

```julia
begin
    scatter!(ax, first.(pts), last.(pts))
    roi = ROIInteractable(ax; bounds = (0.0, 10.0, 0.0, 10.0), selects = :scatter)
end
```

```julia
@bind picked masque(fig, [PointInteractable(ax, pts; id = :scatter), roi])
# picked isa Vector{InteractionEvent} once you release a drag over some points
```

Releasing the drag pins every enclosed element highlighted, the same click-echo as an
ordinary click — that `Vector` is "the current bond value" in the same sense a single click's
`InteractionEvent` is. This coexists with a `selected=` pre-highlight rather than replacing
it: elements pinned by `selected=` stay highlighted alongside whatever the ROI just selected.

See [`gallery/gallery.jl`](@ref Examples)'s "Box-select scatter" recipe for the full worked
example. If you're building a custom interaction that should report more than one element
per event the same way, see [`AbstractSelector`](@ref) on the [API Reference](@ref) page for
the extension point.
