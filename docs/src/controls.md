# Sliders, toggles and menus

Lay out Makie's own `Slider`, `Toggle`, `Checkbox`, `IntervalSlider` or
`Menu` in the figure, name it in `masque`, and the reader can use it in the
notebook. Each one becomes a field of the `@bind` value that holds its
plain value: a number from the slider's range, `true` or `false`, a
`(low, high)` pair, or the option chosen from the menu.

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

With [`onchange`](onchange.md), the figure follows the controls without
running the cell again. Change your plots with Makie's `update!`, then
move the slider or switch the toggle:

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

Buttons and text boxes are pictures for now, and `masque` warns when the
figure has one, since the reader could click it and nothing would happen.
A `SliderGrid` works like the other blocks: its field holds a tuple of its
sliders' values.

With WGLMakie loaded, `Slider` also names a slider from Bonito, so Julia
asks which one you mean; write `Makie.Slider` instead.

In a static HTML export the controls still set the `@bind` value; only
`onchange` needs a running notebook.

Next: [Update the figure](@ref) has more on what `onchange` can change.
