# Annotate a segmentation

Click the objects that a segmentation got wrong to leave them out of a
count. In this clip, the picture has ten objects, and three of them look
like cells stuck together. A click on each one outlines it, and the cell under
the figure lists the objects left out and the mean area of the rest. One
click lands on a good cell by mistake, and Ctrl-Z takes it back.

```@raw html
<video id="masque-segmentation-clip" title="Clicking three objects that are cells stuck together, clicking a round cell by mistake and pressing Ctrl-Z to take it back, while the cell below lists the objects left out, with CairoMakie"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-segmentation-clip");
  if (!el) return;
  el.src = (pretty ? "../../assets/" : "../assets/") + "example-segmentation.mp4";
})();
</script>
```

First, make a picture of bright cells on a dim background:

```julia
begin
    using Random
    Random.seed!(7)   # the same picture every time the notebook runs

    img = [0.15 + 0.1 * (i / 160) + 0.02 * randn() for i in 1:160, j in 1:100]
    for _ in 1:18
        ci, cj, r = rand(8:152), rand(8:92), rand(3.0:0.5:6.0)
        b = 0.45 + 0.4 * rand()
        img .+= [b * exp(-((i - ci)^2 + (j - cj)^2) / (2r^2)) for i in 1:160, j in 1:100]
    end
end
```

Then segment it: number each patch of touching pixels above 0.5. The
background stays `0`. A package such as ImageMorphology does this with
`label_components`; this cell does it by hand to stay short on
dependencies.

```julia
begin
    function label_objects(mask)
        labels = zeros(Int, size(mask))
        n = 0
        for start in CartesianIndices(mask)
            (mask[start] && labels[start] == 0) || continue
            n += 1
            labels[start] = n
            todo = [start]
            while !isempty(todo)
                p = pop!(todo)
                for d in CartesianIndex.(((1, 0), (-1, 0), (0, 1), (0, -1)))
                    q = p + d
                    if checkbounds(Bool, mask, q) && mask[q] && labels[q] == 0
                        labels[q] = n
                        push!(todo, q)
                    end
                end
            end
        end
        return labels, n
    end
    labels, n = label_objects(img .> 0.5)
    areas = [count(==(k), labels) for k in 1:n]
end
```

Show the picture, and make a click pick a whole object:

```julia
begin
    fig = Figure(size = (560, 380))
    ax = Axis(fig[1, 1]; aspect = DataAspect(), title = "click the objects to leave out")
    hidedecorations!(ax)
    hm = heatmap!(ax, img; colormap = :grays)
    nothing
end
```

```julia
@bind sel masque(fig, (objects = interactables(hm; select = :many, regions = labels),))
```

Finally, count what is left:

```julia
let
    out = sort(sel.objects.regions)
    kept = setdiff(1:n, out)
    Base.Text(
        "left out: $(isempty(out) ? "none" : join(out, ", "))\n" *
            (isempty(kept) ? "no objects kept" : "$(length(kept)) of $n objects kept, mean area $(round(Int, sum(areas[kept]) / length(kept))) pixels")
    )
end
```

## How it works

`regions = labels` turns a click on any pixel into a pick of the whole
object that holds it, and hovering over a pixel outlines its object and
names it. `select = :many` makes the picks add up, since you mark several
objects before you count. `sel.objects.regions` lists the ids of the
objects picked, the same numbers as in `labels`, so `areas[k]` and
`labels .== k` reach each one. [Select whole regions](@ref) has the rest.

A wrong click is easy to take back: with the figure focused, Ctrl-Z
(Cmd-Z on a Mac) undoes the last change to the picks, and the next cell
runs again. See [Undo a change](@ref).

## Variations

- Keep the objects you click instead of leaving them out: use
  `sel.objects.regions` as the kept list.
- Show the picture in color by object with `heatmap!(ax, labels)` and a
  categorical colormap, so the reader sees where the segmentation split
  and merged.
- Click with a reason: add a Makie `Menu` of reasons ("merged",
  "debris", "out of focus") and keep a `Dict` from object to reason, as
  [Build a widget](@ref) does for classes.

Next, see [Heatmaps and images](@ref) for more on grids, and
[Threshold a mask](@ref) for choosing a cutoff like the one that made
these objects.
