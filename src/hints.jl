# Error hints for the forms removed in 0.4 (#374). Calling one still raises the plain
# `MethodError`; Julia prints these lines under it, naming the form to use instead. They add
# no methods, so nothing dispatches to an old call.
# Delete this file, its `_register_error_hints()` call in `__init__`, and
# `test/core/hints_tests.jl` in 0.5.0.

function _register_error_hints()
    Base.Experimental.register_error_hint(_removed_method_hint, MethodError)
    return nothing
end

# `kwargs` is a `Pairs` on Julia 1.10 and a vector of `(name, type)` on later versions; `first`
# reads the name from either. Julia unwraps a keyword call before it reaches the hint, so `f` is
# the function itself, not `Core.kwcall`.
function _removed_method_hint(io, exc, argtypes, kwargs)
    kws = Symbol[first(kw) for kw in kwargs]
    hint = _removed_form_hint(exc.f, kws)
    hint === nothing || print(io, "\n", hint)
    return nothing
end

# The 0.2 flat tooltip keywords, deprecated in 0.3. `masque` hands its keywords to `_masque`,
# so that is the call that fails.
const _REMOVED_TOOLTIP_KEYS = (:bg, :color, :accent, :font, :font_size, :radius, :caret)

function _removed_form_hint(f, kws)
    f === _masque || return nothing
    given = [k for k in _REMOVED_TOOLTIP_KEYS if Symbol("tooltip_", k) in kws]
    isempty(given) && return nothing
    old = join(("`tooltip_$k`" for k in given), ", ")
    new = join(("$k = …" for k in given), ", ")
    return "$old $(length(given) > 1 ? "were" : "was") removed in Masque 0.4. " *
        "Use `tooltipstyle = (; $new)` instead."
end
