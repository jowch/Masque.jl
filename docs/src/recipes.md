# Your own plot types

A plot type you define with Makie's `@recipe` responds without any work
on your part: `masque(fig)` makes each `scatter!`, `lines!`, or other
plot your recipe draws respond as it would on its own (see [Supported
plots and axes](@ref)). To make your plot type respond as one thing,
with its own layer id and a payload that means something for your data,
define one method of [`interactables`](@ref) for it.

## A dumbbell chart

A dumbbell chart draws one bar per row from a value before to a value
after, with a dot at each end. This recipe draws the bars with
`linesegments!` and the dots with two `scatter!` calls:

```julia
begin
    @recipe Dumbbell (before, after) begin
        color = :gray70
        linewidth = 6
        beforecolor = :steelblue
        aftercolor = :firebrick
        markersize = 14
    end

    function Makie.plot!(p::Dumbbell)
        map!(p.attributes, [:before, :after], [:bars, :starts, :ends]) do before, after
            starts = [Point2f(x, k) for (k, x) in enumerate(before)]
            ends = [Point2f(x, k) for (k, x) in enumerate(after)]
            bars = [q for k in eachindex(starts) for q in (starts[k], ends[k])]
            return (bars, starts, ends)
        end
        linesegments!(p, p.bars; color = p.color, linewidth = p.linewidth)
        scatter!(p, p.starts; color = p.beforecolor, markersize = p.markersize)
        scatter!(p, p.ends; color = p.aftercolor, markersize = p.markersize)
        return p
    end
end
```

Without a method of its own, each bar and each dot is a separate mark,
and a click reports which bar or dot it was rather than the row's
values. To make each row one mark that reports
its values, add this method:

```julia
function Masque.interactables(ax, p::Dumbbell; id = :dumbbell, payloads = nothing, kwargs...)
    before, after = p.before[], p.after[]
    rows = [
        (; row = k, before = before[k], after = after[k], change = after[k] - before[k])
            for k in eachindex(before)
    ]
    bars = p.plots[1]
    return interactables(ax, bars; id, payloads = something(payloads, rows), kwargs...)
end
```

Now hovering a row anywhere along its bar shows its values, and a click
sets `pick` to that row, so `pick.change` is how much the row changed:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-recipes-dumbbell" data-masque-embed="recipes_dumbbell" title="A dumbbell chart of three rows. Hover or click a row." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("recipes_dumbbell")
```

In a notebook, put the recipe and the method in their own cells, so
rebuilding the figure does not define them again.

## Writing the method

`masque(fig)` calls your method once for each plot of your type, with
the axis the plot is drawn in and the plot itself. The method returns a
vector of interactables, built with the same constructors you would use
in a `masque` call; see [Constructors](@ref).

Give the first layer the `id` you receive. `masque` picks it from your
plot function's name, so the first `dumbbell!` is `:dumbbell`, the
second is `:dumbbell_2`, and `pick.layer` and `selected=` use these
names.

Pass `kwargs...` on to the constructors. A caller who wants a different
tooltip or payloads for one plot passes them with the plot:

```julia
d = dumbbell!(ax, before, after)
@bind pick masque(fig, interactables(d; tooltip = masque"change $(change)"))
```

Those keywords reach your method, and without `kwargs...` in its
signature this call fails with a `MethodError`. The method above also takes `payloads`
by name, so a caller's payloads replace the rows it builds.

## Hit size from the drawn plot

The method above passes the recipe's own `linesegments!` plot,
`p.plots[1]`, to [`interactables`](@ref), so the bar responds over its
drawn width and follows the plot if you move it with `translate!`.
`p.plots` lists the plots your `plot!` method draws, in the order it
draws them.

You can also build layers from positions, for a shape your recipe does
not draw as a plot of its own. Then you give the hit size yourself, as
`radius` for points and `tol` for lines:

```julia
function Masque.interactables(ax, p::Dumbbell; id = :dumbbell, kwargs...)
    before, after = p.before[], p.after[]
    pairs = [Point2f(x, k) for k in eachindex(before) for x in (before[k], after[k])]
    return [SegmentInteractable(ax, pairs; mode = :pairs, tol = 6, id, kwargs...)]
end
```

## Several layers

To make two parts of your plot respond separately, return a layer for
each, and name every layer after the first from `id`, such as
`Symbol(id, :_dots)`. A name that ends in a number, like
`Symbol(id, :_2)`, clashes with the second plot of your type.

Where two of your layers overlap, the pointer reaches the one that
comes first in the vector, so put the part drawn on top first. This
version makes each dot its own mark, ahead of the bar under it:

```julia
function Masque.interactables(ax, p::Dumbbell; id = :dumbbell, kwargs...)
    starts = interactables(ax, p.plots[2]; id, kwargs...)
    ends = interactables(ax, p.plots[3]; id = Symbol(id, :_ends), kwargs...)
    bars = interactables(ax, p.plots[1]; id = Symbol(id, :_bars), kwargs...)
    return vcat(starts, ends, bars)
end
```

Your plot as a whole takes its place among the other plots on the axis
the same way as any plot: where marks of two plots overlap, the plot
drawn last gets the pointer (see [`interactables`](@ref)).

## In a package

If your recipe lives in a package, put the method in a package
extension, so that your users load Masque only if they use it. In your
`Project.toml`:

```toml
[weakdeps]
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"

[extensions]
MyPlotsMasqueExt = "Masque"
```

and in `ext/MyPlotsMasqueExt.jl`:

```julia
module MyPlotsMasqueExt

using MyPlots, Masque

function Masque.interactables(ax, p::MyPlots.Dumbbell; id = :dumbbell, payloads = nothing, kwargs...)
    # as above
end

end
```

To make a click return a type of your own instead of an
[`ElementEvent`](@ref), see [A custom interactable](@ref).
