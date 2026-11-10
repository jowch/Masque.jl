# `rainclouds!`

A `rainclouds!` plot has three parts, and `masque(fig)` makes each one
respond on its own: the raindrops, one per observation, the violins and
the boxes. Hover each part below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-rainclouds-default" data-masque-embed="plots_rainclouds" data-masque-segment="default" title="A raincloud plot of scores in two regions. Hover a raindrop, a violin or a box, or click one to see what it returns." style="width:100%;height:900px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_rainclouds"; segment = "default")
```

## What a click returns

Each part has its own field in the `@bind` value, named after the kind
of plot it is:

| Part | Its field | One mark is | Fields | Order of the marks |
|---|---|---|---|---|
| raindrops | `sel.scatter` | one observation | `index`, `x`, `y` | the order of your data |
| violins | `sel.violin` | one violin per category | `index`, `x` (the category's place on the axis, `1` for the first) | left to right |
| boxes | `sel.boxplot` | one box per category | `index`, `q1`, `median`, `q3` | left to right |

A raindrop's `index` is its position in your data, so
`scores[sel.scatter.index]` is its value. Its `x` is where it is drawn,
a little to the side of its category, with some random spread. With strings as categories, each category takes its place
where it first appears in your data, so here `"North"` is on the left.

When the figure has a `scatter!` of its own, the raindrops take the
next free id, `sel.scatter_2`. To keep the three parts under one name,
give the plot an `id`, and a click on a violin is then
`sel.rain.violin`:

```julia
@bind sel masque(fig, interactables(rc; id = :rain))
```

## Show your own data

Each part takes its own payloads, so `payloads` names the part each
list is for: one entry per observation for the raindrops, and one per
category for the violins and the boxes. A part you leave out keeps its
default fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-rainclouds-data" data-masque-embed="plots_rainclouds" data-masque-segment="data" title="The same raincloud plot, with each raindrop's student and each violin's region in its tooltip." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_rainclouds"; segment = "data")
```

Hovering a raindrop now shows its student, and hovering a violin shows
its region and number of schools. The boxes still show their quartiles.
A `tooltip` template you pass applies to every part, so leave it out to
keep each part's own default tooltip.

## Select several raindrops

To select a group of observations, pass `select = :many`, then click
raindrops one at a time:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-rainclouds-many" data-masque-embed="plots_rainclouds" data-masque-segment="many" title="The same raincloud plot. Click several raindrops to select them." style="width:100%;height:460px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_rainclouds"; segment = "many")
```

Each part's field is then a vector of events. See
[Select several marks](@ref).

## Supported axes

`rainclouds!` works on a 2D `Axis`.

## Where to go next

The violins and boxes of a raincloud work as [`violin!`](violin.md) and
[`boxplot!`](boxplot.md) do on their own.
