# `band!`

`masque(fig)` makes each `band!` respond as one mark: hovering anywhere
in the band shows it, and a click selects it and sends it to your
notebook. Hover the two bands below, then click the blue one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-band-default" data-masque-embed="plots_band" data-masque-segment="default" title="Two forecast bands. Hover a band, or click the blue one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_band"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with one field. Here the figure
passes the blue band as `bind`, so `pick` is that event itself, and a
click on the orange band leaves it alone. With `@bind sel masque(fig)`,
the bands are `sel.band` and `sel.band_2`.

| Field | What it holds |
|---|---|
| `index` | always `1`, since the whole band is one mark |

## Show your own data

A band takes one payload: a list with one entry. Give each band its own
[`interactables`](@ref) to name it:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-band-data" data-masque-embed="plots_band" data-masque-segment="data" title="The same bands with tooltips naming each model and its spread." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_band"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`band!` works on a 2D `Axis`.

## Where to go next

For a band you drag to pick a range, see [Drag a band](@ref). For a
shaded span across the whole axis, see [`hspan!` and `vspan!`](hspan.md).
