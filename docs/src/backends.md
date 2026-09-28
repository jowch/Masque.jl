# Backends

Masque has two backends, CairoMakie and WGLMakie. `masque`, `@bind`,
[`InteractionEvent`](@ref), and every interactable work the same on
both. The backends differ in cost and in how a pan or orbit looks while
you drag.

If you are new to Masque, start with [Getting started](@ref).

## Choose a backend

Load a Makie backend before you call `masque`.

- Load neither `CairoMakie` nor `WGLMakie`: the first `masque` call
  raises `ArgumentError`.
- Load only `CairoMakie`: Masque uses the static PNG backend.
- Load only `WGLMakie`: Masque uses the WebGL backend.
- Load both: `masque(fig)` without `backend=` uses CairoMakie, so an
  extra `using WGLMakie` does not change your CairoMakie plots.

To choose the backend yourself, pass a backend object to `backend=`. A
`:cairo` or `:webgl` symbol does not work there. `CairoBackend` and
`WebGLBackend` are not exported from `Masque`, so get them with
`Base.get_extension`. You need this for a WebGL-only setting such as
`px_per_unit`:

```julia
masque(
    fig, interactables;
    backend = Base.get_extension(Masque, :MasqueWGLMakieExt).WebGLBackend(;
        px_per_unit = 3.0,
    ),
)
```

`max_width` on `masque` is the width of Pluto's column, in CSS px
(default 700). It applies when you do not pass `backend=`. A backend
object you pass uses its own `max_width`.

## CairoMakie

`using CairoMakie` selects it. CairoMakie renders the figure to a PNG
once, when `masque` runs. Tooltips and highlights are drawn in the
browser on top of that image, and a click reaches your notebook through
`@bind`.

There is one render per `masque()` call, however many marks are
interactive. That is cheap for a figure you build once and explore. It
is expensive if you re-render the figure for every frame of an
animation, because each frame redraws the whole figure as a new PNG.

CairoMakie handles 3D: a static `Axis3` figure works without WGLMakie.
Clicking a scatter point on an `Axis3` returns an
[`ElementEvent`](@ref) with `x`, `y`, and `z`. A `lines!` plot is one
element, and its default payload holds only its `index`.
`meshscatter!` takes its hover size from `markersize`, in data units
(`radius3d`). To orbit, pass a [`ViewInteractable`](@ref) for that
axis. [Recipes masque(fig) extracts](@ref) lists the plots `masque(fig)`
makes interactive. For what you see while you drag, see
[Pan and orbit preview](@ref).

### SVG display and files

`CairoMakie.activate!(type = "svg")` chooses the picture a bare `Figure`
shows in Pluto, VS Code, and other rich displays. Return the `Figure`
from a cell when you want that display. Return `masque(fig)` when you
want the interactive figure. The two can share a notebook.

`save("figure.svg", fig)` writes an SVG file. The extension sets the
format. Call it on the figure when you want that file, including from a
cell whose return value is `masque(fig)`.

`masque(fig)` shows a PNG on CairoMakie and a GPU canvas on WGLMakie,
whatever `type` you activated. The hover highlight, the selected
highlight, and the tooltip are drawn on top in the browser, so they stay
sharp when you zoom the page. The plot under them is the PNG or the
canvas.

`WGLMakie.activate!` has no `type` option. If you call
`CairoMakie.activate!`, CairoMakie is loaded, so `masque(fig)` without
`backend=` uses the PNG even when WGLMakie is loaded too. See
[Choose a backend](@ref).

## WGLMakie

!!! note "Experimental"

    The WGLMakie backend is experimental. It has been checked end to end
    in a real Pluto notebook: rendering, tooltips and highlights, and a
    click reaching `@bind`.

With `using WGLMakie`, and CairoMakie not loaded, `masque` shows the
figure on a GPU canvas in the browser. You call `masque` and `@bind`
the same way as with CairoMakie.

### The widget is the figure

