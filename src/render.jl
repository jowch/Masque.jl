# c can be a CSS string or any Makie-convertible color.
function _css_color(c)
    c isa AbstractString && return c
    rgba = Makie.RGBAf(Makie.to_color(c))
    r, g, b = round(Int, 255 * rgba.r), round(Int, 255 * rgba.g), round(Int, 255 * rgba.b)
    return rgba.alpha >= 1 ? "rgb($r,$g,$b)" : "rgba($r,$g,$b,$(round(rgba.alpha; digits = 3)))"
end

# Only set kwargs are emitted; unset ones fall through to the overlay's built-in defaults.
function tip_style_dict(;
        tooltip_bg = nothing, tooltip_color = nothing, tooltip_accent = nothing,
        tooltip_font = nothing, tooltip_font_size = nothing, tooltip_radius = nothing,
        tooltip_caret = true,
    )
    d = Dict{String, String}()
    tooltip_bg === nothing || (d["--masque-tip-bg"] = _css_color(tooltip_bg))
    tooltip_color === nothing || (d["--masque-tip-color"] = _css_color(tooltip_color))
    tooltip_accent === nothing || (d["--masque-tip-accent"] = _css_color(tooltip_accent))
    tooltip_font === nothing || (d["--masque-tip-font"] = String(tooltip_font))
    tooltip_font_size === nothing || (d["--masque-tip-font-size"] = "$(tooltip_font_size)px")
    tooltip_radius === nothing || (d["--masque-tip-radius"] = "$(tooltip_radius)px")
    tooltip_caret === false && (d["--masque-tip-caret"] = "none")
    return d
end

# union of NamedTuple field names across a payload vector (empty if none are NamedTuples)
function _payload_keys(payloads)
    ks = Set{Symbol}()
    for pl in payloads
        pl isa NamedTuple && union!(ks, keys(pl))
    end
    return ks
end

function _layer_dict(i, L::HitLayer, ctx::InteractionContext)
    hs = hoverstyle(i)
    style = Dict{String, Any}("width" => hs.width)
    hs.stroke === nothing || (style["stroke"] = hs.stroke)
    d = Dict{String, Any}(
        "id" => string(L.id), "kind" => string(L.kind), "axis" => string(L.axis),
        "geometry" => L.geometry, "payloads" => L.payloads,
        "events" => [string(e) for e in L.events],
        "style" => style,
    )
    if L.kind === :segments || L.kind === :polyline
        t = hit_tol(i)
        t === nothing || (d["tol"] = round(Int, t * ctx.scaling))
    end
    s = selects(i)
    s === nothing || (d["selects"] = string(s))
    L.label === nothing || (d["label"] = L.label)
    if L.colors !== nothing
        d["colors"] = L.colors isa AbstractString ? L.colors : Dict("palette" => L.colors.palette, "index" => L.colors.index)
    end
    L.links === nothing || (d["links"] = [[string(id) for id in ids] for ids in L.links])
    spec = tooltip_spec(i)
    spec === true && throw(ArgumentError("tooltip = true is not meaningful — omit `tooltip` for the auto name/value table (the default), pass masque\"…\" for a template, or `false` to suppress."))
    if spec isa Markup
        ks = _payload_keys(L.payloads)
        isempty(ks) || check_fields(spec, ks)      # build-time field check (skip if no NamedTuple payloads)
        d["template"] = markup_segments(spec)
    elseif spec === false
        d["tooltip"] = false
    end
    return d
end

# One `selects` target for the widget. Several selectors must name that same layer.
function _selection_spec(interactables, layers)
    targets = Symbol[]
    for i in interactables
        s = selects(i)
        s === nothing && continue
        push!(targets, s)
    end
    isempty(targets) && return nothing
    uniq = unique(targets)
    length(uniq) == 1 || throw(
        ArgumentError(
            "masque: multiple selectors must share one target; got $(join(string.(uniq), ", "))",
        ),
    )
    target = only(uniq)
    kinds = Dict(Symbol(l["id"]) => Symbol(l["kind"]) for l in layers)
    kind = kinds[target]
    return (mode = kind === :grid ? "grid" : "elements", target = target)
