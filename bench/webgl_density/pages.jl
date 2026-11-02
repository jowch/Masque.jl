# The `:webgl` canvas density numbers in docs/dev/perf-findings.md ("Canvas density (#548)"):
# writes one page per figure, at the old fixed `px_per_unit = 2` ("old") and at the default
# that follows `max_width` ("new"), and prints each canvas size and packed scene size. Then
# time the pages with canvas.mjs:
#   julia --project="${MASQUE_DEV_ENV:-$HOME/.julia/environments/masque-dev}" bench/webgl_density/pages.jl <outdir>
#   node bench/webgl_density/canvas.mjs <outdir>
using Masque, WGLMakie, Random
const Ext = Base.get_extension(Masque, :MasqueWGLMakieExt)
include(joinpath(@__DIR__, "..", "pluto_packed.jl"))
outdir = abspath(get(ARGS, 1, mktempdir())); mkpath(outdir)
cdn = Ext._wgl_cdn(pkgdir(WGLMakie), pkgversion(WGLMakie.Makie), Ext._bundle_text())
Ext._WGL_CDN[] = something(
    cdn, (;
        urls = ["https://cdn.jsdelivr.net/gh/MakieOrg/Makie.jl@v0.0.0/WGLMakie/src/javascript/WGLMakie.bundled.js"],
        integrity = "sha384-" * Masque.base64encode(Masque.sha384(Ext._bundle_text())), makie = v"0.0.0",
    )
)

function wide_axis()
    f = Figure(; size = (1600, 450)); ax = Axis(f[1, 1]; title = "wide 1600×450", xlabel = "time (s)", ylabel = "signal")
    x = range(0, 20; length = 400)
    lines!(ax, x, sin.(x); linewidth = 1.5); scatter!(ax, x[1:20:end], sin.(x[1:20:end]); markersize = 9, color = :red)
    text!(ax, 10, 0.8; text = "label text 0123", fontsize = 14)
    return f, ax
end
function wide_axis3()
    f = Figure(; size = (1600, 450)); ax = Axis3(f[1, 1]; title = "wide Axis3")
    t = range(0, 6π; length = 300); lines!(ax, cos.(t), sin.(t), t; linewidth = 2)
    scatter!(ax, cos.(t[1:25:end]), sin.(t[1:25:end]), t[1:25:end]; markersize = 10, color = :red)
    return f, ax
end
function maxw300()
    f = Figure(; size = (800, 600)); ax = Axis(f[1, 1]; title = "800×600, max_width 300")
    lines!(ax, 1:50, cumsum(randn(50))); scatter!(ax, 1:5:50, zeros(10); markersize = 10)
    return f, ax
end
cases = [("wide_axis", wide_axis, 700), ("wide_axis3", wide_axis3, 700), ("maxw_300", maxw300, 300)]
rows = String[]
for (name, mk, mw) in cases, (dens, ppu) in (("old", 2.0), ("new", nothing))
    Random.seed!(548)
    f, ax = mk()
    w = masque(f; backend = :webgl, max_width = mw, px_per_unit = ppu)
    html = sprint(show, MIME"text/html"(), w)
    packed = packed_bytes(w.scene)
    write(joinpath(outdir, "$(name)_$(dens).html"), """<!doctype html><html><head><meta charset="utf-8"><title>$name $dens</title></head><body>$html</body></html>""")
    push!(rows, "$(name)\t$(dens)\tppu=$(round(w.px_per_unit; digits = 4))\tcanvas=$(round(Int, size(f.scene)[1] * w.px_per_unit))x$(round(Int, size(f.scene)[2] * w.px_per_unit))\tdisplay=$(w.display_css)\tpacked=$(packed)\thtml=$(sizeof(html))")
end
write(joinpath(outdir, "cdn.txt"), join(Ext._wgl_cdn().urls, "\n"))
cp(Ext._wgl_bundle_path(), joinpath(outdir, "WGLMakie.bundled.js"); force = true)
foreach(println, rows)
