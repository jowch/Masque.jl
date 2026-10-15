"""
    linkcameras!(axes::Axis3...; limits = false)
    linkcameras!(axes::AbstractVector{<:Axis3}; limits = false)

Turn several `Axis3` panels together: orbiting one gives the others the same azimuth and
elevation, so views of related 3D data stay lined up. In a widget, put the panels in one
figure: the ones with a [`ViewInteractable`](@ref) take the drag, and the others follow it.

With `limits = true`, zooming and panning one panel also zooms and pans the others. Use it
for panels that show the same coordinates, since every panel then shows the same data range.

When you call it, every panel takes the first one's camera (and limits, with
`limits = true`). If the first panel's limits are automatic, each panel keeps its own range
until the first zoom or pan, which gives them all the dragged panel's range. To line them up
from the start, set `limits` on the first panel.

The link is made of plain observables, so it also works in a GLMakie window. Linking the same
panel twice, or in overlapping groups, is fine.

# Examples
```julia
fig = Figure()
a1 = Axis3(fig[1, 1])
a2 = Axis3(fig[1, 2])
scatter!(a1, xs, ys, zs)
scatter!(a2, xs, ys, zs .^ 2)
linkcameras!(a1, a2)
masque(fig, ViewInteractable(a1), ViewInteractable(a2))
```
"""
function linkcameras!(axes::AbstractVector{<:Makie.Axis3}; limits::Bool = false)
    names = limits ? (:azimuth, :elevation, :limits) : (:azimuth, :elevation)
    for name in names
        _link_observables!([getproperty(ax, name) for ax in axes])
    end
    return nothing
end
linkcameras!(axes::Makie.Axis3...; limits::Bool = false) = linkcameras!(collect(axes); limits)
function linkcameras!(axes...; limits::Bool = false)
    bad = findfirst(ax -> !(ax isa Makie.Axis3), axes)
    throw(
        ArgumentError(
            "linkcameras! links Axis3 panels; argument $(bad) is a $(nameof(typeof(axes[bad]))). " *
                "To link 2D axes, use Makie's `linkaxes!`, `linkxaxes!`, or `linkyaxes!`.",
        ),
    )
end

# Each observable copies a new value to the others. `busy` stops the copies from firing the
# group's own listeners again, and the equality check stops a ring of overlapping groups.
function _link_observables!(obs)
    length(obs) < 2 && return nothing
    v0 = obs[1][]
    for o in obs[2:end]
        o[] == v0 || (o[] = v0)
    end
    busy = Ref(false)
    for o in obs
        Makie.on(o) do v
            busy[] && return
            busy[] = true
            try
                for other in obs
                    other === o || other[] == v || (other[] = v)
                end
            finally
                busy[] = false
            end
        end
    end
    return nothing
end