end

# Fail loud when a selector's `selects` target is absent or has an incompatible kind.
function _validate_selectors(interactables, layers)
    kinds = Dict(l["id"] => l["kind"] for l in layers)
    layer_ids = Set(Symbol(l["id"]) for l in layers)
    for i in interactables
        s = selects(i)
        s === nothing && continue
        prefix = string(nameof(typeof(i)))
        if !haskey(kinds, string(s))
            sug = _suggest(s, layer_ids)
            hint = sug === nothing ? "" : " Did you mean `:$sug`?"
            throw(
                ArgumentError(
                    "$prefix: `selects = :$s` names a layer not present in this masque() call.$hint" *
                        " (available: $(join(sort(string.(collect(layer_ids))), ", ")))",
                ),
            )
        end
        target_kind = Symbol(kinds[string(s)])
        if !(target_kind in compatible_kinds(i))
            throw(
                ArgumentError(
                    "$prefix: `selects = :$s` targets a `:$target_kind` layer, " *
                        "but $prefix only supports $(compatible_kinds(i)).",
                ),
            )
        end
    end
    return
end

# Whether a bad `links` target on this interactable's layer(s) should warn-and-drop rather than
# raise `ArgumentError` — true only for a `LegendInteractable` whose links came from the
# plotmap/empty fallback (the auto path), not a user-given `targets=`. Every other interactable
# either doesn't emit `links` at all, or (a future one that does) defaults to strict.
_links_lenient(::AbstractInteractable) = false
_links_lenient(i::LegendInteractable) = i.lenient

# An unknown `links` id (absent from the manifest entirely) always fails loud, in both modes —
# it's not a "can't highlight this" shape, it's a typo/dangling reference. Only an id that
# resolves to a layer whose KIND can't be pre-highlighted is lenient-mode-dependent: fail loud
# by default, or (for a lenient/auto-resolved layer) warn and drop.
function _validate_links(layer_owners, layers)
    kinds = Dict(l["id"] => Symbol(l["kind"]) for l in layers)
    for (owner, d) in zip(layer_owners, layers)
        haskey(d, "links") || continue
        lenient = _links_lenient(owner)
        d["links"] = map(enumerate(d["links"])) do (k, ids)
            kept = String[]
            dropped = false
            for tid_str in ids
                tid = Symbol(tid_str)
                if !haskey(kinds, tid_str)
                    throw(ArgumentError("links: layer :$(d["id"]) element $k links to unknown layer :$(tid)"))
                end
                tk = kinds[tid_str]
                if tk in _SELECTED_KINDS
                    push!(kept, tid_str)
                elseif lenient
                    @warn "masque: legend entry $k of layer :$(d["id"]) links to :$(tid) (kind :$(tk)), " *
                        "which cannot be highlighted (supported: $(join(_SELECTED_KINDS, ", "))); dropping" maxlog = 16
                    dropped = true
                else
                    throw(
                        ArgumentError(
                            "links: layer :$(d["id"]) element $k links to :$(tid) (kind :$(tk)), which cannot " *
                                "be highlighted (supported: $(join(_SELECTED_KINDS, ", ")))",
                        ),
                    )
                end
            end
            # Keep the payload's own `targets` list (shown in the tooltip) in sync with what
            # actually got kept — otherwise a dropped id lingers in the payload while the
            # highlight itself silently drops it, and the two disagree.
            if dropped && haskey(d, "payloads") && k <= length(d["payloads"])
                pl = d["payloads"][k]
                if pl isa NamedTuple && haskey(pl, :targets)
                    d["payloads"][k] = merge(pl, (; targets = kept))
                end
            end
            return kept
        end
    end
    return nothing
end

