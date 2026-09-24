# Tooltips

Hold the pointer over a mark and a card appears above it with that
mark's data. The card is built in the browser from the mark's payload,
so it appears instantly and never re-runs Julia. You choose one of three
things for each interactable: the default table, a template of your own,
or no card at all.

In this notebook each city's card is a template that prints the name in
bold and the population with thousands separators, and the card's border
takes the marker's colour:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-tt-template" data-masque-embed="tooltips_template" title="Four-city scatter with templated tooltips" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("tooltips_template")
```

## The default card

Leave `tooltip` out and the card is a small table of the payload's
fields. For a scatter whose payloads you did not set, that is the point's
`index`, `x`, and `y`; with your own payloads, it is your fields. The
table is a good first draft and often all you need.

Two interactables are exceptions. A legend entry shows no card by
default, because its label is already drawn next to the swatch; pass a
template if you want one (see [Legend](@ref)). A
[`SliceInteractable`](@ref) shows the series values at the cursor rather
than a mark's payload.

## Write a template

A template is a `masque"..."` string. Each `$(field)` is replaced by that
field of the payload under the pointer:

```julia
PointInteractable(ax, s;
    payloads = cities,
    tooltip = masque"<b>$(city)</b><br>pop $(pop:,)",
)
```

| In the template | Becomes |
|---|---|
| `$(field)` | the payload's `field`, HTML-escaped |
| `$(field:spec)` | the same, formatted with a [d3-format](https://d3js.org/d3-format) `spec` first — `:,` adds thousands separators, `:.2f` two decimals, `:.1%` a percentage |
| `\$` | a literal dollar sign |
| anything else | copied into the card as HTML, so `<b>` and `<br>` work |

`$(field)` names a payload field, not a Julia variable, and it cannot be
an expression. The template has to work in the browser without Julia —
in a static export, for instance — so anything you want to compute goes
into the payload first:

```julia
rows = [(; city = c.city, density = round(c.pop / c.area; digits = 1)) for c in raw]
```

Because the template's own text is inserted as HTML, keep it to markup
you wrote. Payload values are always escaped, so data cannot inject
markup, but a template like `<a href="$(url)">` still trusts whatever URL
the data holds.

`tooltip = false` turns the card off while keeping the hover highlight
and the click.

## Mistakes Masque catches

A template that cannot be parsed — an expression such as `$(pop + 1)`,
an unclosed `$(`, or a format spec d3 does not understand — is a
`TemplateValidationError` as soon as the cell containing `masque"..."`
runs.

A field the payload does not have is caught when `masque` builds the
widget, with a "did you mean" suggestion for a close misspelling. That
check reads the field names of named-tuple payloads. With a `DataFrame`
or `Dict` payloads it is skipped, and a misspelled field simply leaves a
blank in the card — worth a quick hover after you write the template.

## Where the card appears

The card sits above the mark under the pointer, with a small caret
pointing at it, and flips below the mark if it would run off the top of
the figure or shifts sideways at the edges. On a line it follows the
nearest point of the line. Axis readouts, thresholds, boxes, the view,
and a slice have no single mark, so their card follows the pointer
instead. When a mark has keyboard focus, the card anchors to it the same
way.

## Match a dark figure

The card's light or dark theme comes from the figure's own background,
not from the browser or operating-system setting, so a dark figure gets
a dark card even on a light page:

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

Browsers too old for CSS relative colours fall back to the system
light/dark setting.

## Accent color

When Masque knows the colour of the mark under the pointer, the card gets
a 3px border in that colour; the text stays neutral. The colour comes
from `scatter!`'s `color=` when you pass the `Scatter` itself to
[`PointInteractable`](@ref) (as the dark example does), from the
`colors=` keyword (as the city example does), or from a legend entry's
swatch. Without a known colour the border is a plain hairline.

To change the card's background, text colour, font, or corner radius for
a whole widget, pass the `tooltip_*` keywords to `masque`, or set the
`--masque-tip-*` CSS properties on the page; see [Tooltip chrome](@ref).
