# Error hints for the forms removed in 0.3 (#299). Calling one still raises the plain
# `MethodError` or `UndefVarError`; Julia prints these lines under it, naming the 0.3 form.
# They add no methods, so nothing dispatches to an old call.

function _register_error_hints()
    Base.Experimental.register_error_hint(_removed_method_hint, MethodError)
    Base.Experimental.register_error_hint(_removed_name_hint, UndefVarError)
    return nothing
end

# `kwargs` is a `Pairs` on Julia 1.10 and a vector of `(name, type)` on later versions; `first`
# reads the name from either. Julia unwraps a keyword call before it reaches the hint, so `f` is
# the constructor itself, not `Core.kwcall`.
function _removed_method_hint(io, exc, argtypes, kwargs)
    f = exc.f
    kws = Symbol[first(kw) for kw in kwargs]
    hint = _removed_form_hint(f, collect(Any, argtypes), kws)
    hint === nothing || print(io, "\n", hint)
    return nothing
end

function _removed_form_hint(f, argtypes, kws)
    if f === RectInteractable
        if length(argtypes) == 2 && argtypes[2] isa Type &&
                argtypes[2] <: Union{Makie.Heatmap, Makie.Image}
            return "`RectInteractable(ax, p)` for a heatmap or image was removed in Masque 0.3. " *
                "Use `GridInteractable(ax, p)` instead."
        elseif length(argtypes) == 1 && :grid in kws
            return "`RectInteractable(ax; grid = …)` was removed in Masque 0.3. " *
                "Use `GridInteractable(ax, xedges, yedges, values)` instead."
        elseif length(argtypes) == 1 && :rects in kws
            return "`RectInteractable(ax; rects = …)` was removed in Masque 0.3. " *
                "Pass the shapes second: `RectInteractable(ax, rects)`."
        end
    elseif f === RegionInteractable
        if length(argtypes) == 1 && :regions in kws
            return "`RegionInteractable(ax; regions = …)` was removed in Masque 0.3. " *
                "Pass the shapes second: `RegionInteractable(ax, regions)`."
        end
    elseif f isa Type && f <: AbstractBackend && isempty(argtypes) && !isempty(kws)
        # The extensions' backend types, reached through `Base.get_extension` in 0.1 and 0.2.
        name = nameof(f)
        if name === :CairoBackend
            return "`CairoBackend(; max_width)` was removed in Masque 0.3. " *
                "Use `masque(fig; backend = :cairo, max_width)` instead."
        elseif name === :WebGLBackend
            return "`WebGLBackend(; px_per_unit, max_width)` was removed in Masque 0.3. " *
                "Use `masque(fig; backend = :webgl, px_per_unit, max_width)` instead."
        end
    end
    return nothing
end

function _removed_name_hint(io, exc)
    exc.var === :auto_interactables || return nothing
    print(io, "\n`auto_interactables` was removed in Masque 0.3. Use `interactables(fig)` instead.")
    return nothing
end