_transform_dict(t::AxisTransform) = Dict{String, Any}(
    "xlims" => collect(t.xlims), "ylims" => collect(t.ylims),
    "xscale" => string(t.xscale), "yscale" => string(t.yscale),
    "viewport" => collect(t.viewport), "xreversed" => t.xreversed, "yreversed" => t.yreversed,
    "xcats" => t.xcats, "ycats" => t.ycats,
    "valueaxis" => t.valueaxis === nothing ? nothing : string(t.valueaxis),
    "is3d" => t.is3d,
    "ispolar" => t.ispolar,
)

"""
    build_manifest(interactables, ctx; selected) -> Dict

Validate every interactable (fail loud) and assemble the JS-facing manifest. Pure — the unit
tests call this directly; the Pluto-only `published_to_js` step happens later in `show`.

`selected` seeds the selection, 1-based. Accepted forms: `nothing`; one event or a vector of
them; an `Int` or a vector of `Int`s when exactly one layer can be seeded; a `NamedTuple` or
`Dict` keyed by layer id. Indices are stored 0-based on each layer's `"selected"` array. Each
layer carries a `"bond"` stamp. A `selects` ROI stamps `"selection"` and `"selectionTarget"`.

`owners_out`, when a `Ref`, receives `layer id => LayerOwner` for the widget. It is not part of
the published manifest.
"""
function build_manifest(
        interactables, ctx::InteractionContext;
        selected = nothing, tip_style = nothing, background = nothing, owners_out = nothing,
    )
    built = Tuple{Any, HitLayer, Dict{String, Any}}[]
    for i in interactables
        msg = validate(i, ctx)
        msg === nothing || throw(ArgumentError(msg))
        for L in hitlayers(i, ctx)
            push!(built, (i, L, _layer_dict(i, L, ctx)))
        end
    end
    layers = Any[d for (_, _, d) in built]
    layer_owners = Any[i for (i, _, _) in built]
    _validate_selectors(interactables, layers)
    _validate_links(layer_owners, layers)
    spec = _selection_spec(interactables, layers)
    layer_ids = Symbol[L.id for (_, L, _) in built]
    seedable = Symbol[L.id for (_, L, _) in built if L.kind in _SELECTED_KINDS]
    norm = normalize_selected(layer_ids, seedable, selected)
    for id in keys(norm)
        id in layer_ids || throw(
            ArgumentError(
                "selected: :$id is not a layer in this masque() call " *
                    "(available: $(join(sort(string.(layer_ids)), ", ")))",
            ),
        )
    end
    for (i, L, d) in built
        idxs = get(norm, L.id, nothing)
        if idxs !== nothing && !isempty(idxs)
            d["selected"] = _check_selected(L, idxs)
        end
        d["bond"] = bond_stamp(i, L)
    end
    # Precedence for the frontend's first-match-in-manifest-order `hitTest` (geometry.ts):
    # `LegendInteractable` layers sort FIRST (a legend drawn over plot geometry must win the
    # pixels under it, or it's unhoverable), `:view` layers sort LAST (catch-all viewport hits
    # go after Tier-0 threshold/ROI so an ordinary drag wins without a modifier — Shift+drag
    # still forces view in overlay.ts), everything else keeps its original relative order.
    # `layers`/`layer_owners` are parallel; one stable sortperm keeps them aligned.
    rank = [
        layer_owners[k] isa LegendInteractable ? 0 : (layers[k]["kind"] == "view" ? 2 : 1)
            for k in eachindex(layers)
    ]
    perm = sortperm(rank; alg = Base.Sort.DEFAULT_STABLE)
    permute!(layers, perm)
    permute!(layer_owners, perm)
    m = Dict{String, Any}(
        "width" => ctx.width, "height" => ctx.height, "scaling" => ctx.scaling,
        "layers" => layers,
        "transforms" => Dict(string(id) => _transform_dict(t) for (id, t) in ctx.transforms),
    )
    if spec !== nothing
        m["selection"] = spec.mode
        m["selectionTarget"] = string(spec.target)
        if spec.mode == "elements" && explicit_empty_seed(selected)
            m["hydrate"] = "items"
        end
    end
    (tip_style === nothing || isempty(tip_style)) || (m["tipStyle"] = tip_style)
    background === nothing || (m["background"] = _css_color(background))
    if owners_out !== nothing
        owners = Dict{String, LayerOwner}()
        for (i, L, _) in built
            owners[string(L.id)] = LayerOwner(i, L)
        end
        owners_out[] = owners
    end
    return m
