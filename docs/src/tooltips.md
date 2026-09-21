# Tooltips

Holding the pointer over a mark shows a tooltip in the overlay. That path
never writes `@bind` and never re-runs a Julia cell. A click can still
write the bond; this page teaches the tooltip. The eight-city scatter on
[Getting started](@ref) already templates on pointer hold. The embeds
here are overlay-only: holding the pointer over a mark shows the tooltip;
Julia stays at the default bond.

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
accent. Clicking a city does not swap a Julia cell on this page.

## Write a template

`tooltip` is accepted by
[`PointInteractable`](@ref),
[`SegmentInteractable`](@ref),
[`RectInteractable`](@ref) (list and grid),
[`PolygonInteractable`](@ref),
[`TextInteractable`](@ref),
[`RegionInteractable`](@ref),
and [`LegendInteractable`](@ref). Passing it to
[`AxisInteractable`](@ref),
[`ColorbarInteractable`](@ref),
[`ThresholdInteractable`](@ref),
[`ROIInteractable`](@ref),
or [`ViewInteractable`](@ref) is a `MethodError`.
[`FunctionInteractable`](@ref) has no `tooltip=` keyword; override
`Masque.tooltip_spec` for that type.

Plot-object constructors that take `payloads` still do not take
`tooltip=` except [`TextInteractable`](@ref).
`PointInteractable(ax, p::Makie.Scatter; tooltip = masque"…")` is a
`MethodError`. Use the points constructor plus `radius=` when you need
a template, as in the embed. For constructor signatures, see
[Constructors](@ref).

| Value | Type | Browser behavior |
|---|---|---|
| *(omitted / `nothing`)* | `Nothing` | Auto name/value table from the payload |
| `masque"..."` | `Markup` | Template interpolated against the hovered element's payload |
| `false` | `Bool` | Tooltip suppressed; the hover highlight still runs |
| `true` | `Bool` | `ArgumentError` — not meaningful |

Omit `tooltip` or pass `nothing` for the auto-table, with three
exceptions:

- `:grid` (heatmap / image) shows `(i,j)` or `(i,j) = value`, never a
  table of payload fields.
- `:axis` shows `x=…, y=…` on an axis, or the formatted colorbar
  `value`.
- A legend entry defaults to `masque"$(label)"`, not a table. Pass your
  own `masque"..."` (fields: `label`, `group`, `targets`) or
  `tooltip = false`. See [Legend](@ref).

`tooltip = false` hides the card and leaves the overlay highlight
running. `tooltip = true` raises `ArgumentError` at interactable
construction.

`masque"..."` is a string macro (exported; the underlying macro is
`@masque_str`) that produces a `Markup` value:

```julia
tooltip = masque"<b>$(city)</b><br>pop $(pop:,)"
```

`$(field)` is a placeholder resolved in the browser from the hovered
element's payload at pointer-hold time. It does not read a Julia
variable. There is no Julia-object interpolation in templates.
`masque"$(city)"` where `city` is a local and the payload has no
`:city` field is a missing-field error (or an empty card; see
[Check payload fields](@ref)). Put derived text in the payload:

```julia
begin
    payloads = [(; city, pop, label = "$(city): $(pop) residents") for (city, pop) in data]
    tooltip = masque"$(label)"
end
```

| Syntax | Meaning |
|---|---|
| `$(field)` | Value of payload field `field`; HTML-escaped |
| `$(field:spec)` | Same, formatted by a [d3-format](https://d3js.org/d3-format) `spec` before escaping |
| `` \$ `` | Literal dollar sign |

A fixed label with no placeholders is a template with no `$()` at all:
`masque"<em>static label</em>"`. Literal (non-`$()`) portions are raw
HTML — escape `<` and `&` in literal text, same as `@htl`.
`$(field)` interpolation and the auto-table are always HTML-escaped.

Because `masque"..."` requires a string literal, a runtime-computed
string must travel as a field inside the payload.

`masque"$(pop+1)"` is a `TemplateValidationError` at parse — before
`masque()` runs. Compute derived values in the payload, not in the
template.

## Check payload fields

Two checks catch typos at different times.

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

The tooltip's light/dark theme comes from the **figure's** background
(`manifest.background` → `--masque-fig-bg`, CSS relative-color
syntax), not from OS `prefers-color-scheme`. A
`Figure(; backgroundcolor = :gray12)` on a light Pluto page gets a
dark card. A default white figure on a dark OS gets a light card. The
tooltip matches the plot it is attached to.

OS `prefers-color-scheme` is the fallback for browsers without
`lch(from …)` (older than about 2023): a static light tooltip, dark
only with that OS signal.

`masque` writes an opaque figure background while it builds the overlay,
then restores `fig.scene.backgroundcolor[]`. The figure you passed in is
not left mutated.

The `tooltip_*` keywords on `masque` pin card chrome and opt that
property out of inversion. They are not the dark-figure mechanism.
`tooltip_bg = :black` on a light figure is a pin, not "dark mode."

Documenter dark and figure dark are different. This site toggles only
`html.pluto-dark` on the player iframe (Pluto cell chrome). The PNG
keeps the figure's own background. Do not restyle overlay SVGs with
Documenter CSS.

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
to dark does not darken a white figure's tooltip. The Scatter
constructor resolves `color=` into `layer.colors`, so the accent
border matches each mark.

## Accent color

When Masque can resolve the hovered element's color into
`layer.colors`, the tooltip gets a 3px accent border in that color.
Tooltip **text stays neutral**. Accent is the border, not the overlay
highlight. Highlight in the overlay is a separate recipe; `color=` on
`scatter!` does not change it.

`layer.colors` is filled from:

- `scatter!`'s `color=` when you pass the `Scatter` to
  `PointInteractable` (uniform or colormapped)
- the points constructor's `colors=` keyword (a CSS string, or
  `(; palette, index)`)
