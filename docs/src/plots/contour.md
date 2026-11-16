# `contour!`

`masque(fig)` makes a contour plot respond like one line: hovering any
contour shows the point nearest the pointer. Pass the plot as `bind`
and a click picks that point and sends it to your notebook. Hover a
contour below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-contour-default" data-masque-embed="plots_contour" data-masque-segment="default" title="Contours of a hill's height. Click a contour to pick a point on it." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_contour"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig; bind = (hill = c,))`, it is `sel.hill`.

| Field | What it holds |
|---|---|
| `index` | the point's place along all the contours together |
| `line` | always `1`: every contour is one mark |
| `x`, `y` | the point on the contour |

The click doesn't say which level the contour is.

## Read the level from the labels

Draw the contours with `labels = true`, and each label responds on its
own: hovering one shows its text, the level, and a click on it returns
its `text`, `index`, `x` and `y`. The lines and the labels are then two parts; see [Plots with
several parts](@ref):

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-contour-labels" data-masque-embed="plots_contour" data-masque-segment="labels" title="The same contours with their levels labelled. Hover a label to see its level." style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_contour"; segment = "labels")
```

## Supported axes

`contour!` works on a 2D `Axis`, and `contour3d!` on an `Axis3`.

## Where to go next

For filled levels, where each level is its own mark, see `contourf!` in
[What each mark returns](@ref).