end

struct MasqueWidget
    b64::String
    manifest::Dict{String, Any}
    display_css::Int
    # Gesture-channel (#102) per-frame callback, `:cairo` only — `nothing` when the widget has
    # no `ViewInteractable` to drive, or on `:webgl` (no settled live-preview mechanism yet;
    # docs/dev/architecture/12-gesture-channel.md §12.10). Defaulted below so every existing
    # 3-arg and 4-arg call site keeps working.
    render_frame::Union{Nothing, Function}
    # Layer id → owner. Not published. Empty for hand-built test widgets; built-in bonds then
    # use the layer's `"bond"` stamp.
    owners::Dict{String, LayerOwner}
end
MasqueWidget(b64, manifest, display_css) = MasqueWidget(b64, manifest, display_css, nothing, Dict{String, LayerOwner}())
function MasqueWidget(b64, manifest, display_css, render_frame)
    return MasqueWidget(b64, manifest, display_css, render_frame, Dict{String, LayerOwner}())
end
function with_owners(w::MasqueWidget, owners::Dict{String, LayerOwner})
    return MasqueWidget(w.b64, w.manifest, w.display_css, w.render_frame, owners)
end

# Backend choice follows which package extension is loaded, never sniffed from Makie's global
# `current_backend()` state. `explicit` is the caller's `backend=` override.
function _resolve_backend(explicit; max_width)
    cairo_ext = Base.get_extension(@__MODULE__, :MasqueCairoMakieExt)
    wgl_ext = Base.get_extension(@__MODULE__, :MasqueWGLMakieExt)
    explicit !== nothing && return explicit
    # Both loaded: prefer Cairo so a preloaded WGLMakie doesn't block the default static path.
    cairo_ext !== nothing && return cairo_ext.CairoBackend(; max_width)
    wgl_ext !== nothing && return wgl_ext.WebGLBackend(; max_width)
    throw(
        ArgumentError(
            "masque(fig) needs a rendering backend loaded: `using CairoMakie` for a static base, or " *
                "`using WGLMakie` for animation/large or frequently re-rendered data — then call " *
                "`masque` again. (Both expose the same interactions, `Axis3` included; the choice " *
                "is a cost profile.)",
        ),
    )
end

