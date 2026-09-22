# Selection

## Reacting to a click

There is exactly one selection. A `masque(...)` bond reports it directly: `nothing` when
nothing is selected, otherwise one event whose type matches the interactable. A point,
bar, polygon, or segment click is an [`ElementEvent`](@ref): `layer` is the interactable's
`id`, `index` is 1-based, and the row's fields are read on the event (`ev.city`). Clicking
an element replaces the selection with that element, and a cell that reads the bond re-runs
on every click:

```julia
@bind ev masque(fig, PointInteractable(ax, pts; id = :scatter))
```

```julia
ev === nothing ? "nothing selected" : "clicked #$(ev.index) in :$(ev.layer)"
```

## Linked selection across plots

`layer` and `index` are plain data, and an [`ElementEvent`](@ref) is a row index, so one
click can drive any number of downstream cells — filter a table, highlight a second plot,
recompute a fit:

```julia
row = ev === nothing ? nothing : data[ev, :]
```

## `selected=` — the selection's starting value

`selected=` is nothing more than the selection's initial value. Pass it to any `masque(...)`
call to say what's selected the moment the widget mounts, before any click:

```julia
masque(fig, PointInteractable(ax, pts; id = :scatter); selected = 2)
```

On a point layer, `selected = 2` and `selected = [2]` mount as the same one
[`ElementEvent`](@ref) a click on that point would produce. `selected = [1, 3]` highlights
both marks and leaves the bond `nothing`: this interaction returns one element, so a set is
not a value it can hold. The next click replaces the highlight with that one element.

A `selects` ROI is the interaction that returns a vector. There, `selected = 1` and
`selected = [1]` both mount as a one-element `Vector{ElementEvent}`, and `selected = [1, 3]`
mounts as those two. An explicit empty vector (`selected = Int[]`) mounts as `ElementEvent[]`.
Omitting `selected=` leaves the bond `nothing`.

Indices are 1-based. `0` is out of range. With one seedable layer a bare `Int` or
`AbstractVector{<:Integer}` is enough. Two seedable layers need a name:
`selected = Dict(:scatter => [1, 3])` or `selected = (; scatter = 1)`. A bare `1` across two
layers throws, naming the layers. Unknown keys throw. Supported kinds: `circles` / `rects` /
`polygons` (selected wash) and `segments` / `polyline` (selected ring). Unsupported kinds
(`grid`, `axis`, …) or out-of-range indices throw `ArgumentError` at build time — fail loud,
like a wrong-length `payloads=`. Keys are layer ids: for the single-layer kinds that's the
interactable's `id`, but [`RegionInteractable`](@ref) splits into suffixed layers (`:id_c`
circles / `:id_r` rects / `:id_p` polygons) — key on those.

That kind list constrains hydration, not the gesture: clicking a heatmap/image cell selects
that cell even though `:grid` can't be hydrated via `selected=`, and clicking a legend entry
selects every element of the series it links to, not the legend swatch itself (see
[Legend](@ref)).

## Persisting a selection across re-renders

Clicking an element replaces the selection immediately, in the browser — no round trip
through Julia, no bond to feed back into anything. Clicking a different element moves it; the
selection doesn't accumulate, since the echo mirrors the bond value and a click's bond value
is a single [`ElementEvent`](@ref). Enter/Space on a keyboard-focused element commits
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
[`RectInteractable`](@ref) — pointing it at any other kind fails loud. Over points the bond
is a `Vector{ElementEvent}` — one entry per enclosed point, including a click on one of
those points. Over a grid the bond is one [`GridWindowEvent`](@ref), and `A[win]` is
`A[win.i1:win.i2, win.j1:win.j2]`. A box that misses the grid has an empty `i1:i2`.

```julia
begin
    scatter!(ax, first.(pts), last.(pts))
    roi = ROIInteractable(ax; bounds = (0.0, 10.0, 0.0, 10.0), selects = :scatter)
end
```

```julia
@bind picked masque(fig, [PointInteractable(ax, pts; id = :scatter), roi])
# picked isa Vector{ElementEvent} once you release a drag, or click one point
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
