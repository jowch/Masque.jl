# Selection

## Reacting to a click

There is exactly one selection. A `masque(...)` bond reports it directly: `nothing` when
nothing is selected, otherwise an [`InteractionEvent`](@ref) with `layer` (the selected
interactable's `id`), `index` (0-based, within that layer), and `payload`. Clicking an element
replaces the selection with that element, and a cell that reads the bond re-runs on every
click:

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
rows = ev === nothing ? data : filter(r -> r.id == ev.payload.id, data)
```

## `selected=` — the selection's starting value

`selected=` is nothing more than the selection's initial value. Pass it to any `masque(...)`
call to say what's selected the moment the widget mounts, before any click:

```julia
masque(fig, PointInteractable(ax, pts; id = :scatter); selected = Dict(:scatter => [0, 2]))
```

The widget mounts already highlighting those elements, and the bond already holds them — not
`nothing` — as a `Vector{InteractionEvent}`, one entry per hydrated element, each carrying
that element's own `payload` exactly as a click on it would. A cell reading the bond sees the
hydrated selection immediately, with no click required. From there it's an ordinary
selection: the next click, or a `selects`-[`ROIInteractable`](@ref) release, replaces it
wholesale, hydration included.

`selected` is a `layer_id => indices` map. Indices are 0-based and match
`InteractionEvent.index`. Supported kinds: `circles` / `rects` / `polygons` (selected wash)
and `segments` / `polyline` (selected ring). Unsupported kinds (`grid`, `axis`, …) or
out-of-range indices throw `ArgumentError` at build time — fail loud, like a wrong-length
`payloads=`. Keys are layer ids: for the single-layer kinds that's the interactable's `id`,
but [`RegionInteractable`](@ref) splits into suffixed layers (`:id_c` circles / `:id_r` rects
/ `:id_p` polygons) — key on those.

That kind list constrains hydration, not the gesture: clicking a heatmap/image cell selects
that cell even though `:grid` can't be hydrated via `selected=`, and clicking a legend entry
selects every element of the series it links to, not the legend swatch itself (see
[Legend](@ref)).

## Persisting a selection across re-renders

Clicking an element replaces the selection immediately, in the browser — no round trip
through Julia, no bond to feed back into anything. Clicking a different element moves it; the
selection doesn't accumulate, since the echo mirrors the bond value and a click's bond value
is a single [`InteractionEvent`](@ref). Enter/Space on a keyboard-focused element commits
through the same path as a mouse click. A `selects`-[`ROIInteractable`](@ref)'s release
replaces the selection with everything its box enclosed, the same way — see
[Multi-element selectors](@ref) below.

The selection resets when the widget remounts, by design: an index is only meaningful
relative to the data that produced it, and a remount means the figure was rebuilt upstream —
possibly with elements reordered, added, or removed. Restoring the old selection onto
whatever now sits at that index would be silently wrong; dropping it is the honest behavior.

If you want a selection to survive a rebuild, say so explicitly with `selected=` (above) —
give it the indices you believe still apply in the new figure. That's necessarily something
only you, the notebook author, can assert; nothing in the manifest tells Masque whether index
3 in the rebuilt figure is "the same" point as index 3 in the old one.

One thing you have no reason to try: feeding a widget's own bond value back into that same
call's `selected=`,

```julia
# DOESN'T WORK — ev and masque(...; selected=...) are in the same cell, feeding each other
@bind ev masque(fig, PointInteractable(ax, pts; id = :scatter); selected = Dict(:scatter => [ev.index]))
```

is a Pluto reactive cycle: Pluto detects it and reports **"Cyclic references"** instead of
running the cell. A click already updates the selection — and the bond that reports it — on
its own, so this pattern buys you nothing.

A click selects a single element, last pick wins — it's not built for accumulating a
*growing* set across many clicks. For that, see
[`examples/demo.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/demo.jl)'s
"Selection round-trip" cells: a persistent `Ref` accumulates clicked indices across reruns
and feeds the growing set to a second figure's `selected=`. That's a different job from the
selection above — accumulation instead of last-pick-wins — and it remains the right tool for
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

Releasing the drag replaces the selection with every enclosed element, the same click-echo as
an ordinary click — that `Vector` is "the current bond value" in the same sense a single
click's `InteractionEvent` is. It replaces whatever was selected before, `selected=`
hydration included: an ROI release always decides what's highlighted afterward, not a mix of
the old selection and the new one.

See [`gallery/gallery.jl`](@ref Examples)'s "Box-select scatter" recipe for the full worked
example. If you're building a custom interaction that should report more than one element
per event the same way, see [`AbstractSelector`](@ref) on the [API Reference](@ref) page for
the extension point.
