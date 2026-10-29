# Linked views

Panels that plot the same rows of your data can share one selection, so
a click on a point in one panel selects that row on every panel. Both
panels go in one figure, with one `masque` call.

## Several axes in one figure

One `masque` call covers every axis in a figure, and each plot gets its
own field in the value, so two scatters give `sel.scatter` and
`sel.scatter_2`. To name the fields after your panels, pass the plots
that `scatter!` returned as `bind`:

```julia
@bind sel masque(fig; bind = (xy = p_xy, xz = p_xz))
```

Each panel keeps its own selection: clicking a point in the xy panel
sets `sel.xy` and leaves `sel.xz` as it was. When the panels plot the
same rows of your data, link them so that a click selects the row in
both, as the next section shows.

## Select the same rows on every panel

When two plots draw the same rows, such as one sample per point in an
xy and an xz panel, pass them to [`linked`](@ref). Clicking a point in
either panel selects that row in both, and hovering a point outlines
the same row on the other panel:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-lv-rows" data-masque-embed="linked_rows" title="Two panels of the same four samples. Click a point in either panel to select that sample in both." style="width:100%;height:760px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("linked_rows")
```

`row` is the position of the clicked point in the data you plotted, so
`df[row, :]` is its sample, or `nothing` before the first click. To
pick several rows, pass `select = :many`: each click adds a row or
takes it out, dragging a box over points adds every row inside, and
`rows` is a `Vector` in the order you picked them.

```julia
@bind rows masque(fig; bind = linked(p_xy, p_xz; select = :many))
```

When the panels plot your rows in different orders, or one panel draws
them as one plot per group, give the rows a key. With `key = :id`, a
row is the `id` of a point's payload, and every panel that has a point
with that `id` marks it. Pass an axis to link every plot on it:

```julia
begin
    fig = Figure(size = (640, 300))
    by_group, all_samples = Axis(fig[1, 1]), Axis(fig[1, 2])
    a = scatter!(by_group, [1, 2], [1, 2]; label = "A")
    b = scatter!(by_group, [3, 4], [1, 2]; label = "B")
    s = scatter!(all_samples, [4, 3, 2, 1], [1, 1, 1, 1])
    axislegend(by_group)
    parts = [
        interactables(a; payloads = [(id = "s1",), (id = "s2",)]),
        interactables(b; payloads = [(id = "s3",), (id = "s4",)]),
        interactables(s; payloads = [(id = "s4",), (id = "s3",), (id = "s2",), (id = "s1",)]),
    ]
    nothing
end
```

```julia
@bind w masque(fig, parts..., (samples = linked(by_group, all_samples; key = :id, select = :many),))
```

`w.samples` holds the ids, such as `["s2", "s4"]`, and clicking the
legend entry "A" picks `s1` and `s2` on both panels. To start with rows
selected, pass them as `selected = (samples = ["s1"],)`, by key, or by
position when the group has no key.

## Keep a keyed selection when the figure rebuilds

[Keep a selection when the figure rebuilds](@ref) on the Selection page
stores the name of the selected city and looks up its
position after the rebuild. A `linked` group with `key` saves that
lookup: its value is the name itself, and `selected=`
takes a name. Store the name as it comes:

```julia
if !isnothing(sel.cities)
    last_city[] = sel.cities
end
```

Then pass it back, or `nothing` when the city is no longer in the data:

```julia
start = last_city[] in city_names ? last_city[] : nothing
```

```julia
@bind sel masque(fig, (cities = linked(cities; key = :city),); selected = (cities = start,))
```

## Where to go next

[Use selections in other cells](@ref) uses the selected rows to update
another plot or a table.
