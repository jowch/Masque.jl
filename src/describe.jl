# A widget's non-HTML forms (#373), for anything that reads a cell's value without a browser:
# an AI agent reading a notebook, the REPL, a frontend that ranks PNG above HTML. Pluto ranks
# `text/html` first, so a notebook still shows the live figure.

# Axis id => title, in figure order, for the text form. A widget built by hand has none.
function _axis_titles(fig, ctx::InteractionContext)
    return Pair{String, String}[
        string(ctx.ids[ax]) => string(ax.title[]) for ax in fig.content
            if ax isa _SUPPORTED_AXES && haskey(ctx.ids, ax)
    ]
end

# Backends whose widget is their own type extend this to keep the titles; others drop them.
with_titles(w, titles) = w
with_titles(w::MasqueWidget, titles) = MasqueWidget(w.b64, w.manifest, w.display_css, w.render_frame, w.owners, titles)

Base.showable(::MIME"image/png", w::MasqueWidget) = !isempty(w.b64)
Base.show(io::IO, ::MIME"image/png", w::MasqueWidget) = write(io, base64decode(w.b64))

Base.show(io::IO, w::MasqueWidget) = _show_compact(io, "MasqueWidget", w.manifest)
Base.show(io::IO, ::MIME"text/plain", w::MasqueWidget) = _describe(io, "MasqueWidget", w)

function _show_compact(io::IO, name, m)
    n = length(get(m, "layers", ()))
    return print(io, name, "(", _size_text(m), ", ", n, n == 1 ? " layer)" : " layers)")
end
_size_text(m) = haskey(m, "width") ? string(m["width"], "×", m["height"], " px") : "no picture"

# A few lines, since this goes into an agent's context: the picture's size, then each axis with
# its title and its layers (what they draw, the gestures they take, their tooltip fields), then
# the `@bind` value the widget starts with.
function _describe(io::IO, name, w)
    m = w.manifest
    layers = get(m, "layers", Any[])
    print(io, name, ", ", _size_text(m), ", ", length(layers), length(layers) == 1 ? " layer" : " layers")
    titles = Dict(w.titles)
    groups = String[]
    for id in first.(w.titles)
        any(d -> d["axis"] == id, layers) && push!(groups, id)
    end
    for d in layers
        d["axis"] in groups || push!(groups, d["axis"])
    end
    for g in groups
        # A control sits on no axis.
        print(io, "\n", isempty(g) ? "figure" : g)
        title = get(titles, g, "")
        isempty(title) || print(io, " \"", title, "\"")
        haskey(m, "transforms") && haskey(m["transforms"], g) && print(io, _axis_kind(m["transforms"][g]))
        print(io, ":")
        for d in layers
            d["axis"] == g || continue
            print(io, "\n  ", get(d, "label", d["id"]))
            haskey(d, "label") && d["label"] != d["id"] && print(io, " (", d["id"], ")")
            print(io, ": ", _layer_text(d))
        end
    end
    fields = get(m, "fields", ())
    isempty(fields) || print(io, "\nvalue: ", _clip(sprint(show, initial_bond(w); context = :limit => true), 300))
    return nothing
end

function _axis_kind(t)
    get(t, "is3d", false) === true && return " (3D)"
    get(t, "ispolar", false) === true && return " (polar)"
    return ""
end

function _layer_text(d)
    kind = Symbol(d["kind"])
    n = _layer_n_elements(kind, d["geometry"])
    what = if kind === :grid
        # The plotted matrix's size: its first dimension runs along x.
        string(Int(d["geometry"]["ncols"]), "×", Int(d["geometry"]["nrows"]), " cells")
    elseif kind === :polyline
        "1 line"
    elseif haskey(_KIND_NOUNS, kind)
        noun = _KIND_NOUNS[kind]
        string(n, " ", n == 1 ? noun[1] : noun[2])
    elseif kind === :control
        string(get(d["geometry"], "control", "control"))
    else
        string(kind)
    end
    events = get(d, "events", ())
    isempty(events) || (what *= string("; ", join(events, ", ")))
    tip = _tooltip_text(d)
    isempty(tip) || (what *= string("; tooltip: ", tip))
    return what
end

const _KIND_NOUNS = Dict(
    :circles => ("point", "points"), :lines => ("line", "lines"), :segments => ("segment", "segments"),
    :rects => ("rectangle", "rectangles"), :polygons => ("polygon", "polygons"),
)

# The fields a tooltip shows: a template's, or the payloads' own names for the default table.
function _tooltip_text(d)
    get(d, "tooltip", true) === false && return "none"
    if haskey(d, "template")
        fs = unique(String[seg["f"] for seg in d["template"] if seg isa AbstractDict && haskey(seg, "f")])
        return isempty(fs) ? "text" : join(fs, ", ")
    end
    payloads = get(d, "payloads", ())
    ks = _payload_keys(payloads)
    g = d["geometry"]
    # Fields the default table adds (frontend/src/hover.ts): a line's nearest sample (its `i`
    # only in a template), a grid cell's value, and its position when it has no payload.
    haskey(d, "points") && union!(ks, (:x, :y))
    if d["kind"] == "grid"
        push!(ks, :value)
        all(isnothing, payloads) && union!(ks, (:i, :j))
    elseif d["kind"] == "surface" && !haskey(g, "suspended")
        union!(ks, (:i, :j, :x, :y, :z))
        haskey(g, "value") && push!(ks, :value)
    elseif d["kind"] == "slice"
        push!(ks, g["orientation"] == "v" ? :x : :y)
        union!(ks, Symbol(s["id"]) for s in g["series"])
    end
    return join(sort!(string.(collect(ks))), ", ")
end

_clip(s, n) = length(s) <= n ? s : string(first(s, n - 1), "…")
