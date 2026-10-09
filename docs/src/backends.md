# Backends

Use CairoMakie for a figure you build once and explore. Use WGLMakie
when the figure animates or redraws often. `masque`, `@bind`, and every
interactable work the same on both.

## Choose a backend

Load a backend before you call `masque`: with only `CairoMakie`
loaded, `masque` shows a PNG, and with only `WGLMakie`, a GPU canvas.
With both loaded, `masque(fig)` uses CairoMakie, and with neither, it
raises an `ArgumentError`.

To pick the backend yourself, name it with `backend=`:

```julia
masque(fig; backend = :webgl)   # or :cairo
```

The package for that backend must be loaded; if it isn't, the error
says which one to load.

## Size and sharpness

Two `masque` keywords work the same on both backends:

- `max_width` is the widest the plot shows on the page, in CSS pixels.
  The default, 700, is the width of Pluto's column. A wider figure
  shrinks to fit.
- `px_per_unit` is how many image pixels each unit of the figure's
  `size` gets. By default, CairoMakie draws the PNG at twice the width
  it shows at, and WGLMakie draws 2 pixels per unit, so a wide figure
  that `max_width` shrinks is sharper on WGLMakie. A larger number
  gives a sharper picture when the reader zooms the page, and a heavier
  page to load.

```julia
masque(fig; max_width = 500, px_per_unit = 3)
```

## [Makie's settings don't change the widget](@id makie-settings)

Masque's settings belong to the widget. `CairoMakie.activate!` and
`WGLMakie.activate!` (`type`, `px_per_unit`, and the rest) change how a
plain `Figure` displays and how `save` writes it, but never a `masque`
widget. To change the widget, pass `masque`'s own keywords.

For example, `CairoMakie.activate!(type = "svg")` makes a plain
`Figure` display as SVG, while `masque(fig)` still shows a PNG with
tooltips and highlights drawn on top. To write an SVG file, call
`save("figure.svg", fig)`; you can do that in the same cell that
returns `masque(fig)`.

## CairoMakie

CairoMakie draws the figure once, as a PNG, when `masque` runs.
Tooltips and highlights are drawn on top of it in the browser, so they
stay sharp when you zoom the page. Redrawing the figure means a new PNG,
so an animation that rebuilds the figure every frame is slow; use
WGLMakie for that.

3D works without WGLMakie: points and segments on an `Axis3` respond,
and a [`ViewInteractable`](@ref) orbits the camera.

## WGLMakie

!!! note "Experimental"

    A new WGLMakie release can break Masque's WGLMakie backend. After
    you update WGLMakie, check that your plots still respond.

With WGLMakie, `masque` shows the figure on a GPU canvas in the
browser.

### Return the widget from the figure's cell

Return `masque(f)` from the cell that creates the figure, because a
WGLMakie `Figure` returned on its own shows in WGLMakie's own display,
without Masque's tooltips.

```julia
fig = let
    f = Figure()
    ax = Axis3(f[1, 1])
    scatter!(ax, randn(200), randn(200), randn(200))
    masque(f)
end;
```

```julia
@bind pick fig
```

End the cell with `;` so Pluto doesn't show the figure twice.

### Many plots on one page

A browser keeps only a limited number of GPU canvases live, so at most
8 WGLMakie plots are live at once, and a plot that scrolls into view
takes over from one that scrolled away. If more than 8 are on screen
together, the extra plots show a note instead of the figure, so to keep
them all live, use CairoMakie for the plots that do not need to move.

## Pan and orbit preview

While you drag with a [`ViewInteractable`](@ref), Julia redraws the
view: on CairoMakie each step is a new PNG, and on WGLMakie the canvas
already on the page updates. Either way, dragging the view needs a
running notebook. See [Pan and orbit](@ref).

## Export static HTML

A static HTML export keeps its tooltips and highlights on both
backends: it contains the PNG, or on WGLMakie the scene, which the
reader's GPU draws without Julia. For what stops working, see
[Static exports and this site](@ref).

## [Outside Pluto](@id outside-pluto)

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
to the page. Documenter warns about a page past 100 KB and stops the
build at 200 KB, so a page with several large figures goes in
`size_threshold_ignore`:

```julia
makedocs(; format = Documenter.HTML(; size_threshold_ignore = ["plots.md"]), ...)
```

A click highlights a mark there too, but nothing reads the choice: the
`@bind` value and dragging the view with a [`ViewInteractable`](@ref)
need a running Pluto notebook. A display that doesn't run the page's
scripts shows the plain figure, and a WGLMakie widget, which has no
image to fall back on, shows a box of the figure's size saying it is
drawn only in Pluto. To put a WGLMakie figure in a document, use
`backend = :cairo` there.
