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
   works" tells them nothing. Don't explain Pluto either: why hover doesn't re-run cells
   is obvious to a Pluto user and no help to someone who hasn't met `@bind`.
6. **No announcements.** Skip "This page explains…" and "so that the guides read as…".
   Start with what the reader gets, then show it.
7. **Point to the reference.** When a sentence mentions a set of options or defaults, link
   the page that lists them.
8. **One page owns each fact.** Explain a behavior once, on the page a reader would look
   for it, and link there from everywhere else with one clause. A caveat repeated on five
   pages buries each page's own point, and the copies drift.
9. **Common case first, exceptions last.** Open with what the reader does and what they
   get. Edge cases, errors, and limits come after the basic case works, and only where a
   reader would hit them. State what a feature does, not what it can't do, unless the
   reader would expect it to.
10. **Pair a limit with what to do instead.** When the reader would expect something Masque
    does not do, say what happens, then how to get what they wanted, in the same paragraph:
    "A click selects one mark and replaces the previous selection. To select several marks
    at once, drag a box over them." A limit on its own reads as a refusal.
11. **Say what the reader does and sees in prose, and keep the API detail in tables.** A
    paragraph that walks through type names, keywords and return values in the order the code
    handles them reads as a changelog. Open with what the reader does and what they get, and
    put each type with what it takes and what it returns in a table they can scan.
12. **Keep each note next to what it is about.** A limit of the docs player (a clip that
    can't run Julia, a control the player doesn't draw) sits beside that player, not in the
    page's limitations. A limitations section covers only the package, so a reader can trust
    that everything in it applies to their own notebook.
13. **Introduce each concept once, in reading order.** The first page a reader meets a
    concept on explains it; later pages use it with a short backlink for readers who land
    there directly: "With `onchange` (see [Update the figure](@ref)), …". Don't explain it
    again, and don't use it on a page before the one that introduces it.
14. **End with where to go next,** as a link.

## Wording

When a sentence needs cutting, rewrite it so it still reads as a whole
sentence a person would say. Deleting words in place leaves fragments
like "Pass the other two yourself.", where the reader has to work out
what "the other two" are.

15. **Keep a cause and its effect in one sentence.** Join them with "so", "and", or a colon
    rather than splitting every clause into its own sentence. "Tooltips and highlights
    respond in the browser without Julia, so they are instant" reads as one thought;
    "Tooltips work in the browser. They are instant." reads as two facts the reader has to
    connect. A paragraph of short sentences is choppy, not plain: plain is about the words,
    not the sentence length.
16. **Write it the way you would say it to someone sitting next to you.** Use full sentences
    with their articles and linking words, and open an instruction with what it is for:
    "To reach the points, pass in your own list of the interactables you want, with the
    scatter before the polygon." Shorthand like "Pass the interactables yourself, points
    first:" and formal words like "desired" make the page read like a spec, even when every
    fact in it is right.
17. **Use the reader's word, and one word per concept.** See the terms table below. A word
   that only makes sense if you know Masque's internals (chrome, echo, wash, "lands",
   "authoritative") is one of ours, not the reader's; name what they see instead.
18. **Don't list three things when one or two carry the point.** No row of parallel verbs
    describing a component's duties, and no third item added for rhythm.
19. **Keep the main point out of asides.** If it matters, give it its own sentence. In prose,
    end the sentence or use a colon instead of an em dash; em dashes are only for empty
    table cells.
20. **Avoid the words in the list below.** They are the most common signs of LLM-written
    text, and each has a plainer word.

## Formatting

