# Sliders, toggles and menus

Lay out Makie's own `Slider`, `Toggle`, `Checkbox`, `IntervalSlider`,
`Menu` or `SliderGrid` in the figure, name it in `masque`, and the reader can use it in the
notebook. Each one becomes a field of the `@bind` value that holds its
plain value: a number from the slider's range, `true` or `false`, a
`(low, high)` pair, the option chosen from the menu, or a tuple of a grid's
slider values.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-controls-values" data-masque-embed="controls_values" title="A sine wave with a slider and a toggle. Move either and the last cell shows their values." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("controls_values")
```

The slider and the toggle look like Makie's and sit where the figure's
layout put them. Moving one changes `w` when you let go, so cells that use
`w` respond.

## Redraw the figure from a control

An `onchange` function, from [Update the figure](@ref), can read the
controls too, so the figure follows them without the cell running again.
Move the slider or switch the toggle:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-controls-wave" data-masque-embed="controls_wave" data-masque-segment="widget" title="A sine curve with a frequency slider and a dotted-line toggle. Moving either redraws the curve." style="width:100%;height:620px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("controls_wave"; segment = "widget")
```

While the reader drags the slider, the curve follows it. To redraw only
when they let go, build the slider with `update_while_dragging = false`.
Cells that use `w` see the setting once the reader lets go:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-controls-wave-value" data-masque-embed="controls_wave" data-masque-segment="value" title="A cell showing the slider's and the toggle's values." style="width:100%;height:120px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("controls_wave"; segment = "value")
```

Masque also sets the block's own value before it calls your function, so
`freq.value[]` agrees with `state.freq`, and code written for GLMakie with
`on(freq.value)` or `@lift` keeps working.

## Name every control

A block needs a name, which becomes its field. Pass it in a NamedTuple, as
above, or in `bind`: `masque(fig; bind = (freq = freq, dots = dots))`. A
block in the figure that `masque` isn't given would look live and do
nothing, so `masque` raises an error naming its kind. Name it, or take it
out of the figure.

A `SliderGrid`, `Button` or `Textbox` that `masque` isn't given only
warns, because figures with one worked before `masque` could draw it. A
grid's value labels use its own `format` for sliders of up to 101 values
(20 for an interval slider); past that, the browser writes the plain
value. A `Button`'s field counts its clicks. With `onchange`, Masque sets
the button's `clicks` before calling your function, so code listening to
it with `on(b.clicks)` runs too. A `Textbox`'s field holds the text the
reader last entered with Enter, or `nothing` before any. A `validator`
that is a `Regex` or a number type turns the box red as the reader types,
as in Makie; one that is a function runs when they press Enter, and text
it refuses leaves the field as it was. With `onchange`, the box then goes
back to the stored text; without it, the box still shows what they typed,
and `masque` warns. A box as wide as its placeholder, Makie's default,
keeps that width as the reader types and scrolls its text, where Makie
widens it.

A `Menu` opens Makie's list of options, under it or over it as in Makie,
and the reader can also work it with the arrow keys, Enter and Escape.
Makie's menus are searchable: typing in an open menu keeps the options
whose label holds the text, ignoring case. A menu's own `filter` can't
run in the browser, which uses that rule instead, and `masque` warns; to
narrow the options another way, set the menu's `options` in `masque`'s
`onchange`.

A `Checkbox`'s own `onchange`, the rule for what a click turns it into,
does nothing in a notebook: a click always flips the box, and `masque`
warns when a named checkbox has one. For one choice of several, use a
`Menu`, or set the other boxes in `masque`'s own `onchange`.

With WGLMakie loaded, `Slider` and `Button` also name controls from
Bonito, so Julia asks which one you mean; write `Makie.Slider` and
`Makie.Button` instead.

In a static HTML export the controls still set the `@bind` value; only
`onchange` needs a running notebook.

## Where to go next

[Label points into classes](@ref) uses a menu, a selection and `onchange`
together in one widget.
