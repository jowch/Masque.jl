# Filter one plot from another

Pick cars on one plot and see the same cars on another. In this clip,
a box over the heavy, thirsty cars marks them on both panels, and the right
panel shows they are also the most powerful and the quickest. A
Ctrl-click on the "Japan" legend entry adds every Japanese car, and
Ctrl-Z (Cmd-Z on a Mac) takes them back out. The cell under the figure counts the cars
picked and averages them.

```@raw html
<video id="masque-linked-clip" title="Dragging a box over the heavy, thirsty cars on a weight and mpg scatter, which marks the same cars on a horsepower and acceleration scatter, then Ctrl-clicking a legend entry to add the Japanese cars and pressing Ctrl-Z to take them out, with CairoMakie"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:720px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-linked-clip");
  if (!el) return;
  el.src = (pretty ? "../../assets/" : "../assets/") + "example-linked.mp4";
})();
</script>
```

First, make up ninety cars. Each car is a row with an `id`:

```julia
begin
    using Random
    Random.seed!(11)   # the same cars every time the notebook runs

    origins = ["USA", "Europe", "Japan"]
    origin = [rand() < 0.45 ? "USA" : rand(["Europe", "Japan"]) for _ in 1:90]
    base = Dict("USA" => 3500, "Europe" => 2600, "Japan" => 2300)
    weight = [base[o] + 450 * randn() for o in origin]
    hp = 0.04 .* weight .+ 12 .* randn(90)
    mpg = 48 .- 0.0085 .* weight .+ 2.5 .* randn(90)
    accel = 24 .- 0.06 .* hp .+ 1.2 .* randn(90)
    cars = [
        (id = i, origin = origin[i], mpg = round(mpg[i]; digits = 1), hp = round(Int, hp[i]), weight = round(Int, weight[i]))
            for i in 1:90
    ]
end
```

Then draw them twice. The left panel draws one scatter per origin, so
the legend has an entry for each. The right panel draws every car in
one scatter, in a different order. `linked` makes the two axes one
selection, and `key = :id` matches each point to its car by the `id`
in its payload:

```julia
begin
    colors = Dict("USA" => :steelblue, "Europe" => :darkorange, "Japan" => :seagreen)
    fig = Figure(size = (760, 340))
    ax1 = Axis(fig[1, 1]; xlabel = "weight (lb)", ylabel = "mpg", title = "drag a box, or click a legend entry")
    parts = map(origins) do o
        rows = findall(==(o), origin)
        p = scatter!(ax1, weight[rows], mpg[rows]; color = colors[o], label = o, markersize = 9)
        interactables(p; payloads = cars[rows])
    end
    axislegend(ax1; position = :rt)
    ax2 = Axis(fig[1, 2]; xlabel = "horsepower", ylabel = "seconds to 60 mph", title = "the same cars")
    s2 = scatter!(ax2, hp, accel; color = [colors[o] for o in origin], markersize = 9)
    nothing
end
```

```julia
@bind picked masque(fig, parts..., interactables(s2; payloads = cars),
    (picked = linked(ax1, ax2; key = :id, select = :many),); bind = :picked)
```

Finally, filter the cars by the ids picked:

```julia
let
    chosen = [c for c in cars if c.id in picked]
    if isempty(chosen)
        Base.Text("no cars picked")
    else
        mean(f) = round(sum(f, chosen) / length(chosen); digits = 1)
        counts = join(("$(count(c -> c.origin == o, chosen)) $o" for o in origins), ", ")
        Base.Text("$(length(chosen)) cars picked ($counts)\nmean $(mean(c -> c.mpg)) mpg, $(mean(c -> c.hp)) hp")
    end
end
```

## How it works

[`linked`](@ref) takes the two axes, and each axis stands for every
plot on it, so the three scatters on the left and the one on the right
share one selection. Since the panels hold the cars in different
orders and split them differently, `key = :id` says which points are
the same car. Without `key`, a row is a point's position, and every
member must be one plot with the same number of points.

`select = :many` lets the picks add up: a click adds a car or takes it
out, a box adds every car inside it, and a legend entry stands for its
cars, so Ctrl-click (Cmd-click on a Mac) adds them all. A plain click
on an entry picks its cars in place of the others. `bind = :picked`
makes `picked` the group's value: the ids of the cars picked, in the
order you picked them.

Hovering a point outlines the same car on the other panel, so you can
find one car in both views before you pick anything.

## Variations

- Keep the cars in a `DataFrame` and filter it with
  `df[in(picked).(df.id), :]`.
- Link more than two views: a third axis in the same figure joins with
  `linked(ax1, ax2, ax3; …)`.
- With one plot per panel in the same row order, leave out `key`:
  `linked(p1, p2; select = :many)` gives row positions, so `df[picked, :]`
  is the rows picked.

Next, see [Linked views](@ref) for more on `linked`, and
[Compare a cluster](@ref) for a box that feeds a histogram.
