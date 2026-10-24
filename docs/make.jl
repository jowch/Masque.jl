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
# twin still has every note and code cell. Under a segment's iframe, pass its `segment`.
function masque_fallback(name::AbstractString; segment = nothing)
    side = joinpath(EMBEDS_DIR, name * ".fallback.toml")
    doc = isfile(side) ? TOML.parsefile(side) : Dict{String, Any}()
    image = haskey(doc, "image") && isfile(joinpath(EMBEDS_DIR, doc["image"])) ?
        embeds_href(doc["image"]; build = DOCS_BUILD, pretty = PRETTY_URLS) : nothing
    return fallback_markdown(
        joinpath(EMBEDS_DIR, name * ".jl");
        image, outputs = get(doc, "outputs", Dict{String, String}()), segment,
    )
end

makedocs(;
    modules = [Masque],
    authors = "Jonathan Chen <jwhc@ucla.edu>",
    sitename = "Masque.jl",
    format = Documenter.HTML(;
        prettyurls = PRETTY_URLS,
        canonical = "https://jowch.github.io/Masque.jl/stable/",
        edit_link = "main",
        collapselevel = 2,
        assets = ["assets/masque-embed.css", "assets/masque-embed.js"],
        # The docs build from a checkout, so each `@example` widget on this page carries the
        # overlay script as well as its PNG (docs/dev/perf-findings.md, "Outside Pluto").
        size_threshold_ignore = ["publish.md"],
        # A Cairo widget also has a PNG form, which Documenter shows in place of HTML past this
        # size, so without it the page would show plain pictures.
        example_size_threshold = nothing,
    ),
    pages = [
        "Home" => "index.md",
        "Getting started" => "getting-started.md",
        "How Masque works" => "concepts.md",
        "Guides" => [
            "Show data on hover" => [
                "Tooltips" => "tooltips.md",
                "Read coordinates" => "readouts.md",
                "Slice across series" => "slice.md",
            ],
            "Send picks to your notebook" => [
                "What each mark returns" => "marks.md",
                "Selection" => "selection.md",
                "Brush a region" => "roi.md",
                "Heatmaps and images" => "grids.md",
                "Legend" => "legend.md",
            ],
            "Build a widget" => [
                "Build a widget" => "widgets.md",
                "Sliders, toggles and menus" => "controls.md",
                "Update the figure" => "onchange.md",
                "Linked views" => "linked-views.md",
            ],
            "Move around a figure" => [
                "Explore a 3D figure" => "explore-3d.md",
                "Pan, zoom and orbit" => "view.md",
            ],
            "Extend Masque" => [
                "Your own plot types" => "recipes.md",
                "Custom hits" => "custom.md",
            ],
        ],
        "Examples" => [
            "Examples" => "gallery.md",
            "Compare a cluster" => "gallery/cluster.md",
            "Threshold a mask" => "gallery/threshold.md",
            "Annotate a segmentation" => "gallery/segmentation.md",
            "From a heatmap cell to its trace" => "gallery/heatmap-trace.md",
            "Selection round-trip" => "gallery/selection.md",
            "Box-select scatter" => "gallery/boxselect.md",
            "Image ROI" => "gallery/image.md",
            "Plot types" => [
                "Bars and areas" => "gallery/bars.md",
                "Polygons" => "gallery/polygons.md",
                "Text labels" => "gallery/text.md",
            ],
        ],
        "Reference" => [
            "Supported plots and axes" => "support.md",
            "Constructors" => "constructors.md",
            "API" => "api.md",
            "Backends" => "backends.md",
            "Publish outside Pluto" => "publish.md",
            "Keyboard and screen readers" => "accessibility.md",
            "Performance" => "performance.md",
            "Current design and rough edges" => "design.md",
            "Troubleshooting" => "troubleshooting.md",
            "Upgrading" => "upgrading.md",
        ],
        "Contributing" => "contributing.md",
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
