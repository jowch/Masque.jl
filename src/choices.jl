# Radio buttons and labelled checkboxes (#592). Makie has a lone `Checkbox` and no group of
# options, so masque defines two blocks with Makie's own `@Block`: each lays out a `Checkbox` and
# a `Label` per option in its own grid, as Makie's `SliderGrid` lays out sliders. They work as
# plain Makie (GLMakie, WGLMakie, a saved PNG), and `masque` draws each group as one control.
#
# `@Block` writes code that names Makie's types and helpers without the `Makie.` prefix, and
# exports the block from the module it runs in; this module brings those names in and Masque
# re-exports the two blocks. It leans on Makie internals, so test/makie_compat_tests.jl checks it.
module Choices

    using Makie: Makie, Figure, Scene, GridLayout, Attributes, theme, Observable, Block, Checkbox,
        Label, make_block_docstring, to_value, Auto, Inside, on, automatic, Automatic, colgap!, rowgap!
    import Makie: initialize_block!

    const _ACCENT = Makie.COLOR_ACCENT

    """
        RadioGroup(fig[i, j]; options, default = 1, ...)

    A set of round buttons, one per option, of which one is chosen. `options` takes strings, or
    `(label, value)` tuples, as `Menu` does. `default` is the option chosen at the start: an index,
    an option's label, or `nothing` for none. `selection` holds the chosen option's value
    (`nothing` before any), and `i_selected` its index (0 before any).

    The buttons take `Checkbox`'s look settings; their labels take `fontsize`, `font` and
    `labelcolor`. `orientation = :horizontal` puts the options in a row.
    """
    Makie.@Block RadioGroup begin
        @forwarded_layout
        buttons::Vector{Checkbox}
        labels::Vector{Label}
        @attributes begin
            "The options: strings, or `(label, value)` tuples. Read when the block is made."
            options = ["option"]
            "The option chosen at the start: an index, an option's label, or `nothing`. Read when the block is made."
            default = 1
            "Index of the chosen option, 0 for none."
            i_selected::Int = 0
            "Value of the chosen option, `nothing` for none. The output to listen to."
            selection = nothing
            "`:vertical` stacks the options; `:horizontal` puts them in a row. Read when the block is made."
            orientation = :vertical
            "Space between options; `automatic` is 4 stacked, 14 in a row."
            gap = automatic
            "Space between a button and its label."
            labelgap = 5
            "The button's size across."
            size = 11
            "The dot's size, as a share of the button."
            checkmarksize = 0.45
            "The button's outline width."
            checkboxstrokewidth = 1.5
            "The button's fill when chosen."
            checkboxcolor_checked = _ACCENT[]
            "The button's fill when not chosen."
            checkboxcolor_unchecked = @inherit(:backgroundcolor, :white)
            "The button's outline when chosen."
            checkboxstrokecolor_checked = _ACCENT[]
            "The button's outline when not chosen."
            checkboxstrokecolor_unchecked = _ACCENT[]
            "The dot's colour when chosen."
            checkmarkcolor_checked = :white
            "The dot's colour when not chosen, which Makie shows under the pointer."
            checkmarkcolor_unchecked = :transparent
            "The labels' text size."
            fontsize = @inherit(:fontsize, 16.0f0)
            "The labels' font."
            font = :regular
            "The labels' colour."
            labelcolor = @inherit(:textcolor, :black)
        end
    end

    """
        CheckboxGroup(fig[i, j]; options, default = [], ...)

    A list of checkboxes, one per option, any number of which can be ticked. `options` takes
    strings, or `(label, value)` tuples, as `Menu` does. `default` is the options ticked at the
    start: indices or option labels. `selection` holds the ticked options' values, in option
    order, and `checked` one `Bool` per option.

    The boxes take `Checkbox`'s look settings; their labels take `fontsize`, `font` and
    `labelcolor`. `orientation = :horizontal` puts the options in a row.
    """
    Makie.@Block CheckboxGroup begin
        @forwarded_layout
        buttons::Vector{Checkbox}
        labels::Vector{Label}
        @attributes begin
            "The options: strings, or `(label, value)` tuples. Read when the block is made."
            options = ["option"]
            "The options ticked at the start: an index or label, or a vector of them. Read when the block is made."
            default = Int[]
            "One `Bool` per option: whether it is ticked."
            checked = Bool[]
            "Values of the ticked options, in option order. The output to listen to."
            selection = Any[]
            "`:vertical` stacks the options; `:horizontal` puts them in a row. Read when the block is made."
            orientation = :vertical
            "Space between options; `automatic` is 4 stacked, 14 in a row."
            gap = automatic
            "Space between a box and its label."
            labelgap = 5
            "The box's size across."
            size = 11
            "The checkmark's size, as a share of the box."
            checkmarksize = 0.85
            "The checkmark: anything `scatter` takes as a marker."
            checkmark = Makie.CHECKMARK_BEZIER
            "How round the box is: 0 is square, 1 a circle."
            roundness = 0.15
            "The box's outline width."
            checkboxstrokewidth = 1.5
            "The box's fill when ticked."
            checkboxcolor_checked = _ACCENT[]
            "The box's fill when not ticked."
            checkboxcolor_unchecked = @inherit(:backgroundcolor, :white)
            "The box's outline when ticked."
            checkboxstrokecolor_checked = _ACCENT[]
            "The box's outline when not ticked."
            checkboxstrokecolor_unchecked = _ACCENT[]
            "The checkmark's colour when ticked."
            checkmarkcolor_checked = :white
            "The checkmark's colour when not ticked, which Makie shows under the pointer."
            checkmarkcolor_unchecked = :transparent
            "The labels' text size."
            fontsize = @inherit(:fontsize, 16.0f0)
            "The labels' font."
            font = :regular
            "The labels' colour."
            labelcolor = @inherit(:textcolor, :black)
        end
    end

    const ChoiceGroup = Union{RadioGroup, CheckboxGroup}

    # The ticked options' values, as a vector of their common type (`String` for plain options),
    # empty or not.
    _ticked(opts, ticks) = [optionvalue(o) for o in opts][Bool[t for t in ticks]]

    optionlabel(o) = Makie.optionlabel(o)
    optionvalue(o) = Makie.optionvalue(o)
    options(g::ChoiceGroup) = collect(to_value(g.options))

    # An option named by its index or its label.
    function _option_index(g, opts, d)
        d isa Integer && !(d isa Bool) && 1 <= d <= length(opts) && return Int(d)
        if d isa AbstractString
            i = findfirst(o -> optionlabel(o) == d, opts)
            i === nothing || return i
        end
        T = nameof(typeof(g))
        throw(ArgumentError("$T: `default` names no option: $(repr(d)); give an index from 1 to $(length(opts)) or an option's label"))
    end

    # Each option's button and label, in its own cells: a row each when stacked, or one row of
    # button, label, button, label… With `gap` automatic, options sit 4 apart stacked, 14 in a row.
    function _lay_out!(g::ChoiceGroup, opts, look)
        g.buttons = Checkbox[]
        g.labels = Label[]
        isempty(opts) && throw(ArgumentError("$(nameof(typeof(g))): `options` is empty"))
        across = g.orientation[] === :horizontal
        for (i, o) in enumerate(opts)
            r, c = across ? (1, 2i - 1) : (i, 1)
            b = Checkbox(g.layout[r, c]; look...)
            l = Label(
                g.layout[r, c + 1], optionlabel(o); halign = :left, fontsize = g.fontsize,
                font = g.font, color = g.labelcolor,
            )
            push!(g.buttons, b)
            push!(g.labels, l)
        end
        on(g.blockscene, g.gap; update = true) do gap
            if across
                for i in 1:(2length(opts) - 1)
                    colgap!(g.layout, i, isodd(i) ? g.labelgap[] : (gap isa Automatic ? 14 : gap))
                end
            else
                colgap!(g.layout, 1, g.labelgap[])
                length(opts) > 1 && rowgap!(g.layout, gap isa Automatic ? 4 : gap)
            end
        end
        on(_ -> notify(g.gap), g.blockscene, g.labelgap)
        return nothing
    end

    _look(g) = (
        size = g.size, checkmarksize = g.checkmarksize, checkboxstrokewidth = g.checkboxstrokewidth,
        checkboxcolor_checked = g.checkboxcolor_checked, checkboxcolor_unchecked = g.checkboxcolor_unchecked,
        checkboxstrokecolor_checked = g.checkboxstrokecolor_checked,
        checkboxstrokecolor_unchecked = g.checkboxstrokecolor_unchecked,
        checkmarkcolor_checked = g.checkmarkcolor_checked, checkmarkcolor_unchecked = g.checkmarkcolor_unchecked,
    )

    function initialize_block!(g::RadioGroup)
        opts = options(g)
        _lay_out!(g, opts, (; _look(g)..., roundness = 1, checkmark = :circle))
        d = g.default[]
        k = d === nothing ? 0 : _option_index(g, opts, d)
        # A click on a button chooses it; one on the chosen button keeps it, as a radio does.
        for (i, b) in enumerate(g.buttons)
            b.onchange[] = _ -> (g.i_selected[] == i || (g.i_selected[] = i); true)
        end
        last = Ref(k)
        on(g.blockscene, g.i_selected) do k
            if !(0 <= k <= length(opts))
                # Put the last good index back before throwing, so the block never holds one.
                g.i_selected.val = last[]
                throw(ArgumentError("RadioGroup: `i_selected` must be from 0 to $(length(opts)), got $k"))
            end
            last[] = k
            for (j, b) in enumerate(g.buttons)
                b.checked[] == (j == k) || (b.checked[] = j == k)
            end
            v = k == 0 ? nothing : optionvalue(opts[k])
            g.selection[] === v || (g.selection[] = v)
        end
        g.i_selected[] = k
        notify(g.i_selected)
        return
    end

    function initialize_block!(g::CheckboxGroup)
        opts = options(g)
        _lay_out!(g, opts, (; _look(g)..., roundness = g.roundness, checkmark = g.checkmark))
        start = falses(length(opts))
        ds = g.default[]
        # One index or label on its own names one option; a string is not a list of characters.
        for d in (ds isa Union{AbstractString, Integer} ? (ds,) : ds)
            start[_option_index(g, opts, d)] = true
        end
        on(g.blockscene, g.checked) do ticks
            length(ticks) == length(opts) || throw(
                ArgumentError("CheckboxGroup: `checked` needs one Bool per option ($(length(opts))), got $(length(ticks))"),
            )
            for (b, t) in zip(g.buttons, ticks)
                b.checked[] == t || (b.checked[] = t)
            end
            g.selection[] = _ticked(opts, ticks)
        end
        # A click on a box flips it, and the group follows.
        for (i, b) in enumerate(g.buttons)
            on(g.blockscene, b.checked) do t
                ticks = g.checked[]
                ticks[i] == t && return
                new = copy(ticks)
                new[i] = t
                g.checked[] = new
            end
        end
        g.checked[] = Vector{Bool}(start)
        return
    end

end # module Choices

using .Choices: RadioGroup, CheckboxGroup, ChoiceGroup
