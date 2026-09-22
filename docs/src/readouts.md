# Read coordinates

Click anywhere in a 2D axis to read data `(x, y)`. Click a colorbar to
read `value`. Drag a threshold line; on release, Julia gets a
[`ThresholdEvent`](@ref).

**On this site:** overlay-only. For overlay versus `@bind` versus the
docs player, see [Overlay, Julia, and the host](@ref). There is no
highlight in the overlay at the click.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-readouts-player" title="Sine plot with axis coordinate readout overlay"
        style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-readouts-player");
  if (!el) return;
  function isDocDark() {
    var c = document.documentElement.className || "";
    if (!c) return false;
    if (/(^|\s)theme--(documenter-light|catppuccin-latte)(\s|$)/.test(c)) return false;
    return /(^|\s)theme--/.test(c);
  }
  function pushTheme() {
    var doc = el.contentDocument;
    if (!doc) return;
    doc.documentElement.classList.toggle("pluto-dark", isDocDark());
  }
  el.addEventListener("load", pushTheme);
  new MutationObserver(pushTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  el.src = (pretty ? "../embeds/" : "embeds/") + "readouts_axis.html";
})();
</script>
```

Prerequisites: [Install](@ref) and [Getting started](@ref) cells in your
notebook. Heatmap *cells* stay on [Inspect a grid](@ref). This page is
the continuous readout: axis, colorbar, and threshold. If a later demo
on this page also binds `pick`, replace the previous bind cell.

## Read `(x, y)` from the axis

[`AxisInteractable`](@ref) is the whole axis as one hit region.
`masque(fig)` does **not** install it. Pass it yourself:

**1.** Draw a short sine and an `AxisInteractable`:

```julia
begin
    xs = range(0, 2π; length = 80)
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "sin(x)")
    lines!(ax, xs, sin.(xs); color = :steelblue)
    axint = AxisInteractable(ax)
    nothing
end
```

**2.** Bind a click:

```julia
@bind pick masque(fig, axint)
```

After a click, `pick` is an [`AxisEvent`](@ref): `layer` is
`:axis`. Read `pick.x` and `pick.y`. There is no `index`.

The tooltip follows the pointer, not a mark. A click writes the bond.
There is no highlight in the overlay at that location.

Supported scales: `identity`, `log10`, and `log`. Categorical axes work
here. `Makie.pseudolog10` and `Makie.Symlog10` raise `ArgumentError` at
`masque()` time.

`AxisInteractable` on `Axis3` or `PolarAxis` raises `ArgumentError`. Use
scatter or lines on those axes instead. `payloads=` and `tooltip=` on
`AxisInteractable` are a `MethodError`. `selected=` on `:axis` raises
`ArgumentError`.

## Read a colorbar value

Replace the previous `fig` and `@bind pick` cells.

[`ColorbarInteractable`](@ref) is one hit region on the bar's pixel box.
The layer kind is `:axis` with a bbox. Default `id` is `:colorbar`.
`pick` is a [`ColorbarEvent`](@ref). `pick.value` is the data value.
Pass `pick` back as `value=` when a remount should open on that value.

`masque(fig)` **does** install a `Colorbar` block. You can also pass the
colorbar yourself so the heatmap cells are not in the same widget:

**1.** Draw a small heatmap, a `Colorbar`, and a `ColorbarInteractable`:

```julia
begin
    z = [Float64(i + 3j) for i in 1:4, j in 1:3]
    fig = Figure(size = (560, 280))
    ax = Axis(fig[1, 1])
    hm = heatmap!(ax, 1:4, 1:3, z)
    cb = Colorbar(fig[1, 2], hm)
    cbint = ColorbarInteractable(cb)
    nothing
end
```

**2.** Bind a click:

```julia
@bind pick masque(fig, cbint)
```

Click the bar. `pick.value` is the data value under the pointer.
The tooltip follows the pointer (`value=…`). Same invertible scales as
the axis (`identity`, `log10`, `log`).

## Drag a threshold

Replace the previous `fig` and `@bind pick` cells.

[`ThresholdInteractable`](@ref) is a draggable line. `value` is
required (a number or a [`ThresholdEvent`](@ref)). `:horizontal` is a
constant-y line you drag vertically. `:vertical` is a constant-x line
you drag horizontally.

**1.** Draw a scatter and a horizontal threshold:

```julia
begin
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1])
    scatter!(ax, 1:8, [0.2, 0.8, 0.4, 0.9, 0.3, 0.6, 0.1, 0.7]; markersize = 16)
    cutoff = ThresholdInteractable(
        ax;
        orientation = :horizontal,
        value = 0.5,
    )
    nothing
end
```

**2.** Bind the widget:

```julia
@bind pick masque(fig, cutoff)
```

While you drag, the overlay moves the line. After you release the
pointer, `pick` is a [`ThresholdEvent`](@ref): `layer` is `:threshold`,
and `pick.value` is the data coordinate. `pick.y` raises an error; use
`pick.value`. Pass `pick` back as `value=` when some other input
rebuilds the figure.

This is not a slider of the continuum. Release writes one scalar. The
pointer can stop anywhere on the dragged axis.

The dragged axis must be invertible (`identity` / `log10` / `log`).
Categorical axes work. `Axis3` and `PolarAxis` raise `ArgumentError`.

If [`ViewInteractable`](@ref) is on the same axis, an ordinary drag
moves the threshold. **Shift**+drag pans instead. For pan and orbit, see
[Pan and orbit](@ref).