"""
    masque(fig, interactables; kwargs...) -> MasqueWidget
    masque(fig, interactable; kwargs...)    # single-interactable convenience

Overlay `fig` with JS hit-testing and return a Pluto `@bind` source. `fig` is not mutated.

The bond is `nothing` until the first commit, unless `selected=` restored one. A click is one
[`InteractionEvent`](@ref). A `selects` [`ROIInteractable`](@ref) aimed at points makes every
element commit a `Vector{ElementEvent}` (a click is a one-element vector; an empty box is
`ElementEvent[]`). Aimed at a grid, the brush is one [`GridWindowEvent`](@ref).

# Keywords
- `selected` — the selection's starting value, 1-based. One index on a point layer mounts as
  that [`ElementEvent`](@ref); `1` and `[1]` are the same. Several indices highlight those marks
  and leave the bond `nothing` (a point layer holds one event). On a `selects` point brush, `1`
  and `[1]` mount as a one-element vector, and `[]` mounts as `ElementEvent[]`. Also accepts the
  event itself, or a `NamedTuple` / `Dict` keyed by layer id when the figure has more than one
  seedable layer. A bare index is an `ArgumentError` in that case. Works on
  `:circles`/`:rects`/`:polygons`/`:segments`/`:polyline`; any other kind, or an out-of-range
  index (`0` included), raises `ArgumentError` naming `1:n`. Clicking replaces the selection, so
  this is only needed to carry one through a rebuild — and it must come from a cell that doesn't
  read this widget's own bond, which Pluto rejects as a cyclic reference.
- `backend` — `CairoBackend()` (static image) or `WebGLBackend()` (live canvas), each with its
  own keywords. Defaults to whichever of `CairoMakie` / `WGLMakie` is loaded, Cairo if both,
  `ArgumentError` if neither.
- `max_width` — target display width in px (Pluto's column). Default `700`.
- `tooltip_bg`, `tooltip_color`, `tooltip_accent`, `tooltip_font`, `tooltip_font_size`,
  `tooltip_radius`, `tooltip_caret` — tooltip card styling; each defaults to the built-in
  style. See the Tooltips page for the full system, including the `--masque-tip-*` CSS
  escape hatch.

# Examples
```julia
using Masque, CairoMakie
fig = Figure(); ax = Axis(fig[1, 1])
pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]
scatter!(ax, first.(pts), last.(pts))
@bind sel masque(fig, [PointInteractable(ax, pts; payloads = ["a", "b", "c"])])
```
"""
function masque(
        fig, interactables::AbstractVector; backend::Union{Nothing, AbstractBackend} = nothing,
        max_width = 700, selected = nothing,
        tooltip_bg = nothing, tooltip_color = nothing, tooltip_accent = nothing,
        tooltip_font = nothing, tooltip_font_size = nothing, tooltip_radius = nothing, tooltip_caret = true,
    )
    backend = _resolve_backend(backend; max_width)
    bg0 = fig.scene.backgroundcolor[]
    try
        fig.scene.backgroundcolor[] = RGBAf(Makie.red(bg0), Makie.green(bg0), Makie.blue(bg0), 1)
        _finalize!(fig)        # finalize once; render + context share it
        ppu = _ppu(backend, fig)
        ctx = context(backend, fig, ppu)
        tip_style = tip_style_dict(;
            tooltip_bg, tooltip_color, tooltip_accent, tooltip_font, tooltip_font_size, tooltip_radius, tooltip_caret,
        )
        owners_out = Ref(Dict{String, LayerOwner}())
        manifest = build_manifest(
            interactables, ctx; selected, tip_style,
            background = fig.scene.backgroundcolor[], owners_out,
        )
        result = render(backend, fig, ppu)
        display_css = round(Int, min(size(fig.scene)[1], backend.max_width))
        w = make_widget(backend, result, manifest, display_css, fig, interactables, ppu)
        return with_owners(w, owners_out[])
    finally
        fig.scene.backgroundcolor[] = bg0
    end
end
masque(fig, i::AbstractInteractable; kwargs...) = masque(fig, [i]; kwargs...)

"""
    masque(fig; selected=nothing)

Auto-extract interactables from `fig` (see [`auto_interactables`](@ref)) and overlay them —
the zero-config path. Equivalent to `masque(fig, auto_interactables(fig))`; unsupported plot
types are skipped with a warning. For control over ids/payloads, build the vector yourself.
"""
function masque(fig; kwargs...)
    # Finalize layout before auto-extraction: introspection reads post-layout axis state
    # (e.g. `ax.finallimits[]`), which `masque(fig, ints)` only finalizes afterward.
    _finalize!(fig)
    ints = auto_interactables(fig)
    isempty(ints) && @warn "masque(fig): no introspectable plots found — overlaying nothing (static image only)"
    return masque(fig, ints; kwargs...)
end

