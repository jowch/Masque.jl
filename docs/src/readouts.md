# Read coordinates

Click anywhere in a 2D axis to read data `(x, y)`. Click a colorbar to
read `value`. Drag a threshold line; on release, Julia gets a scalar.

This docs embed is overlay-only. Hold the pointer over the plot: the
tooltip follows the pointer with `x=…, y=…`. A click writes the bond in
live Pluto. On this site, Julia stays at the default bond (`nothing`).
The overlay does not highlight a mark at the click.

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

Paste each of the following snippets into its own Pluto cell. Pluto runs
one top-level expression per cell. Wrap multiple statements in
`begin ... end`.

Heatmap *cells* stay on [Inspect a grid](@ref). This page is the
continuous readout: axis, colorbar, and threshold.

## Read `(x, y)` from the axis

[`AxisInteractable`](@ref) is the whole axis as one hit region.
`masque(fig)` does **not** install it. Pass it yourself:

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

```julia
@bind pick masque(fig, axint)
```

After a click, `pick` is an [`InteractionEvent`](@ref): `layer` is
`:axis`, `index` is `-1`, and `payload` is `(; x, y)`. Read
`pick.payload.x` and `pick.payload.y`.

The tooltip follows the pointer, not a mark. A click writes the bond.
The overlay does not add a selected wash at that location.

Supported scales: `identity`, `log10`, and `log`. Categorical axes are
fine here. `Makie.pseudolog10` and `Makie.Symlog10` raise
`ArgumentError` at `masque()` time.

`AxisInteractable` on `Axis3` or `PolarAxis` raises `ArgumentError`. Use
element hits on those axes instead. `payloads=` and `tooltip=` on
`AxisInteractable` are a `MethodError`. `selected=` on `:axis` raises
`ArgumentError`.

## Read a colorbar value

[`ColorbarInteractable`](@ref) is one hit region on the bar's pixel box.
The layer kind is `:axis` with a bbox. Default `id` is `:colorbar`.
Payload is `(; value)`. `index` is `-1`.

`masque(fig)` **does** install a `Colorbar` block. You can also pass the
colorbar yourself so the heatmap cells are not in the same widget:

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

```julia
@bind pick masque(fig, cbint)
```

Click the bar. `pick.payload.value` is the data value under the pointer.
The tooltip follows the pointer (`value=…`). Same invertible scales as
the axis (`identity`, `log10`, `log`).

## Drag a threshold

[`ThresholdInteractable`](@ref) is a draggable line. `value` is
required. `:horizontal` is a constant-y line you drag vertically.
`:vertical` is a constant-x line you drag horizontally.

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

```julia
@bind pick masque(fig, cutoff)
```

While you drag, the overlay moves the line. After you release the
pointer, `pick` is an `InteractionEvent`: `layer` is `:threshold`,
`index` is `0`, and `payload` is a **scalar** (the data coordinate).
There is no field name. `pick.payload.y` raises an error; use
`pick.payload`.

This is not a slider of the continuum. Do not list a dense set of
release values as docs snapshots.

The dragged axis must be invertible (`identity` / `log10` / `log`).
Categorical is fine. `Axis3` and `PolarAxis` raise `ArgumentError`.

If [`ViewInteractable`](@ref) is on the same axis, an ordinary drag
moves the threshold. **Shift**+drag pans instead. For pan and orbit, see
[Pan and orbit](@ref).
