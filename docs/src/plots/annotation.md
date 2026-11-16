# `annotation!`

`masque(fig)` makes each annotation respond on its text: hovering the
text shows it and the point it points at, and a click selects it and
sends it to your notebook. Hover the two notes below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-annotation-default" data-masque-embed="plots_annotation" data-masque-segment="default" title="Visitors by year, with notes for the recession and the pandemic. Hover a note, or click one to see what it returns." style="width:100%;height:860px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_annotation"; segment = "default")
```

The line under the notes responds too, as a `lines!`.

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the annotations as `bind`, so `pick` is that event
itself; with `@bind sel masque(fig)`, it is `sel.annotation`.

| Field | What it holds |
|---|---|
| `index` | the annotation's place in your data, so `1` is the first |
| `text` | its text |
| `x`, `y` | the point it points at |

## Show your own data

Give each annotation a payload, one per annotation in the order of your
data, and a tooltip template that uses its fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-annotation-data" data-masque-embed="plots_annotation" data-masque-segment="data" title="The same notes with a tooltip saying how far visitors fell." style="width:100%;height:520px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_annotation"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`annotation!` works on a 2D `Axis`. On an `Axis3` or a `PolarAxis`, it
is skipped with a warning.

## Where to go next

For labels without arrows, see [`text!`](text.md).
