# Writing style for the user docs

Applies to `docs/src/` and the README. The maintainer docs in `docs/dev/` can go into
mechanism; the user docs describe what the reader does and sees.

## Rules

Use US spelling ("color"), matching the API's keywords.
Don't say "chrome" for what the overlay draws; name the thing (the tooltip's style, the ROI
box and its handles).

1. **Write from the reader's side.** Say what they do and what happens on screen, not what
   Masque does internally. Hit-testing, projection, manifests, and the JS layer belong in
   `docs/dev/`, unless the reader has to act on them.
2. **Use the plain word.** "Create a figure", not "draw"; "click", not "make a deliberate
   choice"; "shows", not "surfaces". Write the Julia idiom the reader already uses
   (`isnothing(x)`, not `x === nothing`).
3. **Say what a value means to the reader, not its technical property.** A Julia user
   assumes 1-based indexing; what they need is which element the index points at.
4. **One point per sentence.** Don't list a component's duties in a row of parallel verbs,
   and don't add a third item for rhythm.
5. **No announcements.** Skip "This page explains…" and "so that the guides read as…".
   Start with what the reader gets, then show it.
6. **Keep the main point out of asides.** If it matters, give it its own sentence instead of
   a parenthesis or a dash clause.
7. **Don't define a thing by what it isn't.** "Templates, not functions" answers a question
   only the designers asked. Say what the reader can do, and give the constraint only where
   they would hit it.
8. **Headings name the topic plainly.** "How interactions work", not a row of verbs like
   "Hover, click, and drag".
9. **Describe interactions as cause and effect.** The reader thinks about what a click
   changes, not about when Julia runs: "cells that use the variable respond", not "every cell
   that reads it re-runs". Mention Julia running only where its absence changes what the
   reader sees (a static export).
10. **Show it in code.** When a sentence tells the reader to do something in Julia, follow it
    with the snippet.
11. **Point to the reference.** When a sentence mentions a set of options or defaults, link
    the page that lists them.
12. **Don't state what the reader already assumes.** "In a running notebook everything above
    works" tells them nothing.
13. **Write examples a new Julia user can read.** Literal values over comprehensions, splats,
    and chained calls. The example teaches Masque, not Julia.
14. **End with where to go next,** as a link.

## Examples

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
| Masque does three things to a Makie figure you have already drawn: it decides which marks respond to the pointer, it shows information about a mark without re-running Julia, and it hands a deliberate choice back to your notebook through `@bind`. | Masque adds tooltips and click selection to a Makie figure. A click reaches the rest of your notebook through `@bind`. |
