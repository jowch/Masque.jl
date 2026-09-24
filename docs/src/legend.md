# Legend

Hold your pointer over a legend entry to highlight the traces it labels.
Click the entry to select that series; `@bind` captures the pick. The
overlay cannot hide Makie traces — use the wash plus `@bind` so a Julia
cell can fade the rest.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-legend-lines" data-masque-embed="legend_lines" title="two-line axislegend with listed @bind snapshots" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("legend_lines")
```

The notebook draws two labeled lines and an `axislegend`. A click names
the series. `pick.label` is that name. `pick.targets` names the lines
the entry highlights (`"lines"`, `"lines_2"`, or `"series:2"` to pin one
element). `pick.group` is the group title, or `nothing` when the legend
is not grouped.

## Persist a series wash

`selected = Dict(:legend => [1])` paints the **swatch** — the legend
layer is `:rects`. To keep a series washed across a remount, hydrate the
**target** layer ids instead. For more information, see
[Selection](@ref).

## Targets and empty links

Pass `targets=` when auto-link is not enough:

```julia
LegendInteractable(leg; targets = Dict("a" => :lines, "b" => [:lines_2, :scatter]))
```

`targets` also accepts a `Vector` — one value per legend entry, in
order (top to bottom, matching a grouped legend's flattened
`entrygroups`) — `Symbol` / `Vector{Symbol}` / `nothing`. A `Dict` key
that matches no label, a wrong-length `Vector`, or a target that names
an unknown layer or an unhighlightable kind raises `ArgumentError` at
build time.

An explicit `targets=` is fail-loud. The auto path drops unhighlightable
kinds (`:grid`) with `@warn` and keeps the rest.

A spec is a layer id — every element of that layer — or `id:k` pinning
element `k` (1-based). Auto-extracted `series!` entries use the pin, so
each swatch lights one series rather than every trace packed into the
parent `:lines` layer. A bare `targets = :series` still highlights the
whole layer.

A legend with no links is still hittable. A click still fires. The
visual echo **clears**, and no tooltip card appears unless you pass a
template.

`LegendInteractable(leg)` on a custom `LineElement` legend with no
`plots=` and no `targets=` has empty links. Pass `plots=` on the
element (Makie's own keyword) or pass `targets=` on
[`LegendInteractable`](@ref).

`scatterlines!` and `stem!` auto-link both of their layers. With
`merge = true`, one legend entry names several ids. A second legend in
the figure is `:legend_2`. The manifest sorts legend layers first so
they win pixels under them.

## Tooltip

Holding the pointer over a legend entry does not show a tooltip. The
label is already drawn in the row, and a card there covers the entries
around it. Pass a `masque"..."` template when you want a card (fields:
`label`, `group`, `targets`). Omitting `tooltip` and `tooltip = false`
both leave the card off. Moving keyboard focus to an entry still
announces that entry's label. For more information, see
[Keyboard and screen readers](@ref).

```julia
LegendInteractable(leg; tooltip = masque"$(label) — $(group)")
```

A whole-layer wash can span axes. That two-panel picture lives on
[Linked views](@ref). This page is two `lines!` plus `axislegend` on one
axis.
