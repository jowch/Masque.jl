# Makie blocks as controls (widget design §3, #345). The author lays out a `Slider`, `Toggle`,
# … in the figure and names it in `masque`; masque leaves the block's box empty in the picture
# and the browser draws a native HTML control over it. The block's field holds its plain value.

const _CONTROL_BLOCKS = Union{Makie.Slider, Makie.IntervalSlider, Makie.Toggle, Makie.Checkbox, Makie.Menu}

# The wire name of each block type, the `control` entry of its layer's geometry.
_control_name(::Makie.Slider) = "slider"
_control_name(::Makie.IntervalSlider) = "intervalslider"
_control_name(::Makie.Toggle) = "toggle"
_control_name(::Makie.Checkbox) = "checkbox"
_control_name(::Makie.Menu) = "menu"

"""
    BlockControl(block, id)

A Makie block drawn as an HTML control: `Slider`, `IntervalSlider`, `Toggle`, `Checkbox` or
`Menu`. [`masque`](@ref) builds one for each block named in its arguments or `bind`
(`masque(fig, (degree = sl,))`); there is no need to build it by hand. Its field holds the
block's plain value: the slider's value, `(lo, hi)`, `true`/`false`, or the menu's selection.
"""
struct BlockControl <: AbstractInteractable
    block::_CONTROL_BLOCKS
    id::Symbol
end
BlockControl(block::_CONTROL_BLOCKS; id = :control) = BlockControl(block, Symbol(id))

events(::BlockControl) = (:change,)
bondtype(::BlockControl) = Any

# A block passed without a name: it would look live and do nothing.
function _unnamed_block_error(b)
    T = nameof(typeof(b))
    return ArgumentError(
        "masque: a $T is a control and needs a name, which becomes its field: " *
            "`masque(fig, (name = $(lowercase(string(T))),))`",
    )
end

function _block_rect(b, ctx)
    bb = _block_bbox(b)
    o = bb.origin; w = bb.widths
    s = ctx.scaling
    return (Float64(o[1] * s), Float64(ctx.height - (o[2] + w[2]) * s), Float64(w[1] * s), Float64(w[2] * s))
end

# A numeric range ships as its start and step, so a fine slider costs nothing; anything else
# ships every value's label.
function _range_geometry!(g, rng)
    if rng isa AbstractRange{<:Real} && isfinite(first(rng)) && isfinite(step(rng))
        g["range"] = Float64[first(rng), step(rng)]
    else
        g["labels"] = String[string(v) for v in rng]
    end
    return g
end

# The block's value as the wire carries it: a 0-based index, a pair of them, or a Bool.
_control_wire(b::Makie.Slider) = _slider_index(b)[] - 1
_control_wire(b::Makie.IntervalSlider) = Int[_interval_indices(b)[]...] .- 1
_control_wire(b::Makie.Toggle) = Bool(b.active[])
_control_wire(b::Makie.Checkbox) = Bool(b.checked[])
_control_wire(b::Makie.Menu) = Int(b.i_selected[]) - 1

function hitlayers(i::BlockControl, ctx)
    b = i.block
    x, y, w, h = _block_rect(b, ctx)
    g = Dict{String, Any}(
        "control" => _control_name(b), "x" => x, "y" => y, "w" => w, "h" => h,
        "value" => _control_wire(b),
    )
    if b isa Union{Makie.Slider, Makie.IntervalSlider}
        rng = b.range[]
        g["n"] = length(rng)
        g["horizontal"] = b.horizontal[] === true
        _range_geometry!(g, rng)
        g["color"] = _css_color(b.color_active[])
        g["fill"] = _css_color(b.color_active_dimmed[])
        g["off"] = _css_color(b.color_inactive[])
        # Makie's IntervalSlider always updates while dragging; a Slider can wait for release.
        b isa Makie.Slider && b.update_while_dragging[] !== true && (g["settleOnly"] = true)
    elseif b isa Makie.Menu
        opts = collect(b.options[])
        g["n"] = length(opts)
        g["labels"] = String[Makie.optionlabel(o) for o in opts]
        # What the closed menu shows: Makie's prompt before a choice, in its font size, text
        # colour and box colour, with the label `textpadding[1]` in from the left.
        g["prompt"] = string(b.prompt[])
        g["fontsize"] = Float64(b.fontsize[]) * ctx.scaling
        g["padding"] = Float64(b.textpadding[][1]) * ctx.scaling
        g["text"] = _css_color(b.textcolor[])
        g["off"] = _css_color(b.selection_cell_color_inactive[])
    elseif b isa Makie.Toggle
        g["color"] = _css_color(b.buttoncolor[])
        g["fill"] = _css_color(b.framecolor_active[])
        g["off"] = _css_color(b.framecolor_inactive[])
        _toggle_geometry!(g, b, ctx)
    elseif b isa Makie.Checkbox
        _checkbox_geometry!(g, b, ctx)
    end
    return [HitLayer(i.id, :control, g, Any[], Symbol(""), events(i), string(i.id))]
