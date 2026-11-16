# `text!`

`masque(fig)` makes each label of a `text!` respond over the box its
text takes up: hovering a label shows its text and position, and a
click selects it and sends it to your notebook. Hover the city names
below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-text-default" data-masque-embed="plots_text" data-masque-segment="default" title="Six cities labelled on a map grid. Hover a name, or click one to see what it returns." style="width:100%;height:860px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_text"; segment = "default")
```

The grey markers under the names respond too, as a `scatter!`.

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the labels as `bind`, so `pick` is that event itself;
with `@bind sel masque(fig)`, it is `sel.text`.

| Field | What it holds |
|---|---|
| `index` | the label's place in your data, so `cities[pick.index]` reads it |
| `text` | the label's text |
| `x`, `y` | where you placed it, and `z` on an `Axis3` |

## Show your own data

Give each label a payload, one per label in the order of your data, and
a tooltip template that uses its fields. The template can use the
label's own `text`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-text-data" data-masque-embed="plots_text" data-masque-segment="data" title="The same names with a tooltip giving each city's population." style="width:100%;height:520px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_text"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`text!` works on a 2D `Axis` and an `Axis3`. On a `PolarAxis`, it is
skipped with a warning. Text placed in pixels or relative to the axis,
rather than in data, is skipped with a warning too.

## Where to go next

For a label with an arrow to the point it is about, see
[`annotation!`](annotation.md).
