# `spy!`

`masque(fig)` makes each entry of a `spy!` plot respond: hovering an
entry shows its place in your matrix and its value, and a click selects
it and sends it to your notebook. Only the entries `spy!` draws, the
nonzero ones, respond. Hover the entries below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-spy-default" data-masque-embed="plots_spy" data-masque-segment="default" title="The nonzero links between 20 pages. Hover an entry, or click one to see what it returns." style="width:100%;height:860px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_spy"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.spy`.

| Field | What it holds |
|---|---|
| `index` | which entry, counting the nonzero entries column by column |
| `i`, `j` | the entry's first and second index in your matrix; Makie draws the first along x |
| `value` | the entry's value |

`links[pick.i, pick.j]` reads the same entry from your matrix.

## Show your own data

A tooltip template can use `i`, `j` and `value`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-spy-data" data-masque-embed="plots_spy" data-masque-segment="data" title="The same links with a tooltip naming the two pages and the weight." style="width:100%;height:600px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_spy"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`spy!` works on a 2D `Axis`.

## Where to go next

To read every cell of a matrix, zeros included, draw it with
[`heatmap!`](heatmap.md).