end

# Makie's checkbox (Makie/src/makielayout/blocks/checkbox.jl): a rounded square `size` across in
# the middle of the box, filled and stroked in its checked or unchecked colours, and a checkmark
# `size·checkmarksize` across that shows when checked, or in its unchecked colour under the
# pointer. A click sets `checked` to `onchange(checked)`; both answers ship, so the browser
# follows the same rule. Lengths are image px.
function _checkbox_geometry!(g, b::Makie.Checkbox, ctx)
    s = ctx.scaling
    sz = Float64(b.size[])
    g["size"] = sz * s
    g["radius"] = Float64(b.roundness[]) * sz / 2 * s
    g["stroke"] = Float64(b.checkboxstrokewidth[]) * s
    g["color"] = _css_color(b.checkboxcolor_checked[])
    g["off"] = _css_color(b.checkboxcolor_unchecked[])
    g["strokeOn"] = _css_color(b.checkboxstrokecolor_checked[])
    g["strokeOff"] = _css_color(b.checkboxstrokecolor_unchecked[])
    g["markOn"] = _css_color(b.checkmarkcolor_checked[])
    g["markOff"] = _css_color(b.checkmarkcolor_unchecked[])
    g["markSize"] = sz * Float64(b.checkmarksize[]) * s
    path = _marker_svg_path(b.checkmark[])
    path === nothing || (g["mark"] = path)
    next = Bool[]
    for v in (false, true)
        n = try
            b.onchange[](v)
        catch
            !v
        end
        push!(next, n isa Bool ? n : !v)
    end
    next == [true, false] || (g["next"] = next)
    return g
end

# Makie's toggle (Makie/src/makielayout/blocks/toggle.jl): a rounded track `length` long and
# `markersize` thick, turned by `orientation` and pinned to the box's corner on its start side,
# and a knob `markersize·(1 - rimfraction)` across that slides between the box's two ends.
# Points are image px from the box's top-left corner; `theta` turns counterclockwise.
function _toggle_geometry!(g, b::Makie.Toggle, ctx)
    or = b.orientation[]
    theta = or === :horizontal ? 0.0 : or === :vertical ? pi / 2 : Float64(or)
    ms = Float64(b.markersize[]); len = Float64(b.length[])
    bb = _block_bbox(b)
    o = bb.origin; w = bb.widths
    s = ctx.scaling
    local_px(x, y) = Float64[(x - o[1]) * s, (o[2] + w[2] - y) * s]
    sy, sx = sincos(theta)
    tx = sx > 0 ? o[1] + ms / 2 : o[1] + w[1] - ms / 2
    ty = sy > 0 ? o[2] + ms / 2 : o[2] + w[2] - ms / 2
    knob(active) = begin
        y, x = (active ? -1 : 1) .* (sy, sx)
        local_px(x > 0 ? o[1] + ms / 2 : o[1] + w[1] - ms / 2, y > 0 ? o[2] + ms / 2 : o[2] + w[2] - ms / 2)
    end
    g["theta"] = theta
    g["track"] = vcat(local_px(tx, ty), len * s, ms * s)
    g["knobOff"] = knob(false)
    g["knobOn"] = knob(true)
    g["knob"] = ms * (1 - Float64(b.rimfraction[])) * s
    g["duration"] = Float64(b.toggleduration[])
    return g
end

initial_envelope(i::BlockControl, ctx, layers) =
    Dict{String, Any}("layer" => string(i.id), "index" => 0, "payload" => _control_wire(i.block))

# The wire value of `b` → the block's plain value.
function _control_value(b::Makie.Slider, id, p)
    rng = b.range[]
    return rng[_control_index(id, p, length(rng))]
end
function _control_value(b::Makie.IntervalSlider, id, p)
    rng = b.range[]
    p isa AbstractVector && length(p) == 2 || throw(
        ArgumentError("bond: control :$id expected two indices, got $(repr(p))"),
    )
    lo, hi = minmax(_control_index(id, p[1], length(rng)), _control_index(id, p[2], length(rng)))
    return (rng[lo], rng[hi])
end
function _control_value(::Union{Makie.Toggle, Makie.Checkbox}, id, p)
    p isa Bool || throw(ArgumentError("bond: control :$id expected true or false, got $(repr(p))"))
    return p
end
function _control_value(b::Makie.Menu, id, p)
    p isa Integer && p == -1 && return nothing
    opts = collect(b.options[])
    return Makie.optionvalue(opts[_control_index(id, p, length(opts))])
end

function _control_index(id, p, n)
    p isa Integer && !(p isa Bool) && 0 <= p < n || throw(
        ArgumentError("bond: control :$id expected an index from 0 to $(n - 1), got $(repr(p))"),
    )
    return Int(p) + 1
