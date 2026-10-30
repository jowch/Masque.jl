# Slice across series

A slice reads several lines at once. As you move the pointer, a
vertical line follows it, a dot sits where it crosses each line you
gave the slice, and the tooltip lists each of those lines' values at
that `x`. Use it to compare
several series at the same position, such as spectra at one wavelength
or traces at one time.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-slice-player" data-masque-embed="slice_spectra" data-masque-segment="widget" title="Three absorbance spectra. Hover to read each spectrum at the wavelength under the pointer." style="width:100%;height:950px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("slice_spectra"; segment = "widget")
```

## Add a slice

`masque(fig)` never adds a slice on its own, so pass your line plots to
a [`SliceInteractable`](@ref) yourself, as the `@bind` cell above does
with the three spectra.

Each line's `label` names its row in the tooltip when the label starts
with a letter and holds only letters, digits, and underscores, such as
`sine` or `run_2`. Any other label, such as `450nm` or `sample A`, or no
label at all, shows up as `s1`, `s2`, and so on, in the order you passed
the lines. Two lines with the same label show up as `sine` and `sine_2`.
The label can't be `x` on a vertical slice, or `y` on a horizontal one,
because that row already shows the position; `SliceInteractable` raises
an error if it is.

The slice goes on the axis that draws the lines, so pass lines from one
axis only.

A slice is for reading values, so hovering does not change the `@bind`
value. Each axis takes one slice, so to read several lines, pass them
all to the same slice.

## Slice, threshold, or box

A slice, a threshold, and a brush all draw something across the plot,
but they do different jobs. The slice follows the pointer and sends
nothing to your notebook. The others stay where you leave them, and
your notebook gets their value:

| To get | Use | You | Your notebook gets |
|---|---|---|---|
| The value of each line you pass it, at the pointer | [`SliceInteractable`](@ref) | hover | nothing |
| Which line you clicked | `masque(fig)`, with the line in `bind` | click a line | that line ([What each mark returns](@ref)) |
| The coordinates you clicked | [`AxisInteractable`](@ref) | click | `x` and `y` ([Read coordinates](@ref)) |
| A cutoff | [`ThresholdInteractable`](@ref) | drag a line | its position ([Read coordinates](@ref)) |
| A range of `x` and `y`, or the points in it | [`ROIInteractable`](@ref) | drag a box | the box or the points inside ([Brush a region](@ref)) |

So use a slice to look across your series, and a brush to pick out a
part of your data and work with it.

## Save a position with a click

To keep the `x` you are reading, add an [`AxisInteractable`](@ref) to
the same widget, as `readout` in the example above. Hovering still
shows the slice's tooltip, and a click saves the position.
`bind = readout` makes `at` the readout's value, and `auto = false`
leaves out what `masque(fig)` would add for the lines and their legend,
so only the slice and the readout respond to the pointer.

`at` is `nothing` until the first click. After that, `at.x` is the
wavelength you clicked, and a later cell can read your data there:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-slice-value" data-masque-embed="slice_spectra" data-masque-segment="value" title="A cell that reads each spectrum at the clicked wavelength." style="width:100%;height:240px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("slice_spectra"; segment = "value")
```

This site doesn't record clicks on a position
([Examples on this site](@ref this-site)), so here the cell stays as it
starts.

## Choose what the slice reads

By default, a vertical line follows the pointer, and the tooltip shows
each series' `y` at the pointer's `x`. These keywords change that:

| To | Pass |
|---|---|
| read `x` at the pointer's `y` | `orientation = :horizontal` |
| keep the dots and the tooltip but draw no line | `crosshair = false` |
| change what the tooltip shows | a `masque"..."` template over the same fields as `tooltip`; see [Tooltips](@ref) |
| turn the tooltip off | `tooltip = false` |

You can pass a `Lines`, `Stairs`, `Series`, `Band`, or `Density` plot,
or a vector of them. The slice reads each curve as drawn, so `Stairs`
keeps its steps, and `Band` and `Density` give their upper curve. A
`Band` or `Density` with `direction = :y` is read horizontally.

## Read from data instead of a plot

To read values from data rather than from a plot, pass each series as
`(; x, y)`, with an optional `id`, `label`, and `color`. For a vertical
slice, `x` must be increasing, and for a horizontal slice, `y` must be.

```julia
probe = SliceInteractable(ax; series = [(; id = :wide, x = xs, y = ys)])
```

## Use a slice with other interactions

A marker or colorbar in the same widget keeps its own tooltip, and
hovering a marker hides the slice's line. A slice replaces the hover
highlight of the plots you passed it, whatever their ids in the widget.
For a slice built from series, or to cover different layers, list them in
`covers`, such as `covers = [:lines_2]`.

A slice needs a 2D `Axis`; see [Supported plots and axes](@ref) for
which axes and scales.

To read a single position instead of a series, see
[Read coordinates](@ref).
