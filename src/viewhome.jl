# Where a view starts from, so a reset can go back to it (#524).
#
# A pan writes `ax.limits[]` (`_apply_view_frame`), so after the first drag the limits the
# author wrote, often `nothing` for automatic, are gone, and `reset_limits!` alone would go
# back to the dragged ones. Re-running only the `masque` cell keeps them too. So Julia keeps a
# home for each axis object the first time a view is planned on it: the `limits` attribute as
# written (its `nothing` entries kept) and, on an `Axis3`, the azimuth and elevation.
#
# `left` is the pose Masque last left the axis in. A later `masque` call on the same axis keeps
# the home while the axis is still where Masque left it; an axis that is somewhere else was
# moved by the author (`xlims!` in another cell), and that becomes its new home.
mutable struct _ViewHome
    home::Tuple
    left::Tuple
end

const _VIEW_HOMES = WeakKeyDict{Any, _ViewHome}()

_is_axis3(ax) = hasproperty(ax, :azimuth) && hasproperty(ax, :elevation)

# What a reset puts back. `limits[]` is compared and restored as the attribute holds it.
_view_pose(ax) = _is_axis3(ax) ?
    (ax.limits[], Float64(ax.azimuth[]), Float64(ax.elevation[])) :
    (ax.limits[],)

# The axes a reset on `ax` puts back: the axis, and on a 2D axis every axis `linkaxes!`,
# `linkxaxes!` or `linkyaxes!` tied to it, since a pan writes their limits too (#363). Panels
# tied by `linkcameras!` share observables, so they follow the axis's own writes.
_view_reset_axes(ax) = ax isa Makie.Axis ? unique!(Any[ax; union(_axis_links(ax)...)]) : Any[ax]

# Called each time `masque` plans a widget, before the first frame can move anything.
function _record_view_homes!(interactables)
    for i in interactables
        i isa ViewInteractable || continue
        for ax in _view_reset_axes(i.ax)
            pose = _view_pose(ax)
            rec = get(_VIEW_HOMES, ax, nothing)
            if rec === nothing || !isequal(rec.left, pose)
                _VIEW_HOMES[ax] = _ViewHome(pose, pose)
            end
        end
    end
    return nothing
end

# After a frame moved the camera: each axis is where Masque left it.
function _note_view_left!(view_axes)
    for ax in values(view_axes), a in _view_reset_axes(ax)
        rec = get(_VIEW_HOMES, a, nothing)
        rec === nothing || (rec.left = _view_pose(a))
    end
    return nothing
end

# The warmup's frames are thrown away and the camera put back; so is where Masque left it.
_view_left_snapshot(view_axes) =
    [(rec, rec.left) for ax in values(view_axes) for a in _view_reset_axes(ax) for rec in (get(_VIEW_HOMES, a, nothing),) if rec !== nothing]

function _restore_view_left!(saved)
    for (rec, left) in saved
        rec.left = left
    end
    return nothing
end

# Whether the view on `ax`, or an axis a reset on it would put back, is away from its home.
function _view_moved(ax)
    for a in _view_reset_axes(ax)
        rec = get(_VIEW_HOMES, a, nothing)
        rec === nothing || isequal(rec.home, _view_pose(a)) || return true
    end
    return false
end

# Put the view on `ax` back where it started: each axis's home limits as written, so automatic
# limits are automatic again, and the camera angles on an `Axis3`.
function _reset_view!(ax)
    axes = _view_reset_axes(ax)
    for a in axes
        rec = get(_VIEW_HOMES, a, nothing)
        rec === nothing && continue
        home = rec.home
        if _is_axis3(a)
            a.azimuth[] == home[2] || (a.azimuth[] = home[2])
            a.elevation[] == home[3] || (a.elevation[] = home[3])
        end
        isequal(a.limits[], home[1]) || (a.limits[] = home[1])
    end
    # After every home is written: an axis still on automatic limits reads its linked axes'.
    for a in axes
        Makie.reset_limits!(a)
    end
    return nothing
end
