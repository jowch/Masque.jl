# Sliders, toggles and menus

To give the reader a slider, a switch or a menu next to your plot, add
Makie's own block to the figure and name it in `masque`. The reader
drags, clicks or types in the notebook, and the control's value reaches
your other cells through `@bind`. Move the slider or flip the toggle:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-controls-values" data-masque-embed="controls_values" title="A sine wave with a slider and a toggle. Move either and the last cell shows their values." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("controls_values")
```

The slider and the toggle look like Makie's and sit where the figure's
layout put them. Moving one changes `w` when you let go, so `w.freq` is
the frequency the reader chose and cells that use it respond.

## Supported controls

Every one of Makie's input blocks works. Its name in `masque` becomes a
field of the `@bind` value, which holds:

| Block | The field holds |
|---|---|
| [`Slider`](https://docs.makie.org/stable/reference/blocks/slider) | the value from its `range` |
| [`IntervalSlider`](https://docs.makie.org/stable/reference/blocks/intervalslider) | a `(low, high)` pair from its `range` |
| [`Toggle`](https://docs.makie.org/stable/reference/blocks/toggle) | `true` when it is on |
| [`Checkbox`](https://docs.makie.org/stable/reference/blocks/checkbox) | `true` when it is ticked |
| [`Menu`](https://docs.makie.org/stable/reference/blocks/menu) | the option chosen, or its value for a `label => value` option; the first option until the reader picks, or `nothing` with `default = nothing` |
| [`SliderGrid`](https://docs.makie.org/stable/reference/blocks/slidergrid) | a tuple of its sliders' values, in order |
| [`Button`](https://docs.makie.org/stable/reference/blocks/button) | the number of clicks so far |
| [`Textbox`](https://docs.makie.org/stable/reference/blocks/textbox) | the text last entered with Enter, or `nothing` before any |

Each control takes the colors, sizes and labels you give the block, so
it looks as it does in Makie. A `Menu` opens Makie's list of options,
which the reader can also work with the arrow keys, Enter and Escape, and
typing in the open list filters it. A `Textbox` checks its `validator` and
`restriction` as Makie does: the box turns red while the text fails, and
Enter stores only text that passes. A few exceptions are listed under
[Differences from Makie](@ref).

In a static HTML export the controls still set the `@bind` value; only
`onchange` below needs a running notebook.

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
`on(freq.value)` or `@lift` keeps working. The same goes for a button's
`clicks` and a text box's `stored_string`.

## Name every control

A block needs a name, which becomes its field. Pass it in a NamedTuple, as
above, or in `bind`: `masque(fig; bind = (freq = freq, dots = dots))`. A
block in the figure that `masque` isn't given would look live and do
nothing, so `masque` raises an error naming its kind. Name it, or take it
out of the figure. A `SliderGrid`, `Button` or `Textbox` that isn't named
only gets a warning, because figures with one worked before `masque` could
draw it.

With WGLMakie loaded, `Slider` and `Button` also name controls from
Bonito, so Julia asks which one you mean. Write `Makie.Slider` and
`Makie.Button` instead.

## Differences from Makie

A few things work differently in a notebook, because the browser draws
each control and runs it without Julia.

A `Menu`'s own `filter` can't run in the browser. Typing in an open menu
keeps the options whose label holds the text, ignoring case, as Makie's
default does, and `masque` warns. To narrow the options another way, set
the menu's `options` in `masque`'s own `onchange`.

A `Checkbox`'s own `onchange`, the rule for what a click turns it into,
does nothing: a click always flips the box, and `masque` warns when a
named checkbox has one. For one choice of several, use a `Menu`, or set
the other boxes in `masque`'s own `onchange`.

A `Textbox` `validator` that is a function, a type other than a number
(`Bool` counts as other), or a `Regex` with the `x` flag runs only when
the reader presses Enter, so the box doesn't turn
red as they type. Text it refuses leaves the field as it was. With
`onchange`, the box then goes back to the stored text; without it, the
box still shows what they typed, and `masque` warns. To check as the
reader types, use a plain `Regex` or a number type such as `Int` or
`Float64`.

A `Textbox` as wide as its placeholder, Makie's default, keeps that width
as the reader types and scrolls its text, where Makie widens the box. To
fit longer text, give it a `width`.

A `Button` label written with `rich` loses its formatting, so a subscript
or a colored word shows as plain text. Use a plain string for the label,
or put the formatting in a `Label` beside the button.

A `SliderGrid` writes its value labels with its own `format` for sliders
of up to 101 values, or 20 for an interval slider. Past that, the label
shows the plain value. To keep the format, use a coarser `range`.

## Where to go next

[Label points into classes](@ref) uses a menu, a selection and `onchange`
together in one widget.