- a legend entry's element color (`LineElement` line color,
  `MarkerElement` marker color, `PolyElement` poly color)

Nothing to opt into. The accent is omitted (a plain 1px border, same
as the other three sides) when the color cannot be resolved.

## Pin card chrome

Set any of these on `masque` to lock that property (and opt it out of
dark-mode inversion):

```julia
masque(fig, interactables...;
    tooltip_bg        = nothing,   # background  — CSS string or Makie color
    tooltip_color     = nothing,   # text color  — CSS string or Makie color
    tooltip_accent    = nothing,   # accent (emphasis / links)
    tooltip_font      = nothing,   # font-family — String
    tooltip_font_size = nothing,   # Real → appended with "px"
    tooltip_radius    = nothing,   # Real → appended with "px"
    tooltip_caret     = true,      # Bool — draw the caret toward the mark
)
```

`nothing` (the default for every keyword except `tooltip_caret`) means
use the built-in default. Only the keywords you set change anything.

## CSS custom properties

The `--masque-tip-*` custom properties inherit like any CSS custom
property. Setting one on an ancestor of the cell overrides it with no
Julia API:

```html
<style>
main { --masque-tip-bg: #1a1a2e; --masque-tip-color: #e0e0e0; }
</style>
```

A few properties are CSS-only — no Julia keyword sets them.
`--masque-tip-bg` / `--masque-tip-color` / `--masque-tip-border` have
no one fixed light/dark pair of defaults: they are derived from the
figure's background unless you set them here or with a `tooltip_*`
keyword. The "Legacy fallback" column is what a browser without CSS
relative-color syntax uses instead (static light; dark only from OS
`prefers-color-scheme`):

| Custom property | Legacy fallback (light / dark) | Julia keyword |
|---|---|---|
| `--masque-tip-bg` | `#ffffff` / `#1e1e1e` | `tooltip_bg` |
| `--masque-tip-color` | `#1a1a1a` / `#e8e8e8` | `tooltip_color` |
| `--masque-tip-border` | `rgba(0,0,0,0.1)` / `rgba(255,255,255,0.15)` | — (CSS only) |
| `--masque-tip-accent` | `#6b7280` | `tooltip_accent` |
| `--masque-tip-font` | `system-ui, -apple-system, sans-serif` | `tooltip_font` |
| `--masque-tip-font-size` | `11px` | `tooltip_font_size` |
| `--masque-tip-radius` | `4px` | `tooltip_radius` |
| `--masque-tip-caret` | `block` (the caret's `display`) | `tooltip_caret` (`false` → `none`) |
| `--masque-tip-padding` | `8px 12px` | — (CSS only) |
| `--masque-tip-shadow` | `0 2px 4px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)` / `0 2px 4px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.3)` | — (CSS only) |
| `--masque-tip-maxwidth` | `320px` | — (CSS only) |
| `--masque-mark-border` | *(unset — plain 1px border)* | — (from the hovered element's `colors`; see [Accent color](@ref)) |

## Placement

The tooltip is anchored to the hovered **mark**, not the cursor, except
on axis, threshold, ROI, and view (continuous / drag kinds with no
discrete mark), where it follows the pointer.

The anchor depends on the kind:

- Circles: the marker's center; the card sits off the top edge with a
  gap.
- Rects (bars): the bar's top-center.
- Segments and polylines: the point on the segment nearest the pointer
  — the tooltip slides along the line as the pointer moves. Keyboard
  focus (no pointer) uses the segment's midpoint.
- Polygons: the centroid, if it lies inside the polygon; otherwise the
  pointer.
- Grid cells (heatmaps): the cell's center; the card sits off the
  cell's top edge.
- Axis, threshold, ROI, and view: the pointer position.

If the card would clip the surface's top edge, it flips to the other
side of the mark. If it would clip a side, it shifts to stay inside
the surface and the caret moves with it, so the caret still points at
the anchor when the card is not centered on the mark.

When `tooltip_caret = true` (the default), a small triangle points from
the card toward that anchor. For mark-anchored kinds the caret sits on
the edge of the card that faces the mark. For cursor-following kinds
the caret keeps a pointer-relative offset and clamps at the surface
edge.
