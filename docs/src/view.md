# Pan and orbit

Drag a 2D axis to pan, or an `Axis3` to orbit. Pass
[`ViewInteractable`](@ref) on the axis you want to move. The camera is
not a selection: pan and orbit do not write `@bind`.

The clip shows a pan: the axis limits move.

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
        style="width:100%;height:1100px;border:0;background:transparent;overflow:hidden;"
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

The notebook scatters the points and adds [`ViewInteractable`](@ref).
`masque(fig)` does not add pan. After a pan, `pick` is unchanged.
There is no camera value on the bond.

If a threshold or ROI shares the axis, an ordinary drag moves that
handle. **Shift**+drag pans.

## Preview while you drag

Both backends stream frames over `with_js_link` (live kernel).
CairoMakie ships a PNG. WGLMakie ships a serialized scene onto the
canvas already on the page. For more information, see [Backends](@ref).

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
still commits nothing. For in-drag frames on either backend, see
[Backends](@ref).

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
azimuth/elevation in a `Ref` (or a slider) and rebuild, as on
[Limits slider](@ref). [Drag to pan](@ref) and [Drag to orbit](@ref) are
the drag half: a PNG frame on `:cairo`, a scene frame on `:webgl`. Do
not pass `selected=` for a camera pose.
