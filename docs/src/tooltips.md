# Tooltips

Hold your pointer over a mark and a customizable tooltip appears on the
figure. Hover stays on the figure; it does not re-run Julia. A click can
still write `@bind`; this page teaches the tooltip. The three-point
scatter on [Getting started](@ref) already templates on pointer hold.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-tt-template" title="Four-city scatter with templated tooltips"
        style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-tt-template");
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
  el.src = (pretty ? "../embeds/" : "embeds/") + "tooltips_template.html";
})();
</script>
```

Hold the pointer over a city. The card shows **Tokyo** and a formatted
population, not a name/value table. The 3px border is that mark's
accent.

## Write a template

Prerequisites: [Install](@ref) and [Getting started](@ref) cells in your
notebook. Pass `tooltip = masque"..."` on the points constructor.
Placeholders read fields from that mark's payload at pointer-hold time.
They do not read Julia locals. Use the points constructor when you need
a template. The Scatter plot-object constructor does not take
`tooltip=` (`MethodError`). Omit `radius=` to hug the one matching
scatter on that axis. The snippet below passes `radius=` so the disc
matches `markersize`.

**1.** Plot four cities and a templated [`PointInteractable`](@ref):

```julia
begin
    xy = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0), (4.0, 16.0)]
    cities = ["Tokyo", "Delhi", "Shanghai", "São Paulo"]
    pops = [37_400_000, 32_900_000, 28_500_000, 22_400_000]
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
    markersize = 20
    scatter!(ax, first.(xy), last.(xy); markersize)
    tips = PointInteractable(
        ax, xy;
        radius = 0.3525 * markersize,
        payloads = [(; city = cities[k], pop = pops[k]) for k in eachindex(cities)],
        tooltip = masque"<b>$(city)</b><br>pop $(pop:,)",
    )
    nothing
end
```

**2.** Mount the overlay:

```julia
@bind pick masque(fig, tips)
```

| Value | Type | Browser behavior |
|---|---|---|
| *(omitted / `nothing`)* | `Nothing` | Auto name/value table from the payload |
| `masque"..."` | `Markup` | Template interpolated against that mark's payload |
| `false` | `Bool` | Tooltip suppressed; the highlight in the overlay still runs |
| `true` | `Bool` | `ArgumentError` — not meaningful |

A legend is the exception to the omitted-`tooltip` row: holding the
pointer over an entry shows no card unless you pass `masque"..."`. See
[Legend](@ref).

`$(field)` is a placeholder resolved in the browser from the payload of
the mark under the pointer. Put derived text in the payload, not in the
template. `masque"$(pop+1)"` is a `TemplateValidationError` at parse.

| Syntax | Meaning |
|---|---|
| `$(field)` | Value of payload field `field`; HTML-escaped |
| `$(field:spec)` | Same, formatted by a [d3-format](https://d3js.org/d3-format) `spec` before escaping |
| `` \$ `` | Literal dollar sign |

For constructors that take `tooltip=`, see [Constructors](@ref). For
card chrome keywords and CSS custom properties, see [Tooltip chrome](@ref).

## Check payload fields

A malformed template (`$(pop+1)`, an unclosed `$(`, an unknown
d3-format type character) is a `TemplateValidationError` the instant
the cell containing `masque"..."` parses.

A syntactically valid field that is not a key in the payload is caught
later, when `masque()` builds the manifest: an `ArgumentError` with a
"did you mean?" suggestion for a close misspelling. This check runs
when any payload in the layer is a `NamedTuple` — against the union of
those field names — and is skipped only when none are (for example
every payload is a `Dict`). Then a missing `$(field)` renders empty at
pointer-hold instead of erroring.

## Match a dark figure

A `Figure(; backgroundcolor = :gray12)` gets a dark tooltip card, from
the figure's background, not from OS `prefers-color-scheme`.

```julia
fig = Figure(size = (560, 360); backgroundcolor = :gray12)
```

Pass the `Scatter` to `PointInteractable` so `color=` becomes the
tooltip accent. The following embed is that dark-figure scatter.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-tt-dark" title="Dark-figure scatter with figure-derived tooltip theme"
        style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-tt-dark");
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
  el.src = (pretty ? "../embeds/" : "embeds/") + "tooltips_dark.html";
})();
</script>
```

Hold the pointer over a mark. The card is dark because the figure is
`gray12`, even when this docs page is light. Setting Pluto or the OS
to dark does not darken a white figure's tooltip.

The tooltip's light/dark theme comes from the **figure's** background
(`manifest.background` → `--masque-fig-bg`, CSS relative-color
syntax). OS `prefers-color-scheme` is the fallback for browsers without
`lch(from …)`. `masque` writes an opaque figure background while it
builds the overlay, then restores `fig.scene.backgroundcolor[]`.

## Accent color

When Masque can resolve the color of the mark under the pointer into
`layer.colors`, the tooltip gets a 3px accent border in that color.
Tooltip **text stays neutral**. Accent is the border, not the overlay
highlight.

`layer.colors` is filled from `scatter!`'s `color=` when you pass the
`Scatter` to `PointInteractable`, from the points constructor's
`colors=` keyword, or from a legend entry's element color. The accent
is omitted when the color cannot be resolved.

## Placement

The tooltip sits above the mark under the pointer, not on the cursor,
except on axis, threshold, ROI, and view, where it follows the pointer.
On a line it slides to the nearest point on the path (`lines!` /
`series!` included). Keyboard focus uses the segment midpoint, or the
point halfway along a whole line. It flips below if it would clip the
top edge, and shifts if it would clip a side. For card chrome keywords
and CSS custom properties, see [Tooltip chrome](@ref).