Return `masque(f)` from the cell that creates the figure. That cell
then shows the interactive figure, and `@bind` is optional. A WGLMakie
`Figure` returned on its own is WGLMakie's live display, without
Masque's tooltips. That display needs a connection to Bonito's server
in the notebook process, and it can sit beside `masque` widgets on the
same page.

```julia
fig = let
    f = Figure()
    ax = Axis3(f[1, 1])
    scatter!(ax, randn(200), randn(200), randn(200))
    masque(f)
end
```

To bind the widget, end that cell with `;` so Pluto does not show the
widget twice, and bind it in another cell:

```julia
fig = let
    f = Figure()
    ax = Axis3(f[1, 1])
    scatter!(ax, randn(200), randn(200), randn(200))
    masque(f)
end;

@bind pick fig
```

You can also display a `Figure` in one cell and write
`@bind pick masque(fig)` in another. That works on both backends, but
it shows the figure twice. Use the layout above with WGLMakie. It is a
good habit in Pluto on either backend.

Choose WGLMakie for a live GPU canvas: animation, frequent re-renders,
or large data that updates, where a new PNG per frame adds up. For a
figure you build once and explore, CairoMakie's static PNG is lighter.

The WGLMakie JavaScript is sent to the browser once per notebook. Each
extra `masque(fig)` cell adds its own scene, not another copy of that
JavaScript. Masque's WebGL backend depends on WGLMakie internals
(`serialize_scene`), so a new WGLMakie version can break it. After you
update WGLMakie, check that your `:webgl` plots still work.

At most 8 `:webgl` plots hold a live WebGL context. Desktop Chrome and
Safari allow 16, Android Chrome allows 8, and Firefox allows several
hundred. 8 fits all of them and leaves room for another tab. A plot
that is off screen gets no context until it scrolls into view, and a
plot that scrolls away releases its context before the next plot takes
one. If more than 8 are on screen together, the extra plots show a
note. Without that limit, the browser would blank a canvas of its own
choosing. `:cairo` plots use no WebGL context.

Loading WGLMakie in a notebook that already loaded CairoMakie does not
switch `masque` to WebGL. Pass `backend=` as shown in
[Choose a backend](@ref), or use a notebook that loads only WGLMakie.

For runnable examples, see [Examples](@ref).

## Pan and orbit preview

Dragging with a [`ViewInteractable`](@ref) changes the view, not the
`@bind` value: the bound variable never holds a `:view` event. The
view is how you look at the data, not a result for your notebook.

While you drag, Julia redraws the view on both backends. It updates the
axis limits (2D pan or wheel zoom) or `azimuth` and `elevation`
(`Axis3` orbit), updates where the marks respond to the pointer, and
sends a new frame through `with_js_link`. The mouse wheel zooms a 2D
view about the cursor: the axis frame stays in place and the data
inside it moves. On `:cairo` each frame is a new PNG. On `:webgl` it is
a new scene, drawn on the canvas already on the page. Because Julia
draws each frame, pan and orbit need a running notebook. They do
nothing in a static export.

On an `Axis3`, `ViewInteractable` orbits the camera. On a `PolarAxis`,
a `Colorbar`, a categorical 2D axis, or a 2D scale Masque cannot invert
in the browser, it raises `ArgumentError`. `masque` refuses an
`LScene` on both backends. Use `Axis3` for interactive 3D.

To keep a camera view when the figure is rebuilt, store it in an
explicit `Ref` and rebuild the figure from it. Do not use `selected=`
for this. The [Limits](@ref) example shows that pattern. For a
recording of a CairoMakie pan and the cells behind it, see
[Pan and orbit](@ref).

## Export static HTML

A Pluto notebook exported to static HTML keeps its tooltips and
highlights on both backends. The export contains the figure (the PNG on
`:cairo`, or the scene on `:webgl`, drawn by the reader's GPU with no
Julia server) and the data the tooltips need. The page still loads
Pluto's frontend from a CDN.

Anything that needs Julia stops working. A click that sets `pick` no
longer changes the cells that use it, and pan and orbit frames stop,
because no Julia is running to draw them.

For how the examples on this site work as static pages, see
[Static exports and this site](@ref).
