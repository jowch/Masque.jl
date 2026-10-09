# c can be a CSS string or any Makie-convertible color.
function _css_color(c)
    c isa AbstractString && return c
    rgba = Makie.RGBAf(Makie.to_color(c))
    r, g, b = round(Int, 255 * rgba.r), round(Int, 255 * rgba.g), round(Int, 255 * rgba.b)
    return rgba.alpha >= 1 ? "rgb($r,$g,$b)" : "rgba($r,$g,$b,$(round(rgba.alpha; digits = 3)))"
end

# Only set kwargs are emitted; unset ones fall through to the overlay's built-in defaults.
# Significant figures for a tooltip number with no format spec (the frontend's DEFAULT_SIGDIGITS).
# Past 17 a Float64 has no more digits to show.
const _DEFAULT_SIGDIGITS = 4

function _check_sigdigits(n)
    n isa Integer && !(n isa Bool) && 1 <= n <= 17 && return Int(n)
    throw(ArgumentError("tooltip_sigdigits must be an integer from 1 to 17, got $(repr(n))"))
end

# `tooltipstyle` key => (custom property, value kind).
const _TOOLTIP_STYLE_KEYS = (
    bg = ("--masque-tip-bg", :color),
    color = ("--masque-tip-color", :color),
    accent = ("--masque-tip-accent", :color),
    font = ("--masque-tip-font", :font),
    font_size = ("--masque-tip-font-size", :length),
    radius = ("--masque-tip-radius", :length),
    caret = ("--masque-tip-caret", :caret),
)

function _tooltip_style_value(k, kind, v)
    if kind === :color
        # `to_color` reads a bare number as a grey level, which gives no valid CSS colour.
        css = v isa Real ? nothing : try
                _css_color(v)
        catch
                nothing
        end
        css === nothing &&
            throw(ArgumentError("tooltipstyle: `$k` must be a CSS string or a Makie color, got $(repr(v))"))
        return css
    end
    if kind === :font
        v isa AbstractString || v isa Symbol ||
            throw(ArgumentError("tooltipstyle: `font` must be a CSS font-family string, got $(repr(v))"))
        return String(v)
    end
    if kind === :caret
        v isa Bool || throw(ArgumentError("tooltipstyle: `caret` must be `true` or `false`, got $(repr(v))"))
        return v ? "block" : "none"
    end
    v isa Real && !(v isa Bool) && isfinite(v) && v >= 0 ||
        throw(ArgumentError("tooltipstyle: `$k` must be a size in px, a number ≥ 0, got $(repr(v))"))
    return "$(v)px"
end

# Only set keys are emitted; unset ones keep the tooltip's built-in look. `caret = true` is
# the built-in look, so it emits nothing either.
function tip_style_dict(style)
    d = Dict{String, String}()
    style === nothing && return d
    style isa NamedTuple || throw(
        ArgumentError("tooltipstyle must be a NamedTuple such as `(; bg = :black)`, got $(repr(style))"),
    )
    for (k, v) in pairs(style)
        haskey(_TOOLTIP_STYLE_KEYS, k) || throw(
            ArgumentError(
                "tooltipstyle: unknown key `$k`. Valid keys: " *
                    join(string.(keys(_TOOLTIP_STYLE_KEYS)), ", "),
            ),
        )
        v === nothing && continue
        prop, kind = _TOOLTIP_STYLE_KEYS[k]
        val = _tooltip_style_value(k, kind, v)
        kind === :caret && val == "block" && continue
        d[prop] = val
    end
    return d
end

# The 0.2 flat `tooltip_*` keywords, deprecated in 0.3 and removed in 0.4: fold the ones
# given into `tooltipstyle`, warning once with the replacement. A key given both ways is an
# error rather than a silent pick.
function _merge_tooltip_kwargs(tooltipstyle, flat::NamedTuple)
    given = NamedTuple{Tuple(k for k in keys(flat) if flat[k] !== nothing)}(flat)
    isempty(given) && return tooltipstyle
    old = join(("`tooltip_$k = …`" for k in keys(given)), ", ")
    new = join(("$k = …" for k in keys(given)), ", ")
    _deprecate(
        "$old $(length(given) > 1 ? "are" : "is") deprecated; use `tooltipstyle = (; $new)`. Removed in 0.4.",
        :masque,
    )
    tooltipstyle === nothing && return given
    tooltipstyle isa NamedTuple || return tooltipstyle   # tip_style_dict raises the error
    for k in keys(given)
        haskey(tooltipstyle, k) && throw(
            ArgumentError("masque: `tooltip_$k` and `tooltipstyle.$k` both set; pass only `tooltipstyle`"),
        )
    end
    return merge(tooltipstyle, given)
end

# `overlaystyle` key => (custom property, value kind). The colour keys override the light/dark
# derivation mount.ts writes; the rest override the stylesheet fallbacks (the locked recipe).
const _OVERLAY_STYLE_KEYS = (
    color = ("--masque-chrome", :color),
    dodge_fill = ("--masque-hi-fill", :color),
    cross_color = ("--masque-cross", :color),
    handle_fill = ("--masque-handle-fill", :color),
    hover_width = ("--masque-hover-width", :length),
    selected_width = ("--masque-selected-width", :length),
    ring_width = ("--masque-ring-width", :length),
    ring_halo_width = ("--masque-ring-halo-width", :length),
    roi_width = ("--masque-roi-width", :length),
    handle_width = ("--masque-handle-width", :length),
    cross_width = ("--masque-cross-width", :length),
    cross_halo_width = ("--masque-cross-halo-width", :length),
    hover_fill_opacity = ("--masque-hover-fill-opacity", :opacity),
    selected_fill_opacity = ("--masque-selected-fill-opacity", :opacity),
    ring_halo_opacity = ("--masque-ring-halo-opacity", :opacity),
    cross_opacity = ("--masque-cross-opacity", :opacity),
)

