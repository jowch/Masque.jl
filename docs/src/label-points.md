# Label points into classes

The reader chooses a class from the menu and clicks points, or drags a box
over them, to give them that class. Each point takes the color of its
class, and other cells can read the labels. The widget uses the parts the
earlier pages show: a menu in the figure ([Put the controls in the
figure](@ref)), a scatter built with `select = :many` ([Select several
marks](@ref)), and an `onchange` function that keeps the labels in a
`Dict` and recolors the points ([Update the figure](@ref)).

## Create the figure and the labels

Create the figure with the points in gray, the menu below them, and a
color for each class. Give the scatter one color per point from the
start, as `fill(:gray70, length(xs))`, so that `onchange` can change each
point's color, as [Change the plots you already have](@ref) describes.

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

## Build the widget

Each time the selection or the menu changes,
`onchange` gives every newly selected point the class shown in the menu,
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

## Use the labels in another cell

To use the labels in another cell, mention `w` in it as well, so the cell
responds to every click:

```julia
begin
    w
    good = sort([i for (i, c) in labels if c == "good"])
    xs[good], ys[good]
end
```

## Change a label or start over

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
`labels`. The menu keeps the class the reader chose. To pick up where the
reader left off, start the widget with the labeled points already
picked. Add `selected` to the `masque` call, as
[Start with a mark selected](@ref) describes:

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

## Where to go next

[Use selections in other cells](@ref) shows more ways to use the points the
reader selects, and [Examples](@ref) has more widgets to copy.
