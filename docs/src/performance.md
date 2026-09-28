# Performance

Hovering costs nothing in Julia. On a large dataset, what grows is the
number of interactive marks and the size of each payload, so trim
those first (see [Keeping large figures fast](@ref)). The measured
sizes and timings are in the maintainers'
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

Heatmaps do not grow with the data this way. When a grid's cells are
smaller than one screen pixel on its axis, Masque sends one value per
screen pixel instead of the whole matrix (see [Inspect a grid](@ref)).
A very large heatmap costs about the same as one that just fills the
plot.

## What happens on each interaction

- Hovering does not run Julia, however large the data.
- Clicking a mark, or releasing a box or a threshold line, updates the
  `@bind` value, and cells that use it respond. That takes as long as
  those cells take, including creating a new figure if one depends on
  the click. A click in empty space, and the end of a pan or orbit,
  change nothing.
- Panning and orbiting render the figure again in Julia for each frame
  while you drag, so they cost one render per frame.

## Keeping large figures fast

- Keep payloads to the fields you show. Every field is sent with every
  mark. Keep the data you need later in Julia, and look it up with
  `pick.index` or an id field.
- Use a template instead of a formatted string in every payload. A
  `masque"..."` template is sent once per layer; a string in each
  payload is sent once per mark.
- Make fewer marks interactive. Plot all the points, but pass only the
  interesting ones, such as outliers, a sample, or the current
  selection, to a [`PointInteractable`](@ref).
- Rebuild the figure less often. Every change upstream renders the
  figure again and sends the whole widget again. If a figure is redrawn
  many times a second, or animates, WGLMakie's live canvas fits better;
  see [Backends](@ref).
- To send a smaller picture of a wide figure, lower `masque`'s
  `max_width` keyword (700 pixels by default).
