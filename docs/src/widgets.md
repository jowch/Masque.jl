# Build a widget

A figure with a few named plots and controls, passed to one `masque`
call, becomes a small tool: the reader clicks, picks and chooses, and
other cells get one value that holds all of it. The example at the end
of this page labels points into classes.

## Name each part

Name each plot and each control in one named tuple. The example below
has two plots:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-widgets-value" data-masque-embed="widgets_value" title="A scatter of samples and a bar chart of batches. Click a point and a bar, and the readout names both." style="width:100%;height:1180px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("widgets_value")
```

[What the `@bind` value holds](@ref) lists what each kind of field
holds, and [Choose the fields with `bind`](@ref) shows how to keep a
field out of the value.

## Let picks add up

A widget that builds something up, such as a set of labeled points,
needs every click to add to what the reader has already picked rather
than replace it. Pass the plot with `select = :many`, as
[Select several marks](@ref) describes:

```julia
@bind w masque(fig, (pts = interactables(sc; select = :many),))
```

## Put the controls in the figure

A widget often needs a setting next to the plot, such as which class a
click assigns or how strongly to smooth a curve. If the `masque` cell
reads a slider or menu from another cell, changing it runs the `masque`
cell again, and the reader loses every pick. To keep the picks, lay out
Makie's own `Menu`, `Slider` or `Toggle` in the figure and name it in the
same named tuple:

```julia
class = Menu(fig[2, 1]; options = ["good", "bad", "unsure"])
@bind w masque(fig, (class = class, pts = interactables(sc; select = :many)))
```

`w.class` is then the option chosen, and changing it leaves the picks as
they were. [Sliders and toggles](@ref) lists the controls you can use.

## Change the figure and keep state

With `onchange`, a function you write runs after every change the reader
makes and can update the plots, so the figure answers without the cell
running again; [Update the figure](@ref) shows how. The function gets
the widget's current state, the same fields as `w`. When it needs to
remember something between changes, such as which class each point was
given, keep it in a `Dict` or a `Ref` created in another cell, and change
it inside the function. What happens to that state when the cell runs
again is in [Keep the labels when the cell runs again](@ref).

## Example: label points into classes

The reader chooses a class from the menu and clicks points, or drags a box
over them, to give them that class. Each point takes the color of its
class, and other cells can read the labels.

Create the figure with the points in gray, the menu below them, and a
color for each class. Give the scatter one color per point from the
start, as `fill(:gray70, length(xs))`, so that `onchange` can change each
point's color; a scatter created with a single color raises an error
when it is given a list of colors.

```julia
begin
    xs = Float64[1.2, 1.6, 2.1, 1.4, 2.4, 1.9, 2.8, 5.1, 5.6, 6.2, 5.4, 6.0, 6.6, 5.8, 3.9, 4.3, 8.4, 0.6]
    ys = Float64[2.0, 2.9, 2.3, 3.4, 3.1, 1.6, 2.6, 6.1, 5.4, 6.4, 7.0, 7.4, 5.9, 6.6, 4.6, 1.2, 4.4, 7.5]
    fig = Figure(size = (560, 420))
    ax = Axis(fig[1, 1])
    sc = scatter!(ax, xs, ys; color = fill(:gray70, length(xs)), markersize = 16)
    class = Menu(fig[2, 1]; options = ["good", "bad", "unsure"], width = 160, tellwidth = false)
    colors = Dict("good" => :seagreen, "bad" => :crimson, "unsure" => :orange)
    nothing
end
```

Keep the labels in a cell of their own, from each point's position in
`xs` to its class:

```julia
labels = Dict{Int, String}()
```

Then build the widget. Each time the picks or the menu change, the
function gives every newly picked point the class shown in the menu,
takes the label off a point that is no longer picked, and colors the
points:

```julia
@bind w masque(fig, (class = class, pts = interactables(sc; select = :many));
    onchange = state -> begin
        picked = [e.index for e in state.pts]
        # A point that is no longer picked loses its label
        for i in collect(keys(labels))
            i in picked || delete!(labels, i)
        end
        # A newly picked point takes the class shown in the menu
        for i in picked
            get!(labels, i, state.class)
        end
        pointcolors = [haskey(labels, i) ? colors[labels[i]] : :gray70 for i in eachindex(xs)]
        update!(sc; color = pointcolors)
    end,
)
```

```@raw html
<video id="masque-widgets-classes-clip" title="Labeling three points good, switching the menu to bad and boxing a group of points, labeling one point unsure, then clicking a good point to take its label off, with CairoMakie"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-widgets-classes-clip");
  if (!el) return;
  el.src = (pretty ? "../assets/" : "assets/") + "widgets-classes.mp4";
})();
</script>
```

To use the labels in another cell, mention `w` in it as well, so the cell
responds to every click:

```julia
begin
    w
    good = sort([i for (i, c) in labels if c == "good"])
    xs[good], ys[good]
end
```

The `@bind` value holds the points picked, not their classes, so the
function works the classes out by comparing the picks with the labels it
kept. That has three consequences. A click on a labeled point takes its
label off, whatever class the menu shows, so to move a point to another
class, click it once to take it out and again with the new class chosen.
Changing the menu doesn't relabel anything; it only sets the class of the
next points picked. And starting over, as described in
[Select several marks](@ref), takes every label off, so before the reader
starts over, copy the labels they want to keep into a new cell:

```julia
saved = copy(labels)
```

That cell doesn't use `w`, so it keeps the copy while the reader goes on
labeling.

## Keep the labels when the cell runs again

When the `masque` cell runs again, for example because you edited it,
the new widget starts with no picks, and its first `onchange` run clears
`labels`. The menu keeps the class the reader chose. To pick up where the reader left off, start the widget with
the labeled points already picked. Add `selected` to the `masque` call:

```julia
@bind w masque(fig, (class = class, pts = interactables(sc; select = :many));
    selected = (pts = collect(keys(labels)),),
    onchange = state -> begin
        # as above
    end,
)
```

Every labeled point starts picked, so the first `onchange` run keeps
its label. Running the `labels` cell again starts over with no labels.

Next: [Linked views](@ref) uses the value in other cells to drive more
plots.
