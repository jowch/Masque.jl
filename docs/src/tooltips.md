# Tooltips

Hover over a mark and a tooltip appears above it with the mark's data.
For each interactable, you choose the default table, your own template,
or no tooltip.

In this notebook, each city's tooltip uses a template: the name in bold,
the population with thousands separators, and a border in the marker's
color.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-tt-template" data-masque-embed="tooltips_template" title="Four-city scatter. Hover a city to see its tooltip." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("tooltips_template")
```

## The default tooltip

Without `tooltip`, the tooltip is a small table of the payload's
fields: your own fields when you pass `payloads`, and for a scatter
without them, the point's `index`, `x`, and `y`. On a categorical or
date axis, `x` and `y` are the category's label and the date as text,
such as `"b"` or `"2024-01-02"`, in the tooltip and in the event.

Numbers show up to four significant figures, so `0.30000000000000004`
reads `0.3` and `2.71828` reads `2.718`. Whole numbers show in full. To
show more or fewer figures, pass `tooltip_sigdigits` to `masque`:

```julia
@bind pick masque(fig; tooltip_sigdigits = 6)
```

The value in `pick` keeps every digit; only the tooltip is rounded.

Two interactables work differently. A legend entry shows no tooltip by
default, because its label is already next to the swatch. To add one,
pass a template, as [Legend](@ref) shows. A [`SliceInteractable`](@ref)
shows the series values at the pointer instead of a payload.

## Write a template

A template is a `masque"..."` string. Each `$(field)` is replaced by that
field's value for the mark under the pointer:

```julia
interactables(s;
    payloads = cities,
    tooltip = masque"<b>$(city)</b><br>pop $(pop:,)",
)
```

| In the template | Becomes |
|---|---|
| `$(field)` | the payload's `field`, a number rounded as in the default tooltip |
| `$(field:spec)` | the same, formatted with a [d3-format](https://d3js.org/d3-format) `spec`: `:,` adds thousands separators, `:.2f` gives two decimals, `:.1%` a percentage |
| `\$` | a literal dollar sign |
| anything else | copied into the tooltip as HTML, so `<b>` and `<br>` work |

A `$(field)` can only name a payload field, not an expression such as
`$(pop / area)`, so to show a computed value, put it in the payload:

```julia
cities = [
    (city = "Lyon", density = round(522_250 / 47.9)),
    (city = "Nice", density = round(342_669 / 71.9)),
]
```

To turn tooltips off, pass `tooltip = false`. The hover highlight and
clicks keep working.

## Template errors

A template Masque cannot read, such as one with an expression like
`$(pop + 1)`, an unclosed `$(`, or a format spec d3 does not know, raises
a `TemplateValidationError` when its cell runs.

A template that names a field the payload does not have raises an
`ArgumentError` when `masque` runs, and the message lists the payload's
fields and suggests the closest match. This check needs named-tuple
payloads: with a `DataFrame` or `Dict`, a misspelled field shows up as a
blank in the tooltip, so hover once after you write the template.

## HTML in payload values

Avoid putting HTML in your payload values, because the tooltip shows
the tags as plain text instead of rendering them. To make something
bold, use the template instead:

```julia
# The tooltip shows "<b>Lyon</b>", tags and all
cities = [(city = "<b>Lyon</b>", pop = 522_250)]

# The tooltip shows "Lyon" in bold
cities = [(city = "Lyon", pop = 522_250)]
tooltip = masque"<b>$(city)</b>"
```

Also avoid links built from your data, such as `<a href="$(url)">`,
unless you trust every URL in it: the link goes wherever the data says.

## Where the tooltip appears

The tooltip sits above the hovered mark, and moves below it or inward
near the figure's edges. Axis readouts, boxes, and other interactions
without a single mark show their tooltip at the pointer.

## Dark figures

A dark figure gets a dark tooltip, even on a light page, because the
tooltip follows the figure's background rather than the browser or
system setting:

```julia
fig = Figure(size = (560, 360); backgroundcolor = :gray12)
```

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-tt-dark" data-masque-embed="tooltips_dark" title="Scatter on a dark figure. Hover a point to see a dark tooltip." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("tooltips_dark")
```

## Accent color

When Masque knows a mark's color, its tooltip gets a 3px border in that
color. The color comes from:

- `scatter!`'s `color=`, for the layer `masque` builds for a scatter,
  as in both examples on this page, or when you pass the `Scatter`
  itself to [`PointInteractable`](@ref)
- the `colors=` keyword, when you pass positions instead of the plot
- a legend entry's swatch

Without a known color, the border is a plain 1px line.

To change the tooltip's background, text color, font, or corner radius
for a whole widget, pass the `tooltip_*` keywords to `masque`, or set the
`--masque-tip-*` CSS properties on the page. See [Tooltip styling](@ref).