function _overlay_style_value(k, kind, v)
    kind === :color && return _css_color(v)
    ok = v isa Real && !(v isa Bool) && isfinite(v) && v >= 0 && (kind === :length || v <= 1)
    ok || throw(
        ArgumentError(
            "overlaystyle: `$k` must be " *
                (kind === :length ? "a width in px, a number ≥ 0" : "an opacity from 0 to 1") *
                ", got $(repr(v))",
        ),
    )
    return kind === :length ? "$(v)px" : string(v)
end

# Only set keys are emitted; unset ones keep the overlay's built-in look.
function overlay_style_dict(style)
    d = Dict{String, String}()
    style === nothing && return d
    style isa NamedTuple || throw(
        ArgumentError("overlaystyle must be a NamedTuple such as `(; hover_width = 3)`, got $(repr(style))"),
    )
    for (k, v) in pairs(style)
        haskey(_OVERLAY_STYLE_KEYS, k) || throw(
            ArgumentError(
                "overlaystyle: unknown key `$k`. Valid keys: " *
                    join(string.(keys(_OVERLAY_STYLE_KEYS)), ", "),
            ),
        )
        prop, kind = _OVERLAY_STYLE_KEYS[k]
        d[prop] = _overlay_style_value(k, kind, v)
    end
    return d
end

# A `:slice` template interpolates the live sample, not `payloads` (always empty).
function _slice_template_keys(L::HitLayer)
    geom = L.geometry
    ks = Set{Symbol}()
    push!(ks, geom["orientation"] == "v" ? :x : :y)
    for s in geom["series"]
        push!(ks, Symbol(s["id"]))
    end
    return ks
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
    if L.kind in (:segments, :polyline, :lines, :rects, :polygons)
        t = hit_tol(i)
        t === nothing || (d["tol"] = round(Int, t * ctx.scaling))
    end
    s = selects(i)
    s === nothing || (d["selects"] = string(s))
    L.label === nothing || (d["label"] = L.label)
    if L.colors !== nothing
        # `index` is 1-based in Julia and 0-based on the wire (the overlay indexes a JS array).
        d["colors"] = L.colors isa AbstractString ? L.colors : Dict("palette" => L.colors.palette, "index" => L.colors.index .- 1)
    end
    L.links === nothing || (d["links"] = [[string(id) for id in ids] for ids in L.links])
    L.points === nothing || (d["points"] = L.points)
    L.step === nothing || (d["step"] = string(L.step))
    spec = tooltip_spec(i)
    spec === true && throw(ArgumentError("tooltip = true is not meaningful — omit `tooltip` for the auto name/value table (the default), pass masque\"…\" for a template, or `false` to suppress."))
    if spec isa Markup
        # A slice has no payloads: the live sample's fields are the probe coordinate plus each series id.
        ks = L.kind === :slice ? _slice_template_keys(L) : _payload_keys(L.payloads)
        # A line's hover readout adds the nearest sample's `x`, `y`, and 1-based index `i`.
        L.points === nothing || isempty(ks) || union!(ks, (:x, :y, :i))
        # A grid cell's template also sees the cell's `i`, `j`, and `value`.
        L.kind === :grid && !isempty(ks) && union!(ks, (:i, :j, :value))
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

# A slice from plots covers the layers `_assemble` found for them unless told otherwise. Keep
# the coverable ones in this call. Covers the caller named stay, so `_validate_slices` still
# reports a missing or uncoverable one.
function _drop_absent_default_covers!(built)
    kinds = Dict(d["id"] => d["kind"] for (_, _, d) in built)
    for (i, _, d) in built
        i isa SliceInteractable && !isempty(i.cover_plots) || continue
        filter!(c -> get(kinds, c, nothing) in ("lines", "polygons"), d["geometry"]["covers"])
    end
    return nothing
end

# One slice per axis. Each `covers` id must be a `:polygons` or `:lines` layer in this call.
function _validate_slices(layers)
    by_id = Dict(l["id"] => l for l in layers)
    layer_ids = Set(Symbol(l["id"]) for l in layers)
    seen = Dict{String, String}()
    for l in layers
        l["kind"] == "slice" || continue
        ax = l["axis"]
        if haskey(seen, ax)
            throw(
                ArgumentError(
                    "SliceInteractable: this axis already has slice :$(seen[ax]); :$(l["id"]) is a second slice",
                )
            )
        end
        seen[ax] = l["id"]
        for cid in l["geometry"]["covers"]
            if !haskey(by_id, cid)
                sug = _suggest(Symbol(cid), layer_ids)
                hint = sug === nothing ? "" : " Did you mean `:$sug`?"
                throw(
                    ArgumentError(
                        "SliceInteractable: `covers` names :$(cid), which is not a layer in this masque() call.$hint" *
                            " (available: $(join(sort(string.(collect(layer_ids))), ", ")))",
                    )
                )
            end
            kind = by_id[cid]["kind"]
            kind in ("polygons", "lines") || throw(
                ArgumentError(
                    "SliceInteractable: `covers = :$(cid)` targets a `:$(kind)` layer; only :polygons and :lines can be covered",
                )
            )
        end
    end
    return nothing
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
# by default, or (for a lenient/auto-resolved layer) warn and drop. Specs are either a layer id
# (every element of that layer) or `id:k` pinning element `k` (1-based); an exact layer id
# wins, so a real layer named `foo:1` is not parsed as an element pin.
function _parse_link_spec(tid_str, by_id)
    haskey(by_id, tid_str) && return (tid_str, nothing)
    m = match(r"^(.*):(\d+)$", tid_str)
    m === nothing && return nothing
    base = m.captures[1]
    haskey(by_id, base) || return nothing
    return (base, parse(Int, m.captures[2]))
