# Sample a series

A slice reads every line on an axis at once. As you move the pointer,
a vertical line follows it, a dot sits where it crosses each line, and
the tooltip lists each line's value at that `x`. Use it to compare
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
    fig = Figure()
    ax = Axis(fig[1, 1])
    a = lines!(ax, λ, control; label = "control")
    b = lines!(ax, λ, treated; label = "treated")
    probe = SliceInteractable(ax, [a, b])
    nothing
end
```

```julia
masque(fig, probe)
```

Each line's `label` names its row in the tooltip, as long as the label
is one word made of letters, digits, and underscores. Lines without such
a label show up as `s1`, `s2`, and so on, in the order you passed them.

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
| Every line's value at the pointer | [`SliceInteractable`](@ref) | hover | nothing |
| Which line you clicked | `masque(fig)` | click a line | that line ([Click marks](@ref)) |
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
    SliceInteractable(ax, [a, b]; covers = []),
    AxisInteractable(ax);
    auto = false,
)
```

`auto = false` keeps the lines from taking the click, so `at` always
holds a position. Pass `covers = []` along with it, because the lines
are no longer in the widget for the slice to stand in for. After a
click, `at.x` is the `x` you clicked, and a later cell can read your
data there:

```julia
if isnothing(at)
    "click a wavelength"
else
    i = argmin(abs.(λ .- at.x))
    (; wavelength = λ[i], control = control[i], treated = treated[i])
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
highlight of the line layers it covers, and by default it covers each
plot you passed it by that plot's layer id, such as `:lines`,
`:stairs`, or `:band`, with `_2` added when a type repeats. Those ids
are counted among the plots you passed to the slice, not among every
plot on the axis. So if you slice only the second of two `lines!`
plots, its id in the widget is `:lines_2` but the slice assumes
`:lines`, and the line you sliced still shows its own hover highlight.
To fix that, pass the layer yourself with `covers = [:lines_2]`.

A slice needs a 2D `Axis`; see [Supported plots and axes](@ref) for
which axes and scales.

To read a single position instead of a series, see
[Read coordinates](@ref).