end

transform_bond(i::BlockControl, layer::HitLayer, index, js_payload) = _control_value(i.block, i.id, js_payload)

# The block takes the value the browser has, before `onchange` runs, so code written for
# GLMakie with `on(sl.value)` or `@lift` sees it too.
function _set_control!(b::Makie.Slider, p)
    k = Int(p) + 1
    _slider_index(b)[] == k || (_slider_index(b)[] = k)
    return nothing
end
function _set_control!(b::Makie.IntervalSlider, p)
    ks = (Int(p[1]) + 1, Int(p[2]) + 1)
    _interval_indices(b)[] == ks || (_interval_indices(b)[] = ks)
    return nothing
end
_set_control!(b::Makie.Toggle, p) = (b.active[] == p || (b.active[] = p); nothing)
_set_control!(b::Makie.Checkbox, p) = (b.checked[] == p || (b.checked[] = p); nothing)
_set_control!(b::Makie.Menu, p) = (b.i_selected[] == p + 1 || (b.i_selected[] = Int(p) + 1); nothing)

# Every named block takes its value from the state `js` (one envelope per field). Each value
# is decoded first, so a bad one throws before any block moves.
function _sync_controls!(interactables, js)
    moves = Tuple{Any, Any}[]
    for i in interactables
        i isa BlockControl || continue
        env = get(js, string(i.id), nothing)
        env isa AbstractDict && haskey(env, "payload") || continue
        p = env["payload"]
        _control_value(i.block, i.id, p)
        push!(moves, (i.block, p))
    end
    for (b, p) in moves
        _set_control!(b, p)
    end
    return nothing
end

# Every plot a block draws, in its scene and the scenes under it (Menu's dropdown).
function _block_plots(b)
    out = Any[]
    stack = Any[_block_scene(b)]
    while !isempty(stack)
        sc = pop!(stack)
        append!(out, sc.plots)
        append!(stack, sc.children)
    end
    return out
end

# Run `f` with every named block's own drawing hidden, so the picture has an empty box where
# the HTML control goes. The layout is computed already and doesn't depend on visibility.
function _with_blocks_hidden(f, interactables)
    hidden = Tuple{Any, Any}[]
    for i in interactables
        i isa BlockControl || continue
        for p in _block_plots(i.block)
            v = p.visible[]
            v === false && continue
            push!(hidden, (p, v))
            p.visible = false
        end
    end
    try
        return f()
    finally
        for (p, v) in hidden
            p.visible = v
        end
    end
end

# The blocks of `fig` drawn as controls, in layout order, nested layouts included.
_figure_blocks(fig) = Any[c for c in fig.content if c isa _CONTROL_BLOCKS]

# Makie's input blocks that masque doesn't draw as controls yet: they stay pictures (#426).
const _PICTURE_BLOCKS = Union{Makie.Button, Makie.Textbox, Makie.SliderGrid}

# A block in the figure that this call doesn't name would look live and do nothing, so it is an
# error (a warning in 0.3.1). A block masque can't draw yet looks just as live, so it is a
# warning. A `SliderGrid`'s sliders aren't in `fig.content`, so only the grid itself counts.
function _check_unnamed_blocks(fig, interactables)
    _warn_picture_blocks(fig)
    named = Base.IdSet{Any}(i.block for i in interactables if i isa BlockControl)
    left = [b for b in _figure_blocks(fig) if !(b in named)]
    isempty(left) && return nothing
    kinds = join(unique(string(nameof(typeof(b))) for b in left), ", ")
    what = length(left) == 1 ? "a block that masque wasn't given ($(kinds)), which would" :
        "blocks that masque wasn't given ($(kinds)), which would"
    each = length(left) == 1 ? "Name it" : "Name each one"
    throw(
        ArgumentError(
            "masque: this figure has $what look live and do nothing. $each to make it a " *
                "control, `masque(fig, (name = block,))`, or take it out of the figure",
        ),
    )
end

function _warn_picture_blocks(fig)
    left = Any[c for c in fig.content if c isa _PICTURE_BLOCKS]
    isempty(left) && return nothing
    kinds = unique(string(nameof(typeof(b))) for b in left)
    names = ["a " * k for k in kinds]
    list = length(names) == 1 ? only(names) : join(names[1:(end - 1)], ", ") * " and " * names[end]
    instead = String[]
    any(b -> b isa Makie.SliderGrid, left) &&
        push!(instead, "For a grid of sliders, lay out separate Makie `Slider`s, which masque makes live.")
    any(b -> b isa Union{Makie.Button, Makie.Textbox}, left) &&
        push!(instead, "For a button or a text box, use a control outside the figure, such as PlutoUI's Button or TextField.")
    @warn "masque: this figure has $(list), which masque shows as a picture for now, so the " *
        "reader can click it and nothing happens. $(join(instead, " "))"
    return nothing
end
