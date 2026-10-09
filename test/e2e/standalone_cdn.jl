# Write a plain HTML page of two CairoMakie widgets shown the way a registered install shows
# them outside Pluto: each loads the overlay script from jsDelivr, pinned to a release and
# checked against a hash (#311). test/e2e/standalone_cdn.mjs serves the local bundle at that
# URL, so the page tests this checkout's script.
#
#   julia --project=<env with Masque + CairoMakie> test/e2e/standalone_cdn.jl <outdir>

using Masque, CairoMakie

outdir = abspath(get(ARGS, 1, mktempdir()))
mkpath(outdir)

# A checkout inlines the bundle; point it at the CDN the way a registered install would.
version = v"0.0.0"
Masque._OVERLAY_CDN[] = (;
    url = "https://cdn.jsdelivr.net/gh/jowch/Masque.jl@v$(version)/assets/overlay.js",
    integrity = "sha384-" * Masque.base64encode(Masque.sha384(Masque._OVERLAY_JS[])),
)

widget(f) = sprint(show, MIME"text/html"(), f)
fig1 = Figure(; size = (400, 260))
scatter!(Axis(fig1[1, 1]), [1, 2, 3, 4], [1, 4, 9, 16]; markersize = 14)
fig2 = Figure(; size = (400, 260))
lines!(Axis(fig2[1, 1]), 0:0.5:5, sin.(0:0.5:5))

write(
    joinpath(outdir, "page.html"),
    """
    <!doctype html><html><head><meta charset="utf-8"><title>Masque CDN</title></head><body>
    $(widget(masque(fig1)))
    $(widget(masque(fig2)))
    </body></html>
    """,
)
write(joinpath(outdir, "cdn.txt"), Masque._OVERLAY_CDN[].url)
println("wrote ", joinpath(outdir, "page.html"))
