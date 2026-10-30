# Makie blocks as controls (widget design §3, #345). The author lays out a `Slider`, `Toggle`,
# … in the figure and names it in `masque`; masque leaves the block's box empty in the picture
# and the browser draws a native HTML control over it. The block's field holds its plain value.

const _CONTROL_BLOCKS = Union{
    Makie.Slider, Makie.IntervalSlider, Makie.Toggle, Makie.Checkbox, Makie.Menu, Makie.SliderGrid, Makie.Button,
    Makie.Textbox,
}

# The wire name of each block type, the `control` entry of its layer's geometry.
_control_name(::Makie.Slider) = "slider"
_control_name(::Makie.IntervalSlider) = "intervalslider"
_control_name(::Makie.Toggle) = "toggle"
_control_name(::Makie.Checkbox) = "checkbox"
_control_name(::Makie.Menu) = "menu"
_control_name(::Makie.SliderGrid) = "slidergrid"
_control_name(::Makie.Button) = "button"
_control_name(::Makie.Textbox) = "textbox"

"""
    BlockControl(block, id)

A Makie block drawn as an HTML control: `Slider`, `IntervalSlider`, `Toggle`, `Checkbox`,
`Menu`, `SliderGrid`, `Button` or `Textbox`. [`masque`](@ref) builds one for each block named in its arguments or
`bind` (`masque(fig, (degree = sl,))`); there is no need to build it by hand. Its field holds
the block's plain value: the slider's value, `(lo, hi)`, `true`/`false`, the menu's selection,
a tuple of a grid's slider values, in order, the number of times a button was clicked, or the
text last entered in a text box (`nothing` before any).
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
_control_wire(b::Makie.Button) = Int(b.clicks[])
_control_wire(b::Makie.Textbox) = b.stored_string[] === nothing ? nothing : string(b.stored_string[])
_control_wire(b::Makie.SliderGrid) = Any[_control_wire(sl) for sl in _grid_sliders(b)]

hitlayers(i::BlockControl, ctx) =
    [HitLayer(i.id, :control, _control_geometry(i.block, ctx), Any[], Symbol(""), events(i), string(i.id))]

function _control_geometry(b, ctx)
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
    elseif b isa Makie.Button
        _button_geometry!(g, b, ctx)
    elseif b isa Makie.Textbox
        _textbox_geometry!(g, b, ctx)
    elseif b isa Makie.SliderGrid
        g["sliders"] = Any[
            _grid_slider_geometry(sl, name, vl, ctx)
                for (sl, name, vl) in zip(_grid_sliders(b), _grid_labels(b), _grid_valuelabels(b))
        ]
    end
    return g
end

# Makie's button (Makie/src/makielayout/blocks/button.jl): a rounded box filling the block's box,
# with its label in the middle, in one of three colour pairs: at rest, under the pointer, and
# pressed. Lengths are image px.
function _button_geometry!(g, b::Makie.Button, ctx)
    s = ctx.scaling
    g["caption"] = string(b.label[])
    g["fontsize"] = Float64(b.fontsize[]) * s
    g["radius"] = Float64(b.cornerradius[]) * s
    g["stroke"] = Float64(b.strokewidth[]) * s
    g["strokeColor"] = _css_color(b.strokecolor[])
    g["colors"] = [_css_color(b.buttoncolor[]), _css_color(b.buttoncolor_hover[]), _css_color(b.buttoncolor_active[])]
    g["textColors"] = [_css_color(b.labelcolor[]), _css_color(b.labelcolor_hover[]), _css_color(b.labelcolor_active[])]
    return g
end

# Makie's text box (Makie/src/makielayout/blocks/textbox.jl): a rounded box whose border and fill
# take one colour at rest, another under the pointer, a third while typing, and a fourth while
# the text typed fails the validator. Enter stores the text if it is valid. Lengths are image px;
# colours run (at rest, under the pointer, typing, typing invalid text).
function _textbox_geometry!(g, b::Makie.Textbox, ctx)
    s = ctx.scaling
    g["placeholder"] = string(b.placeholder[])
    g["fontsize"] = Float64(b.fontsize[]) * s
    g["pad"] = Float64[p * s for p in b.textpadding[]]   # left, right, bottom, top
    g["radius"] = Float64(b.cornerradius[]) * s
    g["stroke"] = Float64(b.borderwidth[]) * s
    g["colors"] = [_css_color(b.boxcolor[]), _css_color(b.boxcolor_hover[]), _css_color(b.boxcolor_focused[]), _css_color(b.boxcolor_focused_invalid[])]
    g["borders"] = [_css_color(b.bordercolor[]), _css_color(b.bordercolor_hover[]), _css_color(b.bordercolor_focused[]), _css_color(b.bordercolor_focused_invalid[])]
    g["text"] = _css_color(b.textcolor[])
    g["placeholderColor"] = _css_color(b.textcolor_placeholder[])
    g["cursor"] = _css_color(b.cursorcolor[])
    b.reset_on_defocus[] === true && (g["resetOnBlur"] = true)
    b.defocus_on_submit[] === true || (g["keepFocus"] = true)
    check = _textbox_check(b.validator[])
    check === nothing || (g["check"] = check)
    allowed = _textbox_allowed(b.restriction[])
    allowed === nothing || (g["allowed"] = allowed)
    return g
end

# The validator as the browser can run it while the reader types: a pattern (a `Regex`, or the
# numbers `tryparse` reads for a number type) and its flags. A validator the browser can't run
# (a function of the author's) ships nothing: Julia checks the text when the reader presses Enter.
const _INT_PATTERN = raw"\s*[+-]?(?:\d+|0x[0-9a-fA-F]+|0o[0-7]+|0b[01]+)\s*"
const _FLOAT_PATTERN = raw"\s*[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|inf|infinity|nan)\s*"
function _textbox_check(v)
    v isa Regex && return _regex_check(v)
    v isa Type && v <: Integer && !(v <: Bool) && return Dict{String, Any}("pattern" => _INT_PATTERN, "flags" => "")
    v isa Type && v <: AbstractFloat && return Dict{String, Any}("pattern" => _FLOAT_PATTERN, "flags" => "i")
    return nothing
end
function _regex_check(r::Regex)
    flags = ""
    r.compile_options & Base.PCRE.CASELESS != 0 && (flags *= "i")
    r.compile_options & Base.PCRE.MULTILINE != 0 && (flags *= "m")
    r.compile_options & Base.PCRE.DOTALL != 0 && (flags *= "s")
    # Extended syntax (`x`) has no JavaScript form.
    r.compile_options & Base.PCRE.EXTENDED != 0 && return nothing
    return Dict{String, Any}("pattern" => r.pattern, "flags" => flags)
end

# Makie's own validator accepts everything; any other function is the author's.
_accepts_all(v) = v isa Function && parentmodule(typeof(v)) === Makie

# A `restriction` as the characters it allows among the printable ASCII ones; the browser drops
# any other of those as the reader types. Characters past ASCII are left to Julia.
function _textbox_allowed(r)
    r === nothing && return nothing
    return String([c for c in ' ':'~' if Makie.is_allowed(c, r)])
end

# One slider of a `SliderGrid`, with its name and the value label beside it: the label's box,
# text size and colour, and the text for each value. The text comes from the grid's own
# `format`, run in Julia, so the label follows the slider in a static export too. A fine slider
# would ship a string per value on every frame, so labels stop at `_GRID_LABELS` values (an
# interval slider's at `_GRID_PAIRS` lo ≤ hi pairs, 20 values); past that the browser writes the
# value. Sizes are in docs/dev/perf-findings.md.
const _GRID_LABELS = 101
const _GRID_PAIRS = 210
function _grid_slider_geometry(sl, name, vl, ctx)
    g = _control_geometry(sl, ctx)
    g["name"] = string(name.text[])
    x, y, w, h = _block_rect(vl, ctx)
    lab = Dict{String, Any}(
        "x" => x, "y" => y, "w" => w, "h" => h,
        "fontsize" => Float64(vl.fontsize[]) * ctx.scaling, "color" => _css_color(vl.color[]),
    )
    fmt = _valuelabel_format(sl, vl)
    rng = sl.range[]
    n = length(rng)
    if fmt !== nothing
        if sl isa Makie.Slider
            n <= _GRID_LABELS && (lab["labels"] = String[string(fmt(v)) for v in rng])
        elseif n * (n + 1) ÷ 2 <= _GRID_PAIRS
            # Row-major over lo ≤ hi: lo = 0's pairs first, then lo = 1's, and so on.
            lab["pairs"] = String[string(fmt((rng[i], rng[j]))) for i in 1:n for j in i:n]
        end
    end
    g["valueLabel"] = lab
    return g
end

initial_envelope(i::BlockControl, ctx, layers) =
    Dict{String, Any}("layer" => string(i.id), "index" => 0, "payload" => _control_wire(i.block))

# Makie's checkbox (Makie/src/makielayout/blocks/checkbox.jl): a rounded square `size` across in
# the middle of the box, filled and stroked in its checked or unchecked colours, and a checkmark
# `size·checkmarksize` across that shows when checked, or in its unchecked colour under the
# pointer. Lengths are image px. A click flips it: the block's own `onchange` isn't run (see
# `_warn_checkbox_rule`).
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
    mark = b.checkmark[]
    if mark isa AbstractChar
        g["markChar"] = string(mark)
    else
        path = _marker_svg_path(mark)
        path === nothing || (g["mark"] = path)
    end
    return g
end

# Makie's `onchange` decides what a click turns a checkbox into, and is meant for radio buttons,
# whose rule unticks the others. Running it ahead of a click would run those side effects when
# the widget is drawn, so masque leaves it out and a click flips the box; it says so once.
function _warn_checkbox_rule(interactables)
    for i in interactables
        i isa BlockControl && i.block isa Makie.Checkbox || continue
        i.block.onchange[] === (!) && continue
        @warn "masque: checkbox :$(i.id) has its own `onchange`, which masque doesn't run yet, " *
            "so a click flips it. Set the box from your own code instead (see #457)." maxlog = 1
    end
    return nothing
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
function _control_value(::Makie.Button, id, p)
    p isa Integer && !(p isa Bool) && p >= 0 || throw(ArgumentError("bond: control :$id expected a click count, got $(repr(p))"))
    return Int(p)
end
# A text that fails the validator, or holds a character the restriction refuses, leaves the
# field at the last text the box stored: the browser checks a pattern as the reader types, but
# a function only Julia can run.
function _control_value(b::Makie.Textbox, id, p)
    p === nothing && return nothing
    p isa AbstractString || throw(ArgumentError("bond: control :$id expected a text or nothing, got $(repr(p))"))
    _textbox_takes(b, p) && return String(p)
    return _control_wire(b)
end
function _textbox_takes(b::Makie.Textbox, p)
    r = b.restriction[]
    r === nothing || all(c -> Makie.is_allowed(c, r), p) || return false
    v = b.validator[]
    return _accepts_all(v) || Makie.validate_textbox(p, v)::Bool
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

function _control_value(b::Makie.SliderGrid, id, p)
    sls = _grid_sliders(b)
    p isa AbstractVector && length(p) == length(sls) || throw(
        ArgumentError("bond: control :$id expected $(length(sls)) slider values, got $(repr(p))"),
    )
    return Tuple(_control_value(sl, id, q) for (sl, q) in zip(sls, p))
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
_set_control!(b::Makie.Button, p) = (b.clicks[] == p || (b.clicks[] = Int(p)); nothing)
function _set_control!(b::Makie.Textbox, p)
    p === nothing && return nothing
    _textbox_takes(b, p) || return nothing
    b.stored_string[] == p && return nothing
    b.displayed_string[] = String(p)
    b.stored_string[] = String(p)
    return nothing
end
_set_control!(b::Makie.Toggle, p) = (b.active[] == p || (b.active[] = p); nothing)
_set_control!(b::Makie.Checkbox, p) = (b.checked[] == p || (b.checked[] = p); nothing)
function _set_control!(b::Makie.SliderGrid, p)
    for (sl, q) in zip(_grid_sliders(b), p)
        _set_control!(sl, q)
    end
    return nothing
end
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

# Every plot a block draws, in its scene and the scenes under it (Menu's dropdown). A grid's
# sliders and value labels are drawn in HTML; its name labels stay in the picture.
function _block_plots(b)
    out = Any[]
    stack = b isa Makie.SliderGrid ? Any[_block_scene(c) for c in vcat(_grid_sliders(b), _grid_valuelabels(b))] :
        Any[_block_scene(b)]
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
_figure_blocks(fig) = Any[c for c in fig.content if c isa _CONTROL_BLOCKS && !(c isa _LATER_BLOCKS)]

# Blocks masque began drawing in a patch release. One left out warns (`_warn_unnamed_later`):
# before, a figure with one worked, so it can't become an error in a patch release.
const _LATER_BLOCKS = Union{Makie.SliderGrid, Makie.Button, Makie.Textbox}

# A block in the figure that this call doesn't name would look live and do nothing, so it is an
# error (a warning in 0.3.1). A `SliderGrid`'s sliders aren't in `fig.content`, so only the grid
# itself counts.
function _check_unnamed_blocks(fig, interactables)
    _warn_checkbox_rule(interactables)
    named = Base.IdSet{Any}(i.block for i in interactables if i isa BlockControl)
    _warn_unnamed_later(fig, named)
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

function _warn_unnamed_later(fig, named)
    left = Any[c for c in fig.content if c isa _LATER_BLOCKS && !(c in named)]
    isempty(left) && return nothing
    kinds = unique(string(nameof(typeof(b))) for b in left)
    names = ["a " * k for k in kinds]
    list = length(names) == 1 ? only(names) : join(names[1:(end - 1)], ", ") * " and " * names[end]
    one = length(left) == 1
    @warn "masque: this figure has $(list) that masque wasn't given, so " *
        (one ? "it shows as a picture and the reader can use it" : "they show as pictures and the reader can use them") *
        " and nothing happens. " *
        (one ? "Name it to make it live" : "Name each one to make it live") *
        ", `masque(fig, (name = block,))`, or take it out of the figure."
    return nothing
end
