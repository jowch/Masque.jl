# Tooltips

Hover over a mark and a tooltip appears above it with the mark's data.
For each interactable, you choose the default table, your own template,
or no tooltip. The chart below plots twelve bright stars by temperature
and luminosity, and each star's tooltip gives its name in bold, its
type, and its distance:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-tt-stars" data-masque-embed="tooltips_stars" data-masque-segment="widget" title="Twelve stars by temperature and luminosity. Hover a star to see its tooltip." style="width:100%;height:760px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("tooltips_stars"; segment = "widget")
```

## The default tooltip

Start with the data each tooltip should show. Here each star gets a
payload with its name, type and distance, and `hr_diagram` draws the
chart:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-tt-stars-data" data-masque-embed="tooltips_stars" data-masque-segment="data" title="The star catalogue and the function that draws the chart." style="width:100%;height:790px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("tooltips_stars"; segment = "data")
```

Pass the payloads without `tooltip`, and the tooltip is a small table
of their fields, followed by the star's `x` and `y`
([How Masque works](@ref) says how the two combine):

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-tt-default" data-masque-embed="tooltips_stars_default" title="The star chart with the default tooltip. Hover a star to see its fields." style="width:100%;height:570px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("tooltips_stars_default")
```

Without `payloads`, a scatter's tooltip shows the point's `index`, `x`,
and `y`. On a categorical or
date axis, `x` and `y` in the tooltip and in the clicked mark's event
are text: the
category's label, such as `"b"`, or the date or time you plotted, such
as `"2024-01-02"`, `"2024-01-01T01:00:00"`, or `"01:00:00"`.

Hovering a line from `lines!`, `stairs!`, `series!`, or `scatterlines!`
adds `x` and `y` of the point you plotted nearest the pointer along the
line. In a template you can also use `i`, that point's position in the
line's data, so `$(i)` is `3` over `xs[3], ys[3]`. A click on a line
picks that point once you name the line in `bind`; see
[What each mark returns](@ref). A line on an `Axis3` shows only its payload.

Numbers show up to four significant figures, so `0.30000000000000004`
reads `0.3` and `2.71828` reads `2.718`. Whole numbers show in full. To
show more or fewer figures, pass `tooltip_sigdigits` to `masque`:

```julia
@bind sel masque(fig; tooltip_sigdigits = 6)
```

The `@bind` value keeps every digit; only the tooltip is rounded.

Two interactables work differently. A legend entry shows no tooltip by
default, because its label is already next to the swatch. To add one,
pass a template, as [Legend](@ref) shows. A [`SliceInteractable`](@ref)
shows the series values at the pointer instead of a payload.

## Write a template

A template is a `masque"..."` string, passed as `tooltip`, like the one
in the figure cell at the top of this page. Each `$(field)` is replaced
by that field's value for the star under the pointer, and the rest is
shown as written:

| In the template | Becomes |
|---|---|
| `$(field)` | the payload's `field`, a number rounded as in the default tooltip |
| `$(field:spec)` | the same, formatted with a [d3-format](https://d3js.org/d3-format) `spec`: `:,` adds thousands separators, `:.2f` gives two decimals, `:.1%` a percentage |
| `\$` | a literal dollar sign |
| anything else | copied into the tooltip as HTML, so `<b>` and `<br>` work |

A `$(field)` can only name a payload field, not an expression such as
`$(dist / 3.26)`, so to show a computed value, put it in the payload:

```julia
info = [
    (name = "Sirius", parsecs = round(8.6 / 3.26; digits = 1)),
    (name = "Vega", parsecs = round(25.0 / 3.26; digits = 1)),
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
payloads: with a `DataFrame` or `Dict`, a misspelled field can show up as
a blank in the tooltip, so hover once after you write the template.

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
tooltip follows the figure's `backgroundcolor` rather than the browser
or system setting. This is the same chart drawn with Makie's
`theme_dark()`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-tt-dark" data-masque-embed="tooltips_stars_dark" title="The star chart on a dark figure. Hover a star to see a dark tooltip." style="width:100%;height:630px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("tooltips_stars_dark")
```

## Border color

When Masque knows a mark's color, its tooltip gets a 3px border in that
color. The color comes from:

- `scatter!`'s `color=`, for the layer `masque` builds for a scatter,
  as in every example on this page, or when you pass the `Scatter`
  itself to [`PointInteractable`](@ref)
- the `colors=` keyword, when you pass positions instead of the plot
- a legend entry's swatch

Without a known color, the border is a plain 1px line.

To change the tooltip's background, text color, font, or corner radius
for a whole widget, pass `tooltipstyle` to `masque`, or set the
`--masque-tip-*` CSS properties on the page. See [Tooltip styling](@ref).
To change the color and width of highlights and the selection, pass
`overlaystyle`; see [Overlay styling](@ref).
