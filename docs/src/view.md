# Pan and orbit

Drag a 2D axis to pan, or an `Axis3` to orbit. The camera is operational
state, not analysis data. [`ViewInteractable`](@ref) **commits
nothing**. The bond never carries a `:view` event.

**On this site:** GIF/MP4 plus overlay-only. For overlay versus `@bind`
versus the docs player, see [Overlay, Julia, and the host](@ref). The
following clip is cairo in-drag frames: the axis limits move; `@bind`
does not.

```@raw html
<video id="masque-view-clip" title="CairoMakie in-drag pan frames on a 2D scatter"
       controls muted loop playsinline autoplay
       style="width:100%;max-width:640px;height:auto;border:0;background:transparent;"></video>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-view-clip");
  if (!el) return;
  el.src = (pretty ? "../assets/" : "assets/") + "view-pan.mp4";
})();
</script>
```

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-view-player" title="2D scatter with overlay pan"
        style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-view-player");
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
  el.src = (pretty ? "../embeds/" : "embeds/") + "view_pan.html";
})();
</script>
```

Prerequisites: [Install](@ref) and [Getting started](@ref) cells in your
notebook. `masque(fig)` does not install `ViewInteractable`. Pass it
yourself.

## Pan a 2D axis

**1.** Draw a scatter and pass [`ViewInteractable`](@ref):

```julia
begin
    xs = Float64[1, 2, 3, 4, 5, 6]
    ys = Float64[1, 4, 9, 16, 25, 36]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
    scatter!(ax, xs, ys; color = :dodgerblue, markersize = 18)
    v = ViewInteractable(ax)
    nothing
end
```

**2.** Mount the overlay. Do not `@bind` a camera pose:

```julia
masque(fig, v)
```

You can still `@bind pick masque(fig, v)`. After a pan, `pick` is
unchanged (`nothing` unless some other layer committed). There is no
camera NamedTuple on the bond.

If a threshold or ROI shares the axis, an ordinary drag moves that
handle. **Shift**+drag pans.

## Preview while you drag

CairoMakie streams PNG frames over `with_js_link` (live kernel).
WGLMakie shows a numeric readout only. For more information, see
[Backends](@ref).

## Orbit an `Axis3`

Replace the previous `fig` cell.

`ViewInteractable` on `Axis3` is allowed. Drag orbits azimuth and
elevation. Masque does not reject a 3D axis for this gesture. It still
commits nothing.

```julia
begin
    fig = Figure(size = (560, 360))
    ax = Axis3(fig[1, 1])
    scatter!(
        ax,
        Makie.Point3f[(1, 2, 3), (4, 5, 6), (7, 8, 2)];
        markersize = 16,
    )
    v = ViewInteractable(ax)
    nothing
end
```

A static `Axis3` on CairoMakie is a valid 3D plot. Orbit through Masque
still commits nothing. For cairo frames versus a WGLMakie numeric
readout, see [Backends](@ref).

## What does not pan

The following raise `ArgumentError` at `masque()` time:

- `PolarAxis`
- a `Colorbar`
- a categorical 2D axis
- a 2D axis whose scale is not `identity`, `log10`, or `log`

`LScene`: CairoMakie refuses the figure. WGLMakie renders with **no**
overlay. For more information, see [Troubleshooting](@ref).

## Persist a view across remount

A fresh `Figure` resets the camera. Persist limits or
azimuth/elevation in a `Ref` (or a slider) and rebuild, as in
[`examples/view_manip.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/view_manip.jl)
(slider remount versus drag). The WGLMakie cousin
[`examples/view_manip_webgl.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/view_manip_webgl.jl)
shows the numeric readout with no repaint. Do not pass `selected=` for
a camera pose.
