module MasqueDataFramesExt

using Masque
using DataFrames

function Masque.expand_payloads(df::DataFrame, n, who)
    nrow(df) == n || throw(ArgumentError("$who: payloads has $(nrow(df)) rows, expected $n"))
    return collect(Any, eachrow(df))
end

# A row merges onto the mark's default payload like a named tuple (#308).
Masque._merge_payload(d::NamedTuple, row::DataFrameRow) = Masque._merge_payload(d, copy(row))

# Column selectors match DataFrames' own signatures so these methods are strictly more
# specific than `getindex(::DataFrame, ::Integer/::AbstractVector, …)` and not ambiguous
# with them. `Base.to_index` does not make `df[ev, :]` work: DataFrames 1.7 requires the
# row to be an `Integer`.
function Base.getindex(df::DataFrame, ev::Masque.ElementEvent, col_ind::DataFrames.ColumnIndex)
    return df[ev.index, col_ind]
end
function Base.getindex(df::DataFrame, ev::Masque.ElementEvent, col_inds::DataFrames.MultiColumnIndex)
    return df[ev.index, col_inds]
end
function Base.getindex(df::DataFrame, evs::AbstractVector{Masque.ElementEvent}, col_ind::DataFrames.ColumnIndex)
    return df[Int[ev.index for ev in evs], col_ind]
end
function Base.getindex(df::DataFrame, evs::AbstractVector{Masque.ElementEvent}, ::Colon)
    return df[Int[ev.index for ev in evs], :]
end
function Base.getindex(
        df::DataFrame, evs::AbstractVector{Masque.ElementEvent}, col_inds::DataFrames.MultiColumnIndex,
    )
    return df[Int[ev.index for ev in evs], col_inds]
end

end
