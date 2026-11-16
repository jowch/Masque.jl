# `hspan!` and `vspan!`

`masque(fig)` makes each span respond: hovering a span shows where it
starts and ends, and a click selects it and sends it to your notebook.
A `vspan!` marks a range of `x`, and an `hspan!` a range of `y`. Hover
the two shaded periods below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-hspan-default" data-masque-embed="plots_hspan" data-masque-segment="default" title="A price over 100 days with two shaded periods. Hover a period, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_hspan"; segment = "default")
```

A span covers the whole axis in the other direction, and after you pan
or zoom it still does.

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the spans as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.vspan`, or `sel.hspan` for an
`hspan!`.

| Field | What it holds |
|---|---|
| `index` | the span's place in your data, so `1` is the first range you passed |
| `low`, `high` | where the span starts and ends: on `x` for a `vspan!`, on `y` for an `hspan!` |

## Show your own data

To say what each period was, give each span a payload, one per span in
the order of your data, and a tooltip template that uses its fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-hspan-data" data-masque-embed="plots_hspan" data-masque-segment="data" title="The same price with a tooltip naming each shaded period and its days." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_hspan"; segment = "data")
```

A click also returns the payload's fields, so `pick.event` is the name
of the period you clicked. [Tooltips](@ref) lists what a template can
do.

## Supported axes

`hspan!` and `vspan!` work on a 2D `Axis`, the only axis Makie draws
them on.

## Where to go next

To mark single values instead of ranges, see `hlines!` and `vlines!` in
[What each mark returns](@ref).
