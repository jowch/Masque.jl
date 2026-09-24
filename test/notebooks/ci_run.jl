# Headlessly run every Pluto notebook in this directory and fail if any cell errors.
# Gallery demos are docs embed notebooks, harvested by docs/export_embeds.jl.
# This gate keeps the API fixtures honest (point/segment/rect/polygon/axis, the
# WebGL kitchen sink, view sliders and drag, polar points on WGLMakie).
#
# Run locally:  julia test/notebooks/ci_run.jl
# Each notebook manages its own env (Pkg.develop the package + add whichever Makie
# backend it needs), so this runner only needs Pluto itself.

import Pkg
Pkg.activate(; temp = true)
Pkg.add(name = "Pluto", version = "0.20")   # pin major; the notebooks declare v0.20.x
using Pluto

const HEADER = "### A Pluto.jl notebook ###"
is_notebook(p) = isfile(p) && endswith(p, ".jl") && startswith(readline(p), HEADER)

dirs = [@__DIR__]
notebooks = String[]
for d in dirs
    isdir(d) || continue
    append!(notebooks, filter(is_notebook, readdir(d; join = true)))
end
notebooks = sort(notebooks)
isempty(notebooks) && error("no Pluto notebooks found in $(join(dirs, ", "))")
@info "Found $(length(notebooks)) notebook(s)" names = basename.(notebooks)

failed = String[]
for path in notebooks
    name = basename(path)
    @info "▶ running $name"
    session = Pluto.ServerSession()
    session.options.server.disable_writing_notebook_files = true   # never mutate the committed file
    nb = Pluto.SessionActions.open(session, path; run_async = false)
    errored = [c for c in nb.cells if c.errored]
    for c in errored
        firstline = first(split(strip(string(c.code)), '\n'))
        @error "cell errored in $name" code = firstline output = string(c.output.body)
    end
    Pluto.SessionActions.shutdown(session, nb)
    isempty(errored) ? (@info "✓ $name ran clean") : push!(failed, name)
end

isempty(failed) ||
    error("fixture notebook(s) with errored cells: $(join(failed, ", "))")
@info "All fixture notebooks ran clean ✓"
