# Tooltips

Hover over a mark and a tooltip appears above it with the mark's data.
For each interactable, you choose the default table, your own template,
or no tooltip.

In this notebook, each city's tooltip uses a template: the name in bold,
the population with thousands separators, and a border in the marker's
color.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-tt-template" data-masque-embed="tooltips_template" title="Four-city scatter with templated tooltips" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("tooltips_template")
```

## The default tooltip

Without `tooltip`, the tooltip is a small table of the payload's fields.
For a scatter without `payloads`, that is the point's `index`, `x`, and
`y`. With your own payloads, it is your fields.

Two interactables work differently. A legend entry shows no tooltip by
default, because its label is already next to the swatch; pass a
template to add one (see [Legend](@ref)). A [`SliceInteractable`](@ref)
shows the series values at the pointer instead of a payload.

## Write a template

A template is a `masque"..."` string. Each `$(field)` is replaced by that
field's value for the mark under the pointer:

```julia
PointInteractable(ax, s;
    payloads = cities,
    tooltip = masque"<b>$(city)</b><br>pop $(pop:,)",
)
```

| In the template | Becomes |
|---|---|
| `$(field)` | the payload's `field` |
| `$(field:spec)` | the same, formatted with a [d3-format](https://d3js.org/d3-format) `spec`: `:,` adds thousands separators, `:.2f` gives two decimals, `:.1%` a percentage |
| `\$` | a literal dollar sign |
| anything else | copied into the tooltip as HTML, so `<b>` and `<br>` work |

A `$(field)` names a payload field. It cannot be an expression such as
`$(pop / area)`. To show a computed value, put it in the payload:

```julia
cities = [
    (city = "Lyon", density = round(522_250 / 47.9)),
    (city = "Nice", density = round(342_669 / 71.9)),
]
```

Tooltips work even when Julia is not running, for example in a static
HTML export, so a template can only read the payload.

Avoid putting HTML in your payload values. It will not be rendered; the
tooltip shows the tags as plain text. To make something bold, use the
template instead:

```julia
# The tooltip shows "<b>Lyon</b>", tags and all
cities = [(city = "<b>Lyon</b>", pop = 522_250)]

# The tooltip shows "Lyon" in bold
cities = [(city = "Lyon", pop = 522_250)]
tooltip = masque"<b>$(city)</b>"
```

Also avoid links built from your data, such as `<a href="$(url)">`,
unless you trust every URL in it: the link goes wherever the data says.

`tooltip = false` turns tooltips off. The hover highlight and clicks
still work.

## Template errors

A template Masque cannot read, such as one with an expression like
`$(pop + 1)`, an unclosed `$(`, or a format spec d3 does not know, raises
a `TemplateValidationError` when its cell runs.

A template that names a field the payload does not have raises an
`ArgumentError` when `masque` runs. The message lists the payload's
fields and suggests the closest match. This check needs named-tuple
payloads. With a `DataFrame` or `Dict`, a misspelled field shows up as a
blank in the tooltip, so hover once after you write the template.

## Where the tooltip appears

The tooltip sits above the mark under the pointer, with a small caret
pointing at it. Near the top of the figure it flips below the mark, and
near the sides it shifts inward. On a line, it follows the nearest point
of the line. Axis readouts, thresholds, boxes, pan and orbit, and slices
have no single mark, so their tooltip follows the pointer. A mark with
keyboard focus gets its tooltip the same way as a hovered one.

## Dark figures

A dark figure gets a dark tooltip, even on a light page. The tooltip's
theme follows the figure's background, not the browser or system
setting:

```julia
fig = Figure(size = (560, 360); backgroundcolor = :gray12)
```

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-tt-dark" data-masque-embed="tooltips_dark" title="Dark-figure scatter with figure-derived tooltip theme" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("tooltips_dark")
```

Older browsers use the system light or dark setting instead.

## Accent color

When Masque knows a mark's color, its tooltip gets a 3px border in that
color. The color comes from:

- `scatter!`'s `color=`, when you pass the `Scatter` itself to
  [`PointInteractable`](@ref), as the dark example does
- the `colors=` keyword, as the city example does
- a legend entry's swatch

Without a known color, the border is a plain 1px line.

To change the tooltip's background, text color, font, or corner radius
for a whole widget, pass the `tooltip_*` keywords to `masque`, or set the
`--masque-tip-*` CSS properties on the page. See [Tooltip styling](@ref).
