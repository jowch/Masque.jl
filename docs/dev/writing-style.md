# Writing style for the user docs

Applies to `docs/src/` (including the prose cells of the embedded notebooks in
`docs/src/embeds/`), the README, and docstrings that render on the API page. The
maintainer docs in `docs/dev/` can go into mechanism; the user docs describe what the reader
does and sees. Use US spelling ("color"), matching the API's keywords.

## Content

1. **Write from the reader's side.** Say what they do and what happens on screen, not what
   Masque does internally. Hit-testing, projection, manifests, and the JS layer belong in
   `docs/dev/`, unless the reader has to act on them.
2. **Describe interactions as cause and effect.** The reader thinks about what a click
   changes, not about when Julia runs: "cells that use the variable respond", not "every cell
   that reads it re-runs". Mention Julia running only where its absence changes what the
   reader sees (a static export).
3. **Say what a value means to the reader, not its technical property.** A Julia user
   assumes 1-based indexing; what they need is which element the index points at.
4. **Contrast only with what the reader would expect.** "`A[win]` is an empty matrix rather
   than an error" helps: the reader might expect an error. "Templates, not functions" and
   "known problems rather than design choices" answer questions nobody asked. Say what the
   reader can do, and give a constraint only where they would hit it.
5. **Don't state what the reader already assumes.** "In a running notebook everything above
   works" tells them nothing.
6. **No announcements.** Skip "This page explains…" and "so that the guides read as…".
   Start with what the reader gets, then show it.
7. **Point to the reference.** When a sentence mentions a set of options or defaults, link
   the page that lists them.
8. **End with where to go next,** as a link.

## Wording

9. **Use the reader's word, and one word per concept.** See the terms table below. A word
   that only makes sense if you know Masque's internals (chrome, echo, wash, "lands",
   "authoritative") is one of ours, not the reader's; name what they see instead.
10. **Don't list three things when one or two carry the point.** No row of parallel verbs
    describing a component's duties, and no third item added for rhythm.
11. **Keep the main point out of asides.** If it matters, give it its own sentence. In prose,
    end the sentence or use a colon instead of an em dash; em dashes are only for empty
    table cells.
12. **Avoid the words in the list below.** They are the most common signs of LLM-written
    text, and each has a plainer word.

## Formatting

13. **Headings name the topic plainly.** "How interactions work", not a row of verbs like
    "Hover, click, and drag", and not an adjective pitch like "Rich tooltips".
    A heading that matches another page's title breaks every `[Title](@ref)` link to that
    page; give it an explicit id: `## [Backends](@id home-backends)`.
14. **No bold labels at the start of list items.** Use a plain list, or a table when each
    item has a name and a description. Bold is for a term's first use or a UI label.

## Examples

15. **Show it in code, in code a new Julia user can read.** When a sentence tells the reader
    to do something in Julia, follow it with the snippet. Use literal values over
    comprehensions, splats, and chained calls: the example teaches Masque, not Julia.
    Write the idiom the reader already uses (`isnothing(x)`, not `x === nothing`).

## Terms

| Say | Not |
|---|---|
| tooltip | card, tip |
| hover, hover over | hold the pointer over |
| plot, figure | surface |
| selected highlight | wash, click-echo |
| the tooltip's style; the ROI box and its handles | chrome |
| send, return, give | hand, hand back |
| move to, reach | land on |
| create a figure | draw a figure |
| click | make a deliberate choice, commit |
| shows | surfaces |

## Words to avoid

additionally, align with, boast, bolster, crucial, delve, emphasize, enduring, enhance,
foster, garner, interplay, intricate, key (as an adjective), landscape, leverage, meticulous,
pivotal, robust, seamless, serves as, showcase, stands as, tapestry, testament, underscore,
valuable, vibrant, "not only … but", "it's worth noting".

Source: [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).

## Before and after

| Stilted | Straightforward |
|---|---|
| The overlay does the hit-testing, draws highlights and tooltips, and moves drag handles. | Tooltips and hover highlights appear in the browser, without re-running Julia. *(Or cut it, if the reader has just seen them.)* |
| Draw the figure the way you normally would. | Create a figure the way you normally would. |
| `pick === nothing ? … : …` | `isnothing(pick) ? … : …` |
| `pick.index` is 1-based, and `pick` indexes your data directly. | `pick.index` is the clicked point's position in the data you plotted, so `ys[pick]` is its `y`. |
| Tooltips are templates, not functions | Tooltips are templates |
| A `masque"..."` template arranges them your way. | A `masque"..."` template lets you customize what it says. |
| Hover, click, and drag | How interactions work |
| Clicking a mark sets the `@bind` variable, and every cell that uses it re-runs. | Clicking a mark updates the `@bind` variable, and cells that use the variable respond to the change. |
| Until the first click or release, the bound variable is `nothing`. | A `masque` widget's `@bind` value starts as `nothing`. |
| In a running notebook everything above works. A static HTML export has no Julia behind it. | A static HTML export of your notebook keeps tooltips and highlights. Other cells do not respond, because the export has no Julia behind it. |
| `rows = [(; r..., density = round(r.pop / r.area; digits = 1)) for r in rows]` | `rows = [(city = "Lyon", density = round(522_250 / 47.9)), …]`, written out |
| Payload values are always escaped, so your data cannot add HTML to the tooltip. | Avoid putting HTML in your payload values. It will not be rendered. To make something bold, use the template instead. *(Then show both in code.)* |
| See Tooltip chrome | See Tooltip styling |
| Masque does three things to a Makie figure you have already drawn: it decides which marks respond to the pointer, it shows information about a mark without re-running Julia, and it hands a deliberate choice back to your notebook through `@bind`. | Masque adds tooltips and click selection to a Makie figure. A click reaches the rest of your notebook through `@bind`. |
