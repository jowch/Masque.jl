using Documenter
using Masque

if get(ENV, "MASQUE_SKIP_EMBED_EXPORT", "") == "true"
    @info "MASQUE_SKIP_EMBED_EXPORT set — reusing players already in src/embeds"
else
    include("export_embeds.jl")
    export_embeds(joinpath(@__DIR__, "src", "embeds"))
end

include("player_fallback.jl")

const PRETTY_URLS = get(ENV, "CI", "false") == "true"
const DOCS_BUILD = joinpath(@__DIR__, "build")
const EMBEDS_DIR = joinpath(@__DIR__, "src", "embeds")

# `@eval` entry point for a player's text twin. Harvest's `<name>.fallback.toml` adds the
# idle figure and readouts; without it (MASQUE_SKIP_EMBED_EXPORT on a fresh checkout) the
# twin still has every note and code cell.
function masque_fallback(name::AbstractString)
    side = joinpath(EMBEDS_DIR, name * ".fallback.toml")
    doc = isfile(side) ? TOML.parsefile(side) : Dict{String, Any}()
    image = haskey(doc, "image") && isfile(joinpath(EMBEDS_DIR, doc["image"])) ?
        embeds_href(doc["image"]; build = DOCS_BUILD, pretty = PRETTY_URLS) : nothing
    return fallback_markdown(
        joinpath(EMBEDS_DIR, name * ".jl");
        image, outputs = get(doc, "outputs", Dict{String, String}()),
    )
end

makedocs(;
    modules = [Masque],
    authors = "Jonathan Chen <jwhc@ucla.edu>",
    sitename = "Masque.jl",
    format = Documenter.HTML(;
        prettyurls = PRETTY_URLS,
        canonical = "https://jowch.github.io/Masque.jl",
        edit_link = "main",
        collapselevel = 2,
        assets = ["assets/masque-embed.css", "assets/masque-embed.js"],
    ),
    pages = [
        "Home" => "index.md",
        "Getting started" => "getting-started.md",
        "Concepts" => "concepts.md",
        "Guides" => [
            "Click marks" => "marks.md",
            "Tooltips" => "tooltips.md",
            "Inspect a grid" => "grids.md",
            "Selection" => "selection.md",
            "Brush a region" => "roi.md",
            "Legend" => "legend.md",
            "Read coordinates" => "readouts.md",
            "Pan and orbit" => "view.md",
            "Linked views" => "linked-views.md",
            "Custom hits" => "custom.md",
        ],
        "Gallery" => [
            "Gallery" => "gallery.md",
            "Tooltip templates" => "gallery/tooltips.md",
            "Selection round-trip" => "gallery/selection.md",
            "Bars and areas" => "gallery/bars.md",
            "Polygons" => "gallery/polygons.md",
            "Colorbar" => "gallery/colorbar.md",
            "Text labels" => "gallery/text.md",
            "Box-select scatter" => "gallery/boxselect.md",
            "Image ROI" => "gallery/image.md",
            "Limits slider" => "gallery/limits.md",
            "Drag to pan" => "gallery/pan.md",
            "Drag to orbit" => "gallery/orbit.md",
            "Polar points" => "gallery/polar.md",
        ],
        "Reference" => [
            "Supported plots and axes" => "support.md",
            "Constructors" => "constructors.md",
            "API" => "api.md",
            "Backends" => "backends.md",
            "Keyboard and screen readers" => "accessibility.md",
            "Troubleshooting" => "troubleshooting.md",
            "Contributing" => "contributing.md",
        ],
        "Advanced" => [
            "Performance" => "performance.md",
            "What Masque does not do" => "scope.md",
            "Overlay, bind, and the host" => "gestures.md",
        ],
    ],
    doctest = false,
    checkdocs = :exports,
    warnonly = false,
)

deploydocs(;
    repo = "github.com/jowch/Masque.jl",
    devbranch = "main",
    push_preview = false,
)
