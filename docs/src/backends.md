# Backends

Use CairoMakie for a figure you build once and explore. Use WGLMakie
when the figure animates or redraws often. `masque`, `@bind`, and every
interactable work the same on both.

## Choose a backend

Load a backend before you call `masque`. With only `CairoMakie` loaded,
`masque` shows a PNG; with only `WGLMakie`, a GPU canvas. With both
loaded, `masque(fig)` uses CairoMakie. With neither, it raises an
`ArgumentError`.

To pick the backend yourself, or to set a WGLMakie-only option such as
`px_per_unit`, pass a backend object to `backend=`. The backend types
are not exported, so get them with `Base.get_extension`:

```julia
masque(
    fig, interactables;
    backend = Base.get_extension(Masque, :MasqueWGLMakieExt).WebGLBackend(;
        px_per_unit = 3.0,
    ),
)
```

`max_width` is the width of Pluto's column in CSS pixels (default 700).
A backend object you pass uses its own `max_width`.

## CairoMakie

CairoMakie draws the figure once, as a PNG, when `masque` runs.
Tooltips and highlights are drawn on top of it in the browser, so they
stay sharp when you zoom the page. Redrawing the figure means a new PNG,
so a figure you rebuild every frame of an animation is slow.

3D works without WGLMakie: points and segments on an `Axis3` respond,
and a [`ViewInteractable`](@ref) orbits the camera.

### SVG display and files

`CairoMakie.activate!(type = "svg")` changes how a plain `Figure`
displays. It doesn't change `masque(fig)`, which always shows a PNG on
CairoMakie. To write an SVG file, call `save("figure.svg", fig)`; you
can do that in the same cell that returns `masque(fig)`.

## WGLMakie

!!! note "Experimental"

    A new WGLMakie release can break Masque's WGLMakie backend. After
    you update WGLMakie, check that your plots still respond.

With WGLMakie, `masque` shows the figure on a GPU canvas in the
browser.

### The widget is the figure

Return `masque(f)` from the cell that creates the figure. A WGLMakie
`Figure` returned on its own is WGLMakie's own display, without
Masque's tooltips.

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

A browser keeps only a limited number of GPU canvases live. At most 8
WGLMakie plots are live at once; a plot that scrolls into view takes
over from one that scrolled away. If more than 8 are on screen
together, the extra plots show a note instead of the figure.

## Pan and orbit preview

While you drag with a [`ViewInteractable`](@ref), Julia redraws the
view. On CairoMakie each step is a new PNG; on WGLMakie the canvas
already on the page updates. Either way, dragging
the view needs a running notebook. See [Pan and orbit](@ref).

## Export static HTML

A static HTML export keeps its tooltips and highlights on both
backends: it contains the PNG, or on WGLMakie the scene, which the
reader's GPU draws without Julia. For what stops working, see
[Static exports and this site](@ref).
