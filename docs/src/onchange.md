# Update the figure

Pass `onchange` to `masque` to change the figure as the reader works the
widget: refit a line through the points they select, or redraw a mask as
they drag a threshold. The cell does not run again, so the selection, the
threshold, and the view stay where the reader left them.

```julia
begin
    xs = Float64[1, 2, 3, 4, 5, 6, 7, 8]
    ys = Float64[1.2, 1.9, 3.2, 3.8, 5.1, 6.3, 6.8, 8.1]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
    fitline = lines!(ax, [1.0, 8.0], [1.0, 8.0]; color = :crimson)
    sc = scatter!(ax, xs, ys; markersize = 14)
    nothing
end
```

```julia
@bind w masque(fig, (pts = interactables(sc; select = :many),);
    onchange = state -> begin
        picked = [e.index for e in state.pts]
        if length(picked) >= 2
            x, y = xs[picked], ys[picked]
            # The straight line closest to the picked points
            mx, my = sum(x) / length(x), sum(y) / length(y)
            slope = sum((x .- mx) .* (y .- my)) / sum((x .- mx) .^ 2)
            update!(fitline, [1.0, 8.0], my .+ slope .* ([1.0, 8.0] .- mx))
        end
    end,
)
```

Click a few points: the red line moves to fit the points you selected.
With `select = :many`, each click adds a point to the selection, as
[Select several marks](@ref) describes, and `w.pts` holds the same points
for other cells.

```@raw html
<video id="masque-onchange-clip" title="Clicking points one at a time while the red line refits to them, then clicking one again to take it out, with CairoMakie"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-onchange-clip");
  if (!el) return;
  el.src = (pretty ? "../assets/" : "assets/") + "onchange.mp4";
})();
</script>
```

`state` has one field for each plot you can select from and each control,
with the same names and values as the `@bind` value
([What the `@bind` value holds](@ref)). The function runs once
when the cell runs, before the figure first shows, and then after every
change the reader makes. While the reader
drags a threshold line or a box, it runs as the control moves; to wait for
the release instead, build the control with `update_while_dragging = false`.

## Change the plots you already have

Create every plot `onchange` will change before you call `masque`, give it a
name, and change it with Makie's `update!`, or set one of its arguments:

```julia
update!(fitline, newxs, newys)               # new data
maskplot[1] = newmatrix                      # one argument
update!(maskplot; visible = state.show)      # an attribute
```

To change one color, size or marker per point, create the plot with one
per point from the start, such as `color = fill(:gray70, length(xs))`: a
scatter created with a single color raises an error when `onchange` gives
it a list of colors.

Adding a plot or deleting one inside `onchange` raises an error that names
the plot. To show a plot only sometimes, create it at the start and switch
its `visible` attribute. A hidden plot shows no tooltip and takes no clicks.

If a plot ends up with a different number of marks, for example a scatter
that shows only the points above a threshold, or you hide it, the points
picked on it are cleared, and the `@bind` value changes with them.
Hiding a plot of a [`linked`](@ref) group keeps the group's rows, which
stay selected on its other plots. The group's rows are cleared when its
plots' rows change: a different number of marks or, with `key`, the keys
in a different order.

## Remember things between changes

The function sees only the widget's current state. When it needs to
remember something from one change to the next, such as the class each
point was given, keep it in a `Dict` or a `Ref` created in another cell,
and change it inside the function:

```julia
labels = Dict{Int, String}()
```

The `Dict` keeps its contents while the reader works the widget. When the
`masque` cell runs again, the widget starts with nothing selected, so the
first run of the function sees no selection; [Keep the labels when the
cell runs again](@ref) shows how to start the new widget where the reader
left off. [Label points into classes](@ref) builds a whole widget this
way.

## Keep a field out of the value

`bind` chooses what the `@bind` value holds
([Choose the fields with `bind`](@ref)), and `onchange` still sees
every field. So a threshold that only drives the figure can stay out of the
value that other cells use:

```julia
begin
    img = [sin(i / 6) * cos(j / 9) for i in 1:80, j in 1:120]
    fig2 = Figure(size = (640, 280))
    ax_img = Axis(fig2[1, 1]; aspect = DataAspect())
    heatmap!(ax_img, img; colormap = :grays)
    maskplot = heatmap!(ax_img, img .> 0.5; colormap = [(:red, 0), (:red, 0.5)], colorrange = (0, 1))
    ax_hist = Axis(fig2[1, 2]; xlabel = "value")
    hist!(ax_hist, vec(img))
    cutoff = ThresholdInteractable(ax_hist; orientation = :vertical, value = 0.5)
    nothing
end
```

```julia
@bind mask masque(fig2, (cutoff = cutoff,); bind = :cutoff,
    onchange = state -> (maskplot[1] = img .> state.cutoff.value))
```

Drag the line on the histogram and the red mask follows it. `mask` is the
threshold's `ThresholdEvent` from the last release, so `img .> mask.value`
gives the mask in another cell.

## When something goes wrong

The first run happens inside `masque`, so an error there fails the cell
like any other Julia error. An error later, while the reader works the
widget, keeps the last picture, shows a short note over it, and writes the
full error to the cell's log.

`onchange` needs a running notebook. In a static HTML export the figure
stays as it was last drawn, while clicks, the threshold, and the `@bind`
value still work.

## Where to go next

[Sliders, toggles and menus](@ref) lays out controls the function can
read, and [Label points into classes](@ref) puts the parts together.
