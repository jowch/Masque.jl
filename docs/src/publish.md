# Publish outside Pluto

Tooltips and highlights work wherever the page runs its scripts: a
static HTML export of your notebook, a Documenter site, or an HTML page
you write. A click there still highlights a mark, but with no Julia
running, the `@bind` value and the cells that use it stay as they were.

## [Static HTML export](@id static-exports)

A static HTML export of your notebook keeps tooltips and highlights on
both backends, because it contains the PNG, or on WGLMakie the scene,
which the reader's browser draws. You can still select marks and drag
boxes. Cells that use the `@bind` value keep the values they had when
you exported, and panning does nothing. PlutoSliderServer cannot
precompute a `masque` widget's values either, because it does not know
which values the widget can take.

## [Examples on this site](@id this-site)

The interactive examples on this site replay results recorded from real
notebooks, and the **Simulating `@bind`** badge marks them. Hovering
works as it does in Pluto, and a click shows the result recorded for it.
A few interactions, such as a large brush or a pan, are shown as video
clips instead. A click on an axis or a colorbar position is not
recorded, so to see what those clicks return, run the example in your
own notebook.

## [Documenter and other web pages](@id outside-pluto)

A CairoMakie widget keeps its tooltips and highlights outside Pluto, in
Documenter or in an HTML page you write with
`show(io, MIME"text/html"(), w)`. Hover the two plots below; this page
built them with Documenter, without Pluto.

```@example outside-pluto
using CairoMakie, Masque

fig = Figure(size = (400, 260))
ax = Axis(fig[1, 1])
scatter!(ax, [1, 2, 3, 4], [1, 4, 9, 16]; markersize = 16)
masque(fig)
```

```@example outside-pluto
fig2 = Figure(size = (400, 260))
ax2 = Axis(fig2[1, 1])
lines!(ax2, 0:0.1:6, sin.(0:0.1:6))
masque(fig2)
```

The page loads Masque's script once from jsDelivr, the version that
matches your installed Masque, so hover needs an internet connection;
offline, the page shows the plain figures. Each widget adds its image
to the page. Documenter shows a picture in place of any output past
8 KB, which every widget is, so set `example_size_threshold = nothing`
to keep the hover. Documenter then writes every large output into its
page, plain figures too, and it warns about a page past 100 KB and
stops the build at 200 KB, so a page with several large figures goes in
`size_threshold_ignore`, whether or not it has a widget:

```julia
makedocs(;
    format = Documenter.HTML(; example_size_threshold = nothing, size_threshold_ignore = ["plots.md"]),
    ...,
)
```

A WGLMakie widget works there too: the page draws the figure on the
reader's GPU and loads WGLMakie's script, about 1 MB, once from
jsDelivr, from the release of your installed Makie and checked against
your copy. Each WGLMakie figure writes its whole scene into the page,
which on its own is more than Documenter's 200 KB limit, so every page
with a WGLMakie figure goes in `size_threshold_ignore`. Read offline,
or if the published script differs from your copy, each figure shows a
note in its box saying it couldn't load. To put a figure in a document
that must stay small or read offline, use `backend = :cairo` there.

Hover the points below, and click one to highlight it. This one is
drawn by WGLMakie in your browser:

```@example outside-pluto
using WGLMakie

fig3 = Figure(size = (420, 320))
ax3 = Axis3(fig3[1, 1])
t = range(0, 4π; length = 40)
scatter!(ax3, cos.(t), sin.(t), t ./ 4π; color = t, markersize = 14)
masque(fig3; backend = :webgl)
```

A click highlights a mark there too, but nothing reads the choice: the
`@bind` value and dragging the view with a [`ViewInteractable`](@ref)
need a running Pluto notebook. A display that doesn't run the page's
scripts shows the plain CairoMakie figure, or an empty box for
WGLMakie.

## Show a widget to tools without a browser

A tool that reads a notebook without a browser, such as an AI agent,
can ask a CairoMakie widget for its figure as a PNG,
`show(io, MIME"image/png"(), w)`. A WGLMakie widget has no PNG, since
the reader's browser draws it; render the figure with CairoMakie for
one. Both print a short text summary in the REPL: each axis with its
title, each layer with what it draws and its tooltip fields, and the
`@bind` value the widget starts with.

Next: [Backends](@ref) to choose between CairoMakie and WGLMakie.