21. **Headings name what the reader wants, in their words.** A guide section is a task: a
    verb and the thing the reader acts on, such as "Select several marks" or "Choose which
    plots an entry highlights". A reference or explanation section is a noun phrase, such as
    "Keyboard shortcuts" or "Supported axes", or a "What …" or "How …" phrase that reads as
    a clear question, such as "What a click returns" or "How interactions work". Don't write
    an idiom ("Let picks add up"), a claim ("Tooltips are templates"), a fragment that
    misreads ("Which marks an entry highlights"), a row of verbs ("Hover, click, and drag"),
    or a pitch ("Rich tooltips"), and use the terms table, so *select*, not *pick*. Give the
    same kind of section the same name on every page: "Supported axes", "Limitations",
    "Where to go next". In Troubleshooting, name the error or the symptom: "A click does
    nothing".
    A heading that matches another page's title breaks every `[Title](@ref)` link to that
    page; give it an explicit id: `## [Backends](@id home-backends)`. Renaming a heading
    breaks every `[Heading](@ref)` link to it, so search `docs/src` and `src` for the old
    text.
22. **No bold labels at the start of list items.** Use a plain list, or a table when each
    item has a name and a description. Bold is for a term's first use or a UI label.
23. **Use short paragraphs, not bullets, when each item needs a reason or a way around it.**
    A bullet invites a clipped fragment; a paragraph of two or three sentences has room for
    what happens and what to do about it. Keep lists for short, parallel items that need no
    explanation, such as a set of known gaps each followed by a link.

## Examples

24. **Show it in code, in code a new Julia user can read.** When a sentence tells the reader
    to do something in Julia, follow it with the snippet. Use literal values over
    comprehensions, splats, and chained calls: the example teaches Masque, not Julia.
    Write the idiom the reader already uses (`isnothing(x)`, not `x === nothing`).
25. **Frame a fix with what the reader sees.** Before the snippet, say what goes wrong in
    terms of the screen ("hovering a point shows the polygon's tooltip"). After it, say
    what is different now, and any catch the change brings with it ("only the plots you
    list are interactive"). A snippet introduced by an instruction alone ("Pass the
    interactables yourself, points first:") leaves the reader to work out why it helps.

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
| select (a mark) | pick, in prose and headings (`pick` as a variable name is fine) |
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
| Tooltips are templates, not functions | Tooltip templates |
| A `masque"..."` template arranges them your way. | A `masque"..."` template lets you customize what it says. |
| Hover, click, and drag | How interactions work |
| Clicking a mark sets the `@bind` variable, and every cell that uses it re-runs. | Clicking a mark updates the `@bind` variable, and cells that use the variable respond to the change. |
| Until the first click or release, the bound variable is `nothing`. | A `masque` widget's `@bind` value starts as `nothing`. |
| In a running notebook everything above works. A static HTML export has no Julia behind it. | A static HTML export of your notebook keeps tooltips and highlights. Other cells do not respond, because the export has no Julia behind it. |
| `rows = [(; r..., density = round(r.pop / r.area; digits = 1)) for r in rows]` | `rows = [(city = "Lyon", density = round(522_250 / 47.9)), …]`, written out |
| Payload values are always escaped, so your data cannot add HTML to the tooltip. | Avoid putting HTML in your payload values, because the tooltip shows the tags as plain text instead of rendering them. To make something bold, use the template instead. *(Then show both in code.)* |
| See Tooltip chrome | See Tooltip styling |
| Hovering never changes a `@bind` value. Tooltips and highlights work in the browser alone, so they are instant. | Tooltips and highlights respond in the browser without Julia, so they are instant. The `@bind` value changes only when you click. |
| You select one mark at a time. A click replaces the selection, and there is no Shift-click or Ctrl-click to add to it. | A click selects one mark and replaces the previous selection. To select several marks at once, drag a box over them with an `ROIInteractable`. |
| Pass the interactables yourself, points first: | To reach the points, pass in your own list of the interactables you want, with the scatter before the polygon: *(after a sentence saying what goes wrong, and followed by what changes)* |
| This page explains how Masque behaves today, so you can plan around it. | *(Cut it. Start with the first behavior.)* |
| Masque does three things to a Makie figure you have already drawn: it decides which marks respond to the pointer, it shows information about a mark without re-running Julia, and it hands a deliberate choice back to your notebook through `@bind`. | Masque adds tooltips and click selection to a Makie figure. A click reaches the rest of your notebook through `@bind`. |
