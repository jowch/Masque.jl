# Writing style for the user docs

Applies to `docs/src/` and the README. The maintainer docs in `docs/dev/` can go into
mechanism; the user docs describe what the reader does and sees.

## Rules

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
7. **End with where to go next,** as a link.

## Examples

| Stilted | Straightforward |
|---|---|
| The overlay does the hit-testing, draws highlights and tooltips, and moves drag handles. | Tooltips and hover highlights appear in the browser, without re-running Julia. *(Or cut it, if the reader has just seen them.)* |
| Draw the figure the way you normally would. | Create a figure the way you normally would. |
| `pick === nothing ? … : …` | `isnothing(pick) ? … : …` |
| `pick.index` is 1-based, and `pick` indexes your data directly. | `pick.index` is the clicked point's position in the data you plotted, so `ys[pick]` is its `y`. |
| Masque does three things to a Makie figure you have already drawn: it decides which marks respond to the pointer, it shows information about a mark without re-running Julia, and it hands a deliberate choice back to your notebook through `@bind`. | Masque adds tooltips and click selection to a Makie figure. A click reaches the rest of your notebook through `@bind`. |
