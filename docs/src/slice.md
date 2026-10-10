# Slice across series

A slice reads several lines at once. As you move the pointer, a
vertical line follows it, a dot sits where it crosses each line you
gave the slice, and the tooltip lists each of those lines' values at
that `x`. Use it to compare
several series at the same position, such as spectra at one wavelength
or traces at one time.

Move the pointer across the spectra below:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-slice-player" data-masque-embed="slice_spectra" title="Three absorbance spectra. Hover to read each spectrum at the wavelength under the pointer." style="width:100%;height:1400px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("slice_spectra")
```

## Add a slice

`masque(fig)` never adds a slice on its own, so pass your line plots to
a [`SliceInteractable`](@ref) yourself:

```julia
begin
    xs = 0:0.1:10
    fig = Figure()
    ax = Axis(fig[1, 1])
    a = lines!(ax, xs, sin.(xs); label = "sine")
    b = lines!(ax, xs, cos.(xs); label = "cosine")
    probe = SliceInteractable([a, b])
    nothing
end
```

```julia
masque(fig, probe)
```

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

## How a slice differs from other interactables

A slice, a threshold, and a brush all draw something across the plot,
but they do different jobs. The slice follows the pointer and sends
nothing to your notebook. The others stay where you leave them, and
your notebook gets their value:

| To get | Use | You | Your notebook gets |
|---|---|---|---|
| The value of each line you pass it, at the pointer | [`SliceInteractable`](@ref) | hover | nothing |
| Which line you clicked | `masque(fig)`, with the line in `bind` | click a line | that line ([Click marks](@ref)) |
| The coordinates you clicked | [`AxisInteractable`](@ref) | click | `x` and `y` ([Read coordinates](@ref)) |
| A cutoff | [`ThresholdInteractable`](@ref) | drag a line | its position ([Read coordinates](@ref)) |
| A range of `x` and `y`, or the points in it | [`ROIInteractable`](@ref) | drag a box | the box or the points inside ([Brush a region](@ref)) |

So use a slice to look across your series, and a brush to pick out a
part of your data and work with it.

## Keep a position

To keep the `x` you are reading, add an [`AxisInteractable`](@ref) to
the same widget. Hovering still shows the slice's tooltip, and a click
saves the position:

```julia
@bind at masque(
    fig,
    SliceInteractable([a, b]);
    auto = false,
    bind = AxisInteractable(ax),
)
```

`bind = AxisInteractable(ax)` adds the readout and makes `at` its
value, and `auto = false`
leaves out what `masque(fig)` would add for the lines and their legend,
so only the slice and the readout respond to the pointer. `at` is
`nothing` until the first click. After that, `at.x` is the `x` you clicked, and a later cell can
read your data there:

```julia
if isnothing(at)
    "click a position"
else
    i = argmin(abs.(xs .- at.x))
    (; x = xs[i], sine = sin(xs[i]), cosine = cos(xs[i]))
end
```

## What it reads

By default, a vertical line follows the pointer, and the tooltip shows
each series' `y` at the pointer's `x`. `orientation = :horizontal` reads
`x` at the pointer's `y` instead. `crosshair = false` keeps the dots and
the tooltip but draws no line.

You can pass a `Lines`, `Stairs`, `Series`, `Band`, or `Density` plot,
or a vector of them. The slice reads each curve as drawn, so `Stairs`
keeps its steps, and `Band` and `Density` give their upper curve. A
`Band` or `Density` with `direction = :y` is read horizontally.

The tooltip is a table of the sampled values. To change what it shows,
pass a `masque"..."` template over the same fields, or pass
`tooltip = false` to turn it off. See [Tooltips](@ref).

## Series from data

To read values from data rather than from a plot, pass each series as
`(; x, y)`, with an optional `id`, `label`, and `color`. For a vertical
slice, `x` must be increasing, and for a horizontal slice, `y` must be.

```julia
probe = SliceInteractable(ax; series = [(; id = :wide, x = xs, y = ys)])
```

## Next to other interactables

A marker or colorbar in the same widget keeps its own tooltip, and
hovering a marker hides the slice's line. A slice replaces the hover
highlight of the plots you passed it, whatever their ids in the widget.
For a slice built from series, or to cover different layers, list them in
`covers`, such as `covers = [:lines_2]`.

A slice needs a 2D `Axis`; see [Supported plots and axes](@ref) for
which axes and scales.

To read a single position instead of a series, see
[Read coordinates](@ref).
