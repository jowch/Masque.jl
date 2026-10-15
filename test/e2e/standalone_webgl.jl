# Write a plain HTML page of two WGLMakie widgets shown the way they show outside Pluto, in
# Documenter or a page written with `show` (#300). Each fetches WGLMakie's script from the
# Makie release tag, checked against a hash. test/e2e/standalone_webgl.mjs serves the
# installed copy at those URLs, so the page tests this checkout without the network.
#
#   julia --project=<env with Masque + WGLMakie> test/e2e/standalone_webgl.jl <outdir>

using Masque, WGLMakie

const Ext = Base.get_extension(Masque, :MasqueWGLMakieExt)

outdir = abspath(get(ARGS, 1, mktempdir()))
mkpath(outdir)

# A `Pkg.develop`ed WGLMakie inlines its script; point it at the CDN the way a registered
# install would.
cdn = Ext._wgl_cdn(pkgdir(WGLMakie), pkgversion(WGLMakie.Makie), Ext._bundle_text())
Ext._WGL_CDN[] = something(
    cdn, (;
        urls = [
            "https://cdn.jsdelivr.net/gh/MakieOrg/Makie.jl@v0.0.0/WGLMakie/src/javascript/WGLMakie.bundled.js",
            "https://raw.githubusercontent.com/MakieOrg/Makie.jl/v0.0.0/WGLMakie/src/javascript/WGLMakie.bundled.js",
        ],
        integrity = "sha384-" * Masque.base64encode(Masque.sha384(Ext._bundle_text())),
    ),
)

widget(f) = sprint(show, MIME"text/html"(), f)
fig1 = Figure(; size = (400, 260))
scatter!(Axis(fig1[1, 1]), [1, 2, 3, 4], [1, 4, 9, 16]; markersize = 14)
fig2 = Figure(; size = (600, 300))
heatmap!(Axis(fig2[1, 1]), reshape(Float64.(1:400), 20, 20))
scatter!(Axis3(fig2[1, 2]), [Point3f(i, i^2 % 7, i % 3) for i in 1:20])

html1, html2 = widget(masque(fig1; backend = :webgl)), widget(masque(fig2; backend = :webgl))
write(
    joinpath(outdir, "page.html"),
    """
    <!doctype html><html><head><meta charset="utf-8"><title>Masque WebGL</title></head><body>
    $(html1)
    $(html2)
    </body></html>
    """,
)
write(joinpath(outdir, "cdn.txt"), join(Ext._wgl_cdn().urls, "\n"))
cp(Ext._wgl_bundle_path(), joinpath(outdir, "WGLMakie.bundled.js"); force = true)
println("wrote ", joinpath(outdir, "page.html"), " (", sizeof(html1), " + ", sizeof(html2), " bytes)")
