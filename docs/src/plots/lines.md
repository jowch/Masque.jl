# `lines!`

`masque(fig)` makes each line respond: hovering a line shows the point
you plotted nearest the pointer. A click changes nothing until you name
the line in `bind`; then a click picks that same point, a ring marks it,
and it goes to your notebook. Here both lines are named, so each gets
its own field. Hover a line below, then click it:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-lines-default" data-masque-embed="plots_lines" data-masque-segment="default" title="Temperatures in Berlin and Oslo over a day. Click a line to pick its nearest hour." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_lines"; segment = "default")
```

## What a click returns

With `bind = (berlin = l1, oslo = l2)`, `sel.berlin` and `sel.oslo`
each hold `nothing` or the point clicked on that line, as an
[`ElementEvent`](@ref) with these fields:

| Field | What it holds |
|---|---|
| `index` | the point's place in your data, so `hour[sel.berlin.index]` reads it |
| `line` | which line of the plot, always `1` for a `lines!` |
| `x`, `y` | the point you plotted, and `z` on an `Axis3` |

To keep a click on several points, pass `select = :many` to the line's
[`interactables`](@ref); each click then adds a point. To make a line
clickable while keeping every other plot's field in the `@bind` value,
pass `interactables(l1)` after the figure instead of naming it in
`bind`.

## Show your own data

A line is one mark, so it takes one payload: a list with one entry.
The tooltip template can use the hovered point's `x` and `y` next to
your fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-lines-data" data-masque-embed="plots_lines" data-masque-segment="data" title="The same lines with a tooltip naming the city and the hour." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_lines"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Read every line at the same x

To compare the lines at one hour, add a [`SliceInteractable`](@ref)
over them. Its tooltip lists every line's value where the pointer is,
using the lines' `label`s:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-lines-slice" data-masque-embed="plots_lines" data-masque-segment="slice" title="The same lines, where hovering shows both temperatures at the hour under the pointer." style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_lines"; segment = "slice")
```

[Slice across series](@ref) shows how to use the slice's click.

## Supported axes

`lines!` works on a 2D `Axis`, an `Axis3` and a `PolarAxis`.

## Where to go next

To draw many lines with one call, see [`series!`](series.md). To show
the points as markers too, see [`scatterlines!`](scatterlines.md).
