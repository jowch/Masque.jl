# Performance

On a large dataset, what grows is the number of interactive marks and
the size of each payload, so trim those first (see
[Keeping large figures fast](@ref)). The measured sizes and timings are
in the maintainers'
[performance findings](https://github.com/jowch/Masque.jl/blob/main/docs/dev/perf-findings.md).

## What a widget sends to the browser

A Masque widget sends two things:

| Part | What it is | What makes it grow |
|---|---|---|
| The picture | With CairoMakie, the figure as an image. WGLMakie sends the scene to draw instead; see [Backends](@ref). | The figure's width on the page and how busy the plot is, not how many marks are interactive |
| The hit data | Where each interactive mark is, plus its payload | The number of interactive marks and the size of each payload |

For a typical interactive plot both are small, and the notebook stays
responsive. The picture stays about the same size however many marks
there are, while the hit data keeps growing with them. On a plot with
very many interactive marks, the hit data becomes the larger part and
makes the notebook feel slow. The findings page has the measured
crossover.

Heatmaps do not grow with the data this way: when a grid's cells are
smaller than one screen pixel on its axis, Masque sends one value per
screen pixel instead of the whole matrix, so a very large heatmap costs
about the same as one that just fills the plot (see
[Inspect a grid](@ref)).

## What happens on each interaction

Hovering does not run Julia, so it stays fast however large the data
is. A click on a mark or a release takes as long as the cells that use
the `@bind` value take, including creating a new figure if one depends
on the click. A click on empty space, and the end of a pan or orbit,
leave the value unchanged, so those cells do not run. Panning and orbiting render the figure again in Julia for
each frame while you drag, so they cost one render per frame. For what
each gesture changes, see [How interactions work](@ref).

## Keeping large figures fast

Every payload field is sent with every mark, so keep payloads to the
fields you show. Keep the data you need later in Julia, and look it up
with `pick.index` or an id field.

A `masque"..."` template is sent once per layer, while a formatted
string in each payload is sent once per mark, so use a template instead.

To send fewer marks, plot all the points but pass only the interesting
ones, such as outliers, a sample, or the current selection, to a
[`PointInteractable`](@ref), and pass it to `masque` with `auto = false`
so the other points are left out:

```julia
outliers = PointInteractable(ax, [(2.0, 9.5), (7.0, 0.3)])
@bind pick masque(fig, outliers; auto = false)
```

With `auto = false`, only what you pass is interactive, so to keep
another plot interactive, pass its interactables in the same call.

Every change upstream renders the figure again and sends the whole
widget again, so rebuild the figure as rarely as you can. If a figure
changes many times a second, or animates, WGLMakie's live canvas fits
better; see [Backends](@ref).

To send a smaller picture of a wide figure, lower `masque`'s
`max_width` keyword (700 pixels by default).