# Builds the gesture channel's per-frame callback for a `ViewInteractable`-carrying widget
# (`:cairo` only, #102): mutate the dragged axis's camera, rebuild the manifest, re-render, and
# hand back `{png, manifest}` — frame always, manifest whenever the camera moved (always, for a
# view gesture specifically; §12.4/§12.5). `nothing` when `interactables` has no
# `ViewInteractable`, so no in-drag frame can ever be requested and building the closure (and
# paying `with_js_link`'s per-cell bookkeeping) would be pure cost.
function _view_render_frame(backend::AbstractBackend, fig, interactables, ppu)
    view_axes = Dict{Symbol, Any}(i.id => i.ax for i in interactables if i isa ViewInteractable)
    isempty(view_axes) && return nothing
    return function (input)
        id = Symbol(input["id"])
        ax = get(view_axes, id, nothing)
        ax === nothing && throw(
            ArgumentError("Masque gesture channel: no ViewInteractable with id :$(id) on this widget"),
        )
        if haskey(input, "azimuth")
            ax.azimuth[] = Float64(input["azimuth"])
            ax.elevation[] = Float64(input["elevation"])
        else
            ax.limits[] = (
                Float64(input["xmin"]), Float64(input["xmax"]),
                Float64(input["ymin"]), Float64(input["ymax"]),
            )
        end
        # Frame resolution drops to 1x for every in-drag frame and restores to the mount ppu on
        # release ("settle", the frontend's terminal request) — the MANIFEST always stays in the
        # mount ppu's coordinate space below, so image-px geometry (viewBox, hit regions) never
        # moves out from under the overlay; only the PNG's own pixel density changes (the <img>
        # is width:100% CSS-scaled — see frontend-delivery.md — so that's decoupled from its
        # intrinsic size).
        render_ppu = get(input, "settle", false) === true ? ppu : 1.0
        bg0 = fig.scene.backgroundcolor[]
        try
            # Same forcing masque() does around its own render — that guard is restored in ITS
            # `finally` before this closure ever runs, so each frame has to redo it.
            fig.scene.backgroundcolor[] = RGBAf(Makie.red(bg0), Makie.green(bg0), Makie.blue(bg0), 1)
            _finalize!(fig)
            ctx = context(backend, fig, ppu)
            manifest = build_manifest(interactables, ctx)
            result = render(backend, fig, render_ppu)
            return Dict{String, Any}("png" => result.payload, "manifest" => manifest)
        finally
            fig.scene.backgroundcolor[] = bg0
        end
    end
end

function Base.show(io::IO, m::MIME"text/html", w::MasqueWidget)
    # Inject unconditionally: wrapping the esbuild IIFE in `if (!window.Masque) {…}` makes it
    # install `{}` instead of `{mount}` (a JS block-scope/strict-mode quirk).
    boot = HypertextLiteral.JavaScript(_OVERLAY_JS[])
    # Render-time capability question ONLY (§12.9) — NOT how a static export is detected.
    # Exporting doesn't re-render (`generate_html` serializes existing notebook state), so this
    # decision gets baked into the exported HTML from a session where a kernel was live and
    # would read back as stale `true` to a kernel-less reader. The frontend's own
    # `window.pluto_disable_ui` gate + try/catch backstop (gesture.ts) is what actually degrades
    # a dead channel at use time; this only decides whether to interpolate a `with_js_link` call
    # into the page at all.
    link = w.render_frame === nothing ? nothing :
        (APD.is_supported_by_display(io, APD.Display.with_js_link) ? APD.Display.with_js_link(w.render_frame) : nothing)
    request_frame_js = link === nothing ? HypertextLiteral.JavaScript("null") : link
    html = @htl(
        """
        <div class="ip-host" style="position:relative; display:inline-block; width:100%; max-width:$(w.display_css)px;">
          <img src="data:image/png;base64,$(w.b64)" style="display:block; width:100%; height:auto;" draggable="false">
          <script>
            $(boot)
            const manifest = $(APD.Display.published_to_js(w.manifest));
            const requestFrame = $(request_frame_js);
            window.Masque.mount(currentScript, manifest, invalidation, requestFrame);
          </script>
        </div>
        """
    )
    return show(io, m, html)
end

# Hydration and click both go through `bond_from_js` (src/bond.jl). `mount.ts` seeds the same
# envelope `mount_envelope` builds, or the browser's mount-time report would overwrite
# `initial_value`.
APD.Bonds.initial_value(w::MasqueWidget) = initial_bond(w)
APD.Bonds.transform_value(w::MasqueWidget, js) = bond_from_js(w, js)
