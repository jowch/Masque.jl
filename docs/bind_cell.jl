# Whether `code` is the cell that binds `bond`. `@bind pick` must not match `@bind picks`
# or `@bind pick_right`, and a `md"..."` note that names `@bind pick` in its prose is not
# the cell. Harvest (`export_embeds.jl`) and the text twin (`player_fallback.jl`) both
# include this file.
function is_bind_cell(code::AbstractString, bond)
    startswith(lstrip(code), "md\"") && return false
    return occursin(Regex("@bind\\s+" * string(bond) * raw"(?![\w!])"), code)
end
