# Explore a 3D figure

On an `Axis3`, the reader hovers a surface to read its height, hovers
or clicks a point to see and keep its data, and drags to turn the view.
The example below is a terrain surface with five weather stations on it.

## Plot on an `Axis3`

Draw the plots as you would without Masque. `masque(fig)` gives each
surface and scatter on an `Axis3` a tooltip and a click, so hovering
the surface below shows the height under the pointer:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-explore-3d" data-masque-embed="explore_3d" title="A terrain surface with five stations. Hover the surface or a station, and click a station." style="width:100%;height:1290px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("explore_3d")
```

## Name the stations

A station is a point in a scatter, so on its own its tooltip shows only
its coordinates. To add its name and height, give the scatter one
payload per station:

```julia
sites = interactables(sc; payloads = [(; name = s.name, height = h) for (s, h) in zip(stations, elevation)])
```

The tooltip lists the payload's fields above the coordinates, and a
click carries them too. [Tooltips](@ref) shows how to choose what the
tooltip says.

## Keep the clicked station

`bind = sc` makes `pick` the station you last clicked, until you click
empty space, so the last cell can read `pick.name` and `pick.height`.
Only the stations take clicks into `pick`: hovering the surface shows
its height, but a click on it does not change `pick`.

## Turn the view

To let the reader turn the plot, add a [`ViewInteractable`](@ref) for
the axis and pass it to the same `masque` call:

```julia
orbit = ViewInteractable(ax)
@bind pick masque(fig, sites, orbit; bind = sc)
```

Dragging then turns the camera, and the stations keep their tooltips and
clicks at every angle. [Pan, zoom and orbit](@ref) has the zoom and pan
controls, and how to turn several panels together with `linkcameras!`.

The example at the top of this page does not turn: each turn has Julia
draw the figure again, and this site has no Julia running behind it
(see [Pan and orbit preview](@ref)). To try turning it, download the
notebook, add the `orbit` line, and pass `orbit` to `masque` as above.

## What it can't do

- A surface responds only on an `Axis3`. On a 2D `Axis`, draw the same
  matrix with `heatmap` to read its values; see [Heatmaps and images](@ref).
- A sphere from `meshscatter` stops responding once its center leaves
  the axis box, even if part of it still shows. Zoom out, or turn the
  view, to bring it back.

## Next

- [Pan, zoom and orbit](@ref) for every way to move the view.
- [Supported plots and axes](@ref) for which 3D plots respond.
- [Selection](@ref) to keep several stations at once.
- The [Filter one plot from another](@ref) and [Compare a cluster](@ref)
  examples, which use the picks on one plot in another.