end
function _validate_links(layer_owners, layers)
    by_id = Dict(l["id"] => l for l in layers)
    kinds = Dict(l["id"] => Symbol(l["kind"]) for l in layers)
    for (owner, d) in zip(layer_owners, layers)
        haskey(d, "links") || continue
        lenient = _links_lenient(owner)
        d["links"] = map(enumerate(d["links"])) do (k, ids)
            kept = String[]
            dropped = false
            for tid_str in ids
                tid = Symbol(tid_str)
                parsed = _parse_link_spec(tid_str, by_id)
                if parsed === nothing
                    throw(ArgumentError("links: layer :$(d["id"]) element $k links to unknown layer :$(tid)"))
                end
                base_id, elem = parsed
                tk = kinds[base_id]
                if tk in _SELECTED_KINDS
                    if elem !== nothing
                        n = _layer_n_elements(tk, by_id[base_id]["geometry"])
                        if !(1 <= elem <= n)
                            throw(
                                ArgumentError(
                                    "links: layer :$(d["id"]) element $k links to :$(tid), but layer :$(base_id) " *
                                        "has $n elements (valid: 1:$n)",
                                ),
                            )
                        end
                    end
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
    "polar" => _polar_dict(t.polar),
)

_polar_dict(::Nothing) = nothing
_polar_dict(p::PolarFrame) = Dict{String, Any}(
    "theta_as_x" => p.theta_as_x, "direction" => p.direction, "theta_0" => p.theta_0,
    "r0" => p.r0, "branch" => collect(p.branch),
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
        selected = nothing, tip_style = nothing, tip_digits = _DEFAULT_SIGDIGITS, background = nothing,
        overlay_style = nothing, owners_out = nothing,
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
    _drop_absent_default_covers!(built)
    _validate_slices(layers)
    _validate_links(layer_owners, layers)
    spec = _selection_spec(interactables, layers)
    # The box owns its target's bond: a click would replace the brushed selection while the box
    # stays drawn over it. The target keeps hover (tooltip); the overlay hit-tests clicks by `events`.
    if spec !== nothing
        target = only(filter(l -> l["id"] == string(spec.target), layers))
        filter!(!=("click"), target["events"])
    end
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
    (overlay_style === nothing || isempty(overlay_style)) || (m["overlayStyle"] = overlay_style)
    tip_digits == _DEFAULT_SIGDIGITS || (m["tipDigits"] = tip_digits)
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

# The built-in backends by `backend=` symbol: the extension that defines each, and the package
# that loads it. Each extension adds a `_builtin_backend(::Val{name})` method.
const _BUILTIN_BACKENDS = (
    cairo = (:MasqueCairoMakieExt, "CairoMakie"),
    webgl = (:MasqueWGLMakieExt, "WGLMakie"),
)
function _builtin_backend end

# The token the built-in backend structs' constructors take, so their public keyword
# constructors (deprecated in 0.2.0) are the only ones a user reaches.
struct _Builtin end

# A built-in backend object built with the deprecated keyword constructors
# (`CairoBackend(; max_width)`, `WebGLBackend(; px_per_unit, max_width)`). `masque` reads the
# settings it carries when its own keywords are not given. Removed in 0.3 with the constructors.
struct _LegacyBackend <: AbstractBackend
    backend::AbstractBackend
    max_width::Union{Nothing, Int}
    px_per_unit::Union{Nothing, Float64}
end

function _legacy_backend(backend, name, max_width, px_per_unit)
    kws = String[]
    max_width === nothing || push!(kws, "max_width = $max_width")
    px_per_unit === nothing || push!(kws, "px_per_unit = $px_per_unit")
    _deprecate(
        "`$(nameof(typeof(backend)))(…)` is deprecated; use `masque(fig; " *
            join(["backend = :$name"; kws], ", ") * ")`. Removed in 0.3.",
        nameof(typeof(backend)),
    )
    return _LegacyBackend(backend, max_width, px_per_unit)
end

# Backend choice follows which package extension is loaded, never sniffed from Makie's global
# `current_backend()` state. `explicit` is the caller's `backend=`.
function _resolve_backend(explicit)
    explicit isa AbstractBackend && return explicit
    if explicit isa Symbol
        valid = join((":$k" for k in keys(_BUILTIN_BACKENDS)), ", ")
        haskey(_BUILTIN_BACKENDS, explicit) ||
            throw(ArgumentError("masque: unknown backend `:$explicit`; use one of $valid"))
        ext, pkg = _BUILTIN_BACKENDS[explicit]
        Base.get_extension(@__MODULE__, ext) === nothing && throw(
            ArgumentError(
                "masque: `backend = :$explicit` needs `using $pkg` first (it loads that backend), " *
                    "then call `masque` again",
            ),
        )
        return _builtin_backend(Val(explicit))
    end
    # Both loaded: prefer Cairo so a preloaded WGLMakie doesn't block the default static path.
    for (name, (ext, _)) in pairs(_BUILTIN_BACKENDS)
        Base.get_extension(@__MODULE__, ext) === nothing || return _builtin_backend(Val(name))
    end
    throw(
        ArgumentError(
            "masque(fig) needs a rendering backend loaded: `using CairoMakie` for a static base, or " *
                "`using WGLMakie` for animation/large or frequently re-rendered data — then call " *
                "`masque` again. (Both expose the same interactions, `Axis3` included; the choice " *
                "is a cost profile.)",
        ),
    )
end

# Rounded once, so the CSS width, the density, and `display_scale` all use the same box.
function _check_max_width(w::Real)
    isfinite(w) && round(Int, w) >= 1 && return round(Int, w)
    throw(ArgumentError("masque: `max_width` must be at least 1 pixel, got $w"))
end
_check_max_width(w) = throw(ArgumentError("masque: `max_width` must be a positive number of pixels, got $(repr(w))"))
_check_px_per_unit(::Nothing) = nothing
_check_px_per_unit(p::Real) = isfinite(p) && p > 0 ? Float64(p) :
    throw(ArgumentError("masque: `px_per_unit` must be a positive number or `nothing`, got $p"))
_check_px_per_unit(p) = throw(ArgumentError("masque: `px_per_unit` must be a positive number or `nothing`, got $(repr(p))"))

# The backend that renders, and the `max_width` / `px_per_unit` it renders with. `masque`'s own
# keywords win over the settings a deprecated backend object carries.
function _backend_settings(backend, max_width, px_per_unit)
    b = _resolve_backend(backend)
    legacy_w, legacy_ppu = nothing, nothing
    if b isa _LegacyBackend
        legacy_w, legacy_ppu = b.max_width, b.px_per_unit
        b = b.backend
    end
    w = _check_max_width(something(max_width, legacy_w, 700))
    ppu = _check_px_per_unit(something(px_per_unit, legacy_ppu, Some(nothing)))
    return b, w, ppu
end

"""
    masque(fig, xs...; auto = true, kwargs...) -> MasqueWidget

Overlay `fig` with JS hit-testing and return a Pluto `@bind` source. `fig` is not mutated.

`masque(fig)` overlays the figure's defaults, the list [`interactables(fig)`](@ref
interactables) returns. Each argument after `fig` adds to them: an interactable, a vector of
them, or `interactables(plot; …)` for one plot.

- `interactables(plot; …)` replaces that plot's default layers, at the same position and with
  the same ids.
- An interactable whose layer id matches a default's replaces that default.
- Anything else (`ViewInteractable`, `ThresholdInteractable`, `ROIInteractable`,
  `PointInteractable(ax, pts)`, …) is added after the defaults, in argument order.

Two layers with the same id raise `ArgumentError`. Legends link to the layers of this call.
`auto = false` drops the defaults, so only the arguments are overlaid.

The bond is `nothing` until the first commit, unless `selected=` restored one. A click is one
[`InteractionEvent`](@ref). A `selects` [`ROIInteractable`](@ref) aimed at points commits a
`Vector{ElementEvent}` (an empty box is `ElementEvent[]`); aimed at a grid, one
[`GridWindowEvent`](@ref). The box owns that bond: its target layer shows tooltips but commits no
clicks. Clicks on other layers stay single events.

# Keywords
- `auto` — start from the figure's defaults. Default `true`.
- `selected` — the selection's starting value, 1-based. One index on a point layer mounts as
  that [`ElementEvent`](@ref); `1` and `[1]` are the same. Several indices highlight those marks
  and leave the bond `nothing` (a point layer holds one event). On a `selects` point brush, `1`
  and `[1]` mount as a one-element vector, and `[]` mounts as `ElementEvent[]`. Also accepts the
  event itself, or a `NamedTuple` / `Dict` keyed by layer id when the figure has more than one
  seedable layer. A bare index is an `ArgumentError` in that case. Works on
  `:circles`/`:rects`/`:polygons`/`:segments`/`:polyline`/`:lines`; any other kind, or an out-of-range
  index (`0` included), raises `ArgumentError` naming `1:n`. Clicking replaces the selection, so
  this is only needed to carry one through a rebuild — and it must come from a cell that doesn't
  read this widget's own bond, which Pluto rejects as a cyclic reference.
- `backend` — `:cairo` (a static image) or `:webgl` (a live canvas). Defaults to whichever of
  `CairoMakie` / `WGLMakie` is loaded, `:cairo` if both. Raises `ArgumentError` if neither is
  loaded, if the named backend's package is not loaded, or for an unknown name.
- `max_width` — the widest the plot shows on the page, in CSS px (Pluto's column). Default `700`.
- `px_per_unit` — image pixels per figure unit, on either backend. Default `nothing`: on
  `:cairo`, `2 * min(figure width, max_width) / figure width`, so the PNG is twice the width it
  shows at; on `:webgl`, `2`. A larger number gives a sharper, heavier picture. Neither this
  nor `max_width` follows `CairoMakie.activate!` or `WGLMakie.activate!`.
- `tooltip_sigdigits` — significant figures for a tooltip number that has no format spec.
  Default `4`, so `0.30000000000000004` shows as `0.3` and `2.71828` as `2.718`; integers,
  and the whole-number part of a value at or above `10^tooltip_sigdigits`, show in full.
  Readouts and drag labels keep their trailing zeros (`2.500`), so they don't change width as
  the pointer moves. A template field with a spec, such as `\$(x:.2f)`, ignores it, and the
  `@bind` value is never rounded.
- `tooltipstyle` — the look of the tooltip card, as a `NamedTuple`:
  `tooltipstyle = (; bg = :black, color = :white, radius = 6)`. Keys: `bg`, `color`, `accent`,
  `font`, `font_size`, `radius`, `caret`. Each key you leave out keeps the built-in look. See
  [Tooltip styling](@ref). The 0.2 keywords `tooltip_bg`, `tooltip_color`, … still work with
  a deprecation warning and are removed in 0.4.
- `overlaystyle` — the look of highlights, the selection, the crosshair, and ROI boxes, as a
  `NamedTuple`: `overlaystyle = (; color = :steelblue, hover_width = 2)`. Each key you leave
  out keeps the built-in look. See [Overlay styling](@ref) for the keys.

# Examples
```julia
using Masque, CairoMakie
fig = Figure(); ax = Axis(fig[1, 1])
pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]
s = scatter!(ax, first.(pts), last.(pts))
@bind sel masque(fig)                                                # every default
@bind sel masque(fig, interactables(s; payloads = ["a", "b", "c"]))  # one plot customised
@bind sel masque(fig, ViewInteractable(ax))                          # defaults plus pan
@bind sel masque(fig, PointInteractable(ax, pts); auto = false)      # only this layer
```
"""
function masque(fig, xs...; auto::Bool = true, kwargs...)
    ints = _assemble(fig, xs; auto)
    auto && isempty(ints) && @warn "masque(fig): no introspectable plots found — overlaying nothing (static image only)"
    return _masque(fig, ints; kwargs...)
end

function _masque(
        fig, interactables::AbstractVector; backend::Union{Nothing, Symbol, AbstractBackend} = nothing,
        max_width = nothing, px_per_unit = nothing, selected = nothing,
        tooltipstyle = nothing, tooltip_sigdigits = _DEFAULT_SIGDIGITS, overlaystyle = nothing,
        tooltip_bg = nothing, tooltip_color = nothing, tooltip_accent = nothing,
        tooltip_font = nothing, tooltip_font_size = nothing, tooltip_radius = nothing, tooltip_caret = nothing,
    )
    tip_digits = _check_sigdigits(tooltip_sigdigits)
    tooltipstyle = _merge_tooltip_kwargs(
        tooltipstyle,
        (;
            bg = tooltip_bg, color = tooltip_color, accent = tooltip_accent, font = tooltip_font,
            font_size = tooltip_font_size, radius = tooltip_radius, caret = tooltip_caret,
        ),
    )
    tip_style = tip_style_dict(tooltipstyle)
    overlay_style = overlay_style_dict(overlaystyle)
    backend, max_width, px_per_unit = _backend_settings(backend, max_width, px_per_unit)
    bg0 = fig.scene.backgroundcolor[]
    try
        fig.scene.backgroundcolor[] = RGBAf(Makie.red(bg0), Makie.green(bg0), Makie.blue(bg0), 1)
        _finalize!(fig)        # finalize once; render + context share it
        _pin_pan_ticklabelspace!(fig, interactables)
        ppu = something(px_per_unit, _ppu(backend, fig, max_width))
        round(Int, size(fig.scene)[1] * ppu) >= 1 || throw(
            ArgumentError("masque: `px_per_unit = $ppu` makes the picture less than 1 pixel wide"),
        )
        ctx = context(backend, fig, ppu, max_width)
        owners_out = Ref(Dict{String, LayerOwner}())
        manifest = build_manifest(
            interactables, ctx; selected, tip_style, tip_digits,
            background = fig.scene.backgroundcolor[], overlay_style, owners_out,
        )
        result = render(backend, fig, ppu)
        display_css = round(Int, min(size(fig.scene)[1], max_width))
        w = make_widget(backend, result, manifest, display_css, fig, interactables, ppu, max_width)
        return with_owners(w, owners_out[])
    finally
        fig.scene.backgroundcolor[] = bg0
    end
end

# A pan frame changes `ax.limits[]`, and a tick label that grows wider (a minus sign, one more
# digit) moves Makie's axis box: every later frame, and the settle, would shift the frame the
# preview held still (#171). Pin each pan axis's automatic tick-label space to the width it has
# now, after layout, so the first picture is unchanged and no later frame moves the box. Labels
# that later outgrow it hang into the margin instead. An explicit space is left alone.
function _pin_pan_ticklabelspace!(fig, interactables)
    pinned = false
    for i in interactables
        i isa ViewInteractable && i.ax isa Makie.Axis || continue
        ax = i.ax
        # `tight_*ticklabel_spacing!` returns the measured space; assign it, so the pin lives
        # on the axis attribute the author can see rather than only in the axis internals.
        if ax.xticklabelspace[] isa Makie.Automatic
            ax.xticklabelspace = Float64(Makie.tight_xticklabel_spacing!(ax))
            pinned = true
        end
        if ax.yticklabelspace[] isa Makie.Automatic
            ax.yticklabelspace = Float64(Makie.tight_yticklabel_spacing!(ax))
            pinned = true
        end
    end
    pinned && _finalize!(fig)
    return nothing
end


# One gesture closure's compile-ahead call. `show` schedules it and returns; the closure waits
# if a drag arrives while it is still running. Keyed by the closure so display and cancellation
# can find it without a widget field. The closure is immutable, so it cannot be a weak key;
# the entry is removed when the discarded calls finish or a drag runs them.
mutable struct _ViewWarmup
    apply::Function
    axes::Dict{Symbol, Any}
    task::Union{Nothing, Task}
    # The deferred task `wait`s this one before drawing. Joining from it would deadlock.
    blocked_on::Union{Nothing, Task}
    started::Bool
    done::Bool
    cancelled::Bool
end

const _VIEW_WARMUPS = IdDict{Function, _ViewWarmup}()
const _VIEW_WARMUP_LOCK = ReentrantLock()

function _view_warmup_state(render_frame)
    return lock(_VIEW_WARMUP_LOCK) do
        return get(_VIEW_WARMUPS, render_frame, nothing)
    end
end

function _drop_view_warmup!(render_frame)
    lock(_VIEW_WARMUP_LOCK) do
        delete!(_VIEW_WARMUPS, render_frame)
    end
    return nothing
end

# `true` once the discarded calls have finished, or when this closure has nothing scheduled.
function _view_warmup_finished(render_frame)::Bool
    state = _view_warmup_state(render_frame)
    state === nothing && return true
    return lock(_VIEW_WARMUP_LOCK) do
        return state.done
    end
end

_warmup_cancelled(state::_ViewWarmup) = lock(_VIEW_WARMUP_LOCK) do
    return state.cancelled
end

function _run_view_warmup!(state::_ViewWarmup, render_frame)
    try
        go = lock(_VIEW_WARMUP_LOCK) do
            return !state.cancelled
        end
        go && _warm_view_render_frame!(state.apply, state.axes; stop = () -> _warmup_cancelled(state))
    catch err
        @error "Masque view warmup failed" exception = (err, catch_backtrace())
    finally
        lock(_VIEW_WARMUP_LOCK) do
            state.done = true
            state.blocked_on = nothing
        end
        _drop_view_warmup!(render_frame)
    end
    return nothing
end

# Run the discarded calls after `caller` finishes. On Pluto's worker that task is the cell
# evaluation, and it flushes the formatted output before it ends, so the browser can hydrate
# while this runs. The root task (a test or the REPL) never ends; there the call just waits
# for the next yield, which is after `show` has written the HTML. If `caller` joins first,
# this task sees `done` and does not draw a second time.
function _defer_view_warmup!(state::_ViewWarmup, render_frame)
    caller = current_task()
    return @async begin
        if caller !== Base.roottask
            try
                wait(caller)
            catch
            end
        end
        run = lock(_VIEW_WARMUP_LOCK) do
            return !state.done
        end
        run && _run_view_warmup!(state, render_frame)
    end
end

function _kick_view_warmup!(render_frame)
    state = _view_warmup_state(render_frame)
    state === nothing && return nothing
    lock(_VIEW_WARMUP_LOCK) do
        state.started && return nothing
        state.cancelled && return nothing
        state.started = true
        state.blocked_on = current_task() === Base.roottask ? nothing : current_task()
        state.task = _defer_view_warmup!(state, render_frame)
    end
    return nothing
end

# `on_cancellation` runs just before the cell re-evaluates. A discarded frame may already
# have moved the camera. Wait until that frame's `finally` puts it back, so the next
# `masque` on this figure snapshots the mount camera. Running the wait on the task the
# deferred warmup is blocked on would deadlock; that task runs the restore itself.
function _cancel_view_warmup!(render_frame)
    state = _view_warmup_state(render_frame)
    state === nothing && return nothing
    run_here = false
    task = nothing
    lock(_VIEW_WARMUP_LOCK) do
        state.cancelled = true
        if !state.done && state.blocked_on === current_task()
            state.blocked_on = nothing
            state.started = true
            state.task = current_task()
            run_here = true
        else
            task = state.task
        end
    end
    if run_here
        _run_view_warmup!(state, render_frame)
    elseif task isa Task && task !== current_task()
        wait(task)
    end
    return nothing
end

# A drag that lands before the deferred call finishes waits for it. A drag that lands before
# `show` (tests, a callback with no display) runs the calls on this task instead. A drag on
# the task the deferred call is blocked on runs the calls here too: waiting would deadlock,
# and the deferred task then sees `done` and does not draw again.
function _join_view_warmup!(state::_ViewWarmup, render_frame)
    run_here = lock(_VIEW_WARMUP_LOCK) do
        state.done && return false
        if state.blocked_on === current_task() || !state.started
            state.blocked_on = nothing
            state.started = true
            state.task = current_task()
            return true
        end
        return false
    end
    if run_here
        _run_view_warmup!(state, render_frame)
    else
        t = lock(_VIEW_WARMUP_LOCK) do
            return state.task
        end
        t === nothing || t === current_task() || wait(t)
    end
    return nothing
end

function _sync_view_warmup!(render_frame)
    state = _view_warmup_state(render_frame)
    state === nothing && return nothing
    _join_view_warmup!(state, render_frame)
    return nothing
end

function _view_render_frame(backend::AbstractBackend, fig, interactables, ppu, max_width)
    view_axes = Dict{Symbol, Any}(i.id => i.ax for i in interactables if i isa ViewInteractable)
    isempty(view_axes) && return nothing
    state = _ViewWarmup(
        input -> _apply_view_frame(input, view_axes, backend, fig, interactables, ppu, max_width),
        view_axes, nothing, nothing, false, false, false,
    )
    frame = function (input)
        _join_view_warmup!(state, frame)
        return state.apply(input)
    end
    lock(_VIEW_WARMUP_LOCK) do
        _VIEW_WARMUPS[frame] = state
    end
    return frame
end

function _apply_view_frame(input, view_axes, backend, fig, interactables, ppu, max_width)
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
        ctx = context(backend, fig, ppu, max_width)
        manifest = build_manifest(interactables, ctx)
        result = render(backend, fig, render_ppu)
        frame = _gesture_frame(result)
        frame["manifest"] = manifest
        return frame
    finally
        fig.scene.backgroundcolor[] = bg0
    end
end

# A real call is what compiles this path (camera write, `ppu=1` render, JS payload). The
# frames are discarded. `show` schedules it after the mount HTML is written. Tiny nudges plus
# one farther pose cover the compile a coalesced first drag otherwise still pays. `stop`
# bails between frames when the cell is replaced; the camera is put back either way.
function _warm_view_render_frame!(frame, view_axes; stop = () -> false)
    for (id, ax) in view_axes
        stop() && break
        sid = String(id)
        if hasproperty(ax, :azimuth) && hasproperty(ax, :elevation)
            az0 = Float64(ax.azimuth[])
            el0 = Float64(ax.elevation[])
            try
                !stop() && frame(Dict{String, Any}("id" => sid, "azimuth" => az0 + 0.05, "elevation" => el0, "settle" => false))
                !stop() && frame(Dict{String, Any}("id" => sid, "azimuth" => az0, "elevation" => el0 + 0.05, "settle" => false))
                !stop() && frame(Dict{String, Any}("id" => sid, "azimuth" => az0 + 0.8, "elevation" => el0 - 0.2, "settle" => false))
                !stop() && frame(Dict{String, Any}("id" => sid, "azimuth" => az0, "elevation" => el0, "settle" => true))
            finally
                if ax.azimuth[] != az0 || ax.elevation[] != el0
                    ax.azimuth[] = az0
                    ax.elevation[] = el0
                end
            end
        else
            lim0 = ax.limits[]
            fl = _finallimits(ax)
            xmin = Float64(fl.origin[1])
            ymin = Float64(fl.origin[2])
            xmax = xmin + Float64(fl.widths[1])
            ymax = ymin + Float64(fl.widths[2])
            dx = 0.01 * (xmax - xmin)
            dy = 0.01 * (ymax - ymin)
            try
                !stop() && frame(
                    Dict{String, Any}(
                        "id" => sid, "xmin" => xmin + dx, "xmax" => xmax + dx,
                        "ymin" => ymin, "ymax" => ymax, "settle" => false,
                    ),
                )
                !stop() && frame(
                    Dict{String, Any}(
                        "id" => sid, "xmin" => xmin, "xmax" => xmax,
                        "ymin" => ymin + dy, "ymax" => ymax + dy, "settle" => false,
                    ),
                )
                !stop() && frame(
                    Dict{String, Any}(
                        "id" => sid, "xmin" => xmin, "xmax" => xmax,
                        "ymin" => ymin, "ymax" => ymax, "settle" => true,
                    ),
                )
            finally
                ax.limits[] == lim0 || (ax.limits[] = lim0)
            end
        end
    end
    return nothing
end

# Render-time capability question ONLY (§12.9) — NOT how a static export is detected.
# Exporting doesn't re-render (`generate_html` serializes existing notebook state), so this
# decision gets baked into the exported HTML from a session where a kernel was live and
# would read back as stale `true` to a kernel-less reader. The frontend's own
# `window.pluto_disable_ui` gate + try/catch backstop (gesture.ts) is what actually degrades
# a dead channel at use time; this only decides whether to interpolate a `with_js_link` call
# into the page at all. `null` when there is no callback, or this display can't host one.
function _request_frame_js(io, render_frame)
    link = render_frame === nothing ? nothing :
        (
            APD.is_supported_by_display(io, APD.Display.with_js_link) ?
            APD.Display.with_js_link(render_frame, () -> _cancel_view_warmup!(render_frame)) : nothing
        )
    return link === nothing ? HypertextLiteral.JavaScript("null") : link
end

# Outside Pluto (Documenter, VS Code, IJulia, a plain HTML page, `sprint` in a test) there is
# no `published_to_js`, and no `currentScript`/`invalidation` for the overlay. The context key
# is what `published_to_js` itself asserts on, so any display where the Pluto widget worked
# before still gets it.
_hosts_overlay(io) = APD.is_supported_by_display(io, APD.Display.published_to_js) ||
    get(io, :pluto_published_to_js, nothing) !== nothing

# The manifest written into the page as a JS literal, where Pluto would publish it. JS, not
# JSON: NaN is the polyline gap sentinel and JSON has no spelling for it. Every `<` is escaped
# so a tooltip containing `</script>` can't end the script element.
_js_literal(io::IO, ::Union{Nothing, Missing}) = print(io, "null")
_js_literal(io::IO, x::Bool) = print(io, x ? "true" : "false")
_js_literal(io::IO, x::Integer) = print(io, x)
function _js_literal(io::IO, x::AbstractFloat)
    isnan(x) && return print(io, "NaN")
    isinf(x) && return print(io, x > 0 ? "Infinity" : "-Infinity")
    # Float32's shortest form ("0.1f0") keeps the payload as small as Pluto's; `f` → `e`
    # makes it a JS number.
    x isa Union{Float16, Float32} && return print(io, replace(string(Float32(x)), 'f' => 'e'))
    return print(io, Float64(x))
end
_js_literal(io::IO, x::Symbol) = _js_literal(io, String(x))
function _js_literal(io::IO, s::AbstractString)
    print(io, '"')
    for c in s
        if c == '"'
            print(io, "\\\"")
        elseif c == '\\'
            print(io, "\\\\")
        elseif !isvalid(c)
            print(io, "\\ufffd")
        elseif c == '<' || c < ' ' || c == '\u2028' || c == '\u2029'
            print(io, "\\u", string(UInt32(c); base = 16, pad = 4))
        else
            print(io, c)
        end
    end
    return print(io, '"')
end
function _js_literal(io::IO, xs::Union{AbstractArray, Tuple})
    print(io, '[')
    for (i, x) in enumerate(xs)
        i > 1 && print(io, ',')
        _js_literal(io, x)
    end
    return print(io, ']')
end
function _js_literal(io::IO, d::Union{AbstractDict, NamedTuple})
    print(io, '{')
    for (i, (k, v)) in enumerate(pairs(d))
        i > 1 && print(io, ',')
        _js_literal(io, string(k))
        print(io, ':')
        _js_literal(io, v)
    end
    return print(io, '}')
end
_js_literal(io::IO, x) = _js_literal(io, string(x))

# Outside Pluto: hover, highlights and tooltips run in the browser with the manifest inlined
# (#298). Clicks still highlight, but nothing reads the bond and no frame comes back for a
# pan. The block gives each widget's `const`s their own scope, so two widgets on one plain
# page don't collide. A display that blocks inline scripts shows the plain `<img>`.
# The script finds its host by id, not `currentScript.parentElement`: the classic Jupyter
# Notebook runs output scripts from `<head>`. `mount` takes the host's child, so the `<img>`
# stands in for the script. Ids come from a counter and the clock, not `rand`, so showing a
# widget leaves the user's random stream alone.
const _STANDALONE_IDS = Threads.Atomic{Int}(0)
_standalone_id() = string("masque-", string(hash((time_ns(), Threads.atomic_add!(_STANDALONE_IDS, 1))); base = 36))

# A registered install loads the bundle once per page from jsDelivr (`_OVERLAY_CDN`, #311):
# widgets share one load through `window.__masqueLoads`, keyed by URL so two versions on a
# page don't mix. If the load fails or the hash doesn't match, the widget stays a plain
# figure. A git checkout inlines the bundle in each widget.
function _standalone_boot(cdn::NamedTuple)
    return HypertextLiteral.JavaScript(
        """
        const loads = window.__masqueLoads || (window.__masqueLoads = {});
        const url = $(sprint(_js_literal, cdn.url));
        const load = loads[url] || (loads[url] = new Promise((ok, fail) => {
          const s = document.createElement("script");
          s.src = url;
          s.integrity = $(sprint(_js_literal, cdn.integrity));
          s.crossOrigin = "anonymous";
          s.onload = () => ok(window.Masque);
          s.onerror = fail;
          document.head.appendChild(s);
        }));
        """
    )
end
_standalone_boot(::Nothing) = HypertextLiteral.JavaScript(
    _OVERLAY_JS[] * "\nconst load = Promise.resolve(window.Masque);\n"
)

function _standalone_html(w::MasqueWidget)
    boot = _standalone_boot(_OVERLAY_CDN[])
    manifest = HypertextLiteral.JavaScript(sprint(_js_literal, w.manifest))
    id = _standalone_id()
    return @htl(
        """
        <div class="ip-host" id="$(id)" style="position:relative; display:inline-block; width:100%; max-width:$(w.display_css)px;">
          <img src="data:image/png;base64,$(w.b64)" style="display:block; width:100%; height:auto;" draggable="false">
          <script>
            {
              $(boot)
              load.then((Masque) => {
                const host = document.getElementById($(id));
                const img = host && host.querySelector("img");
                if (img) Masque.mount(img, $(manifest), new Promise(() => {}), null);
              }, () => console.warn("Masque: the overlay script didn't load, so this figure has no hover."));
            }
          </script>
        </div>
        """
    )
end

function Base.show(io::IO, m::MIME"text/html", w::MasqueWidget)
    _hosts_overlay(io) || return show(io, m, _standalone_html(w))
    # Inject unconditionally: wrapping the esbuild IIFE in `if (!window.Masque) {…}` makes it
    # install `{}` instead of `{mount}` (a JS block-scope/strict-mode quirk).
    boot = HypertextLiteral.JavaScript(_OVERLAY_JS[])
    request_frame_js = _request_frame_js(io, w.render_frame)
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
    show(io, m, html)
    # HTML is in `io`. The discarded compile call runs after this returns; on Pluto's worker
    # it waits until the cell result has been flushed, so the browser hydrates first.
    _kick_view_warmup!(w.render_frame)
    return nothing
end

# Hydration and click both go through `bond_from_js` (src/bond.jl). `mount.ts` seeds the same
# envelope `mount_envelope` builds, or the browser's mount-time report would overwrite
# `initial_value`.
APD.Bonds.initial_value(w::MasqueWidget) = initial_bond(w)
APD.Bonds.transform_value(w::MasqueWidget, js) = bond_from_js(w, js)
