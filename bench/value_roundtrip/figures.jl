# Figures for roundtrip.mjs (#479): a click on a plain scatter, timed until the `@bind` value
# cell shows it. The notebooks next to this file show them; see roundtrip.mjs for the run.
plain(title = "") = (f = Figure(size = (400, 300)); scatter!(Axis(f[1, 1]; title), 1:5, (1:5) .^ 2); f)
# Image px of markers 0 and 1 of the widget's first layer.
function rt_coords(w)
    L = first(filter(l -> haskey(l, "geometry"), w.manifest["layers"]))
    g = L["geometry"]
    return [[g[1], g[2]], [g[4], g[5]]]
end
stamp(id, v) = HTML("<span class=\"rt\" id=\"$id\" data-t=\"$(time())\">$(length(repr(v)))</span>")
