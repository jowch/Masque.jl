# `stairs!`

`masque(fig)` makes a staircase respond like a line: hovering it shows
the step you plotted nearest the pointer. Pass the plot as `bind` and a
click picks that step and sends it to your notebook. Hover the
staircase below, then click a step:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-stairs-default" data-masque-embed="plots_stairs" data-masque-segment="default" title="Staff on shift over ten days, drawn as steps. Click a step to pick it." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_stairs"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the staircase as `bind`, so `pick` is that event itself;
with `@bind sel masque(fig; bind = (staff = st,))`, it is `sel.staff`.

| Field | What it holds |
|---|---|
| `index` | the step's place in your data, so `day[pick.index]` reads it |
| `line` | always `1` |
| `x`, `y` | the point you plotted for that step |

## Show your own data

A staircase is one mark, so it takes one payload: a list with one
entry. The tooltip template can use the hovered step's `x` and `y` next
to your fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-stairs-data" data-masque-embed="plots_stairs" data-masque-segment="data" title="The same steps with a tooltip naming the team and the day." style="width:100%;height:520px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_stairs"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`stairs!` works on a 2D `Axis`. On an `Axis3` or a `PolarAxis`, it is
skipped with a warning.

## Where to go next

An `ecdfplot!` is drawn as a staircase; see [`ecdfplot!`](ecdfplot.md).
