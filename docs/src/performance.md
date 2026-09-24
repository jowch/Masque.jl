# Performance

Masque adds very little to a figure you were going to show anyway, and
hovering costs nothing on the Julia side. What does cost something is
worth knowing before you point it at a large dataset. This page explains
what grows with what; the measured sizes and timings live in the
maintainers' [performance findings](https://github.com/jowch/Masque.jl/blob/main/docs/dev/perf-findings.md),
which are kept up to date as the format changes.

## What a widget sends to the browser

A Masque widget is two things:

- **The picture.** With CairoMakie, the figure rendered as an image. Its
  size depends on the figure's width on the page and on how busy the
  plot is, not on how many marks are interactive. WGLMakie sends the
  scene to draw instead of a picture; see [Backends](@ref).
- **The hit data.** Where every interactive mark is, plus its payload.
  This grows with the number of interactive marks and with the size of
  each payload.

For a typical interactive plot both are small and the notebook stays
responsive. The picture stays roughly the same size however many marks
there are, while the hit data keeps growing with them, so on a plot with
very many interactive marks the hit data becomes the larger term and is
what makes the notebook feel slow. The findings page has the measured
crossover.

Heatmaps are the exception to "grows with the data". When a grid's
cells are smaller than one screen pixel on its axis, Masque sends one
value per screen pixel instead of the whole matrix (see
[Inspect a grid](@ref)), so a very large heatmap costs about the same as
one that just fills the plot.

## What happens on each interaction

- **Hover** is handled entirely in the browser: no Julia runs, whatever
  the size of the data.
- **A click on a mark, or releasing a box or a threshold,** sets the
  `@bind` value, and Pluto re-runs every cell that reads it. The time
  that takes is the time your cells take — including drawing a new
  figure if one depends on the click. A click on empty space, and the
  end of a pan or orbit, set nothing and re-run nothing.
- **Pan and orbit** re-render the figure in Julia for each frame while
  you drag, so they cost one render per frame.

## Keeping large figures fast

- **Keep payloads to the fields you show.** Every field travels with
  every mark. Put the data you need later in Julia, and look it up with
  `pick.index` or an id field.
- **Use templates, not per-mark strings.** A `masque"..."` template is
  sent once per layer; a formatted string in every payload is sent once
  per mark.
- **Make fewer marks interactive.** Draw all the points, but pass only
  the interesting ones — outliers, a sample, the current selection — to
  a [`PointInteractable`](@ref).
- **Rebuild less often.** Every upstream change re-renders the figure and
  re-sends the widget. If a figure is redrawn many times a second, or
  animates, WGLMakie's live canvas is the better fit; see
  [Backends](@ref).
- **Mind the figure's width.** A wider figure is a bigger picture, though
  it does not change the hit data. `masque`'s `max_width` keyword (700
  pixels by default) caps the display width it renders for; a narrower
  figure is rendered at its own width.
