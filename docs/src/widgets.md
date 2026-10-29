# Build a widget

A figure with a few named plots and controls, passed to one `masque`
call, becomes a small tool: the reader clicks, selects and chooses, and
other cells get one value that holds all of it. By the end of this
section you can build one that labels points into classes:

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

Its code is on [Label points into classes](@ref), the last page of this
section, once the pages before it have shown each part.

## Name each part

Name each plot and each control in one named tuple, and the names
become the fields of the value. The example below has two plots:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-widgets-value" data-masque-embed="widgets_value" title="A scatter of samples and a bar chart of batches. Click a point and a bar, and the readout names both." style="width:100%;height:780px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("widgets_value")
```

[What the `@bind` value holds](@ref) lists what each kind of field
holds, and [Choose the fields with `bind`](@ref) shows how to keep a
field out of the value.

## Add each click to the selection

A widget that builds something up, such as a set of labeled points,
needs every click to add to what the reader has already selected
rather than replace it. Pass the plot with `select = :many`, as
[Select several marks](@ref) describes:

```julia
@bind w masque(fig, (pts = interactables(sc; select = :many),))
```

## Put the controls in the figure

A widget often needs a setting next to the plot, such as which class a
click assigns or how strongly to smooth a curve. If the `masque` cell
reads a slider or menu from another cell, changing it runs the `masque`
cell again, and the reader loses the selection. To keep it, lay out
Makie's own `Menu`, `Slider` or `Toggle` in the figure and name it in the
same named tuple:

```julia
class = Menu(fig[2, 1]; options = ["good", "bad", "unsure"])
@bind w masque(fig, (class = class, pts = interactables(sc; select = :many)))
```

`w.class` is then the option chosen, and changing it leaves the selection as
it was. [Sliders, toggles and menus](@ref) lists the controls you can use.

## Where to go next

[Update the figure](@ref) changes the plots each time the reader clicks
or moves a control, without running the cell again. After it,
[Sliders, toggles and menus](@ref) lists the controls, and
[Label points into classes](@ref) builds the widget in the clip above.
