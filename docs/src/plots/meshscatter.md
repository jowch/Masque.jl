# `meshscatter!`

`masque(fig)` makes each sphere of a `meshscatter!` respond like a
marker: hovering one shows its position, and a click selects it and
sends it to your notebook. Hover the spheres below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-meshscatter-default" data-masque-embed="plots_meshscatter" data-masque-segment="default" title="Twelve spheres placed by x and y. Hover a sphere, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_meshscatter"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.meshscatter`.

| Field | What it holds |
|---|---|
| `index` | the sphere's place in your data, so `1` is the first |
| `x`, `y` | where you placed it, and `z` on an `Axis3` |

## Show your own data

Give each sphere a payload, one per sphere in the order of your data,
and a tooltip template that uses its fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-meshscatter-data" data-masque-embed="plots_meshscatter" data-masque-segment="data" title="The same spheres with a tooltip naming each one and its position." style="width:100%;height:520px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_meshscatter"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`meshscatter!` works on a 2D `Axis` and an `Axis3`, where the sphere
nearer the camera answers. On a `PolarAxis`, it is skipped with a
warning.

## Where to go next

For flat markers, see [`scatter!`](scatter.md).
