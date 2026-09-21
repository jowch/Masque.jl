using Documenter
using Masque

include("export_notebooks.jl")
export_notebooks(joinpath(@__DIR__, "src", "notebooks"))

if get(ENV, "MASQUE_SKIP_EMBED_EXPORT", "") == "true"
    @info "MASQUE_SKIP_EMBED_EXPORT set — reusing players already in src/embeds"
else
    include("export_embeds.jl")
    export_embeds(joinpath(@__DIR__, "src", "embeds"))
end

makedocs(;
    modules = [Masque],
    authors = "Jonathan Chen <jwhc@ucla.edu>",
    sitename = "Masque.jl",
    format = Documenter.HTML(;
        prettyurls = get(ENV, "CI", "false") == "true",
        canonical = "https://jowch.github.io/Masque.jl",
        edit_link = "main",
        collapselevel = 2,
        assets = ["assets/masque-embed.css"],
    ),
    pages = [
        "Home" => "index.md",
        "Getting started" => "getting-started.md",
        "Guides" => [
            "Hover, click, and bind" => "gestures.md",
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
        "Examples" => "examples.md",
        "Reference" => [
            "Constructors" => "constructors.md",
            "API" => "api.md",
            "Backends" => "backends.md",
            "Keyboard and screen readers" => "accessibility.md",
            "Troubleshooting" => "troubleshooting.md",
            "Contributing" => "contributing.md",
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
