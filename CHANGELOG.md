# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `ThresholdInteractable` takes a `Colorbar`: drag a line across the bar to set a cutoff on the
  colorbar's scale, `identity`, `log10` or `log`. The line follows the bar, horizontal on a
  vertical colorbar and vertical on a horizontal one, and hovering or clicking the rest of the
  bar still reads its value (#499).
- Hovering a line on an `Axis3` shows `x`, `y` and `z` of the point you plotted nearest the
  pointer, as a line on a 2D `Axis` does, and a tooltip template can name `z`. This covers
  `lines!`, `scatterlines!`'s line, `contour3d!` and a 3D `streamplot!`. A click still picks
  the whole line (#502).

## [0.4.4] - 2026-11-01

### Fixed
- `masque` takes what `scatter(x, y)` or `scatter(fig[1, 1], …)` returns, as the figure it
  drew into. Before, it failed with a Makie field error. Anything else that isn't a `Figure`
  gets a message saying to pass the figure (#501).
- A `ThresholdInteractable` or `ROIInteractable` on a `Colorbar` is refused with a message
  that names `ColorbarInteractable`, instead of a Makie field error (#498).
- After `masque(fig; backend = :webgl)`, plots can be added to the figure again. Before,
  `lines!` and the like failed with "Screen Session uninitialized". Adding a plot after
  `masque` isn't recommended, though: the widget may not show it. See "A plot added after
  `masque` doesn't show" in
  [Troubleshooting](https://jowch.github.io/Masque.jl/stable/troubleshooting/) (#508).
- A `scatter!` sized in data units (`markerspace = :data`) on an `Axis3` responds to hover
  and clicks. Before, it was skipped with a warning. One with a `marker_offset` is still
  skipped, with a warning that says why (#511).
- When a plot on an `Axis3` or a `PolarAxis` is skipped, the warning links to the Supported
  plots and axes page. Before, it pointed to a maintainer document (#511).
- The error for a figure with an `LScene` says how to get an `Axis3` instead:
  `surface(z)`, `scatter(x, y, z)` and other 3D calls draw in an `LScene` unless given
  `axis = (; type = Axis3)` (#521).

## [0.4.3] - 2026-10-31

### Changed
- A Makie `Menu` named in `masque` is drawn the way Makie draws it, in place of the browser's
  own list: a press opens Makie's list of options under the menu, or over it when there is
  more room above or `direction = :up`, in its cell and text colours, with its pale arrow.
  Makie's menu is `searchable` by default, so typing in the open menu keeps the options whose
  label holds the text, ignoring case, with its `search_placeholder`; a menu with its own
  `filter` warns that the browser uses this rule instead. Arrow keys, Home, End, Enter, Escape
  and typing a label's first letters work it from the keyboard (#429).

### Fixed
- A plot drawn with `visible = false` is left alone when a series is picked or hovered: the
  fade no longer covers its path, which left gaps in the gridlines under it. A hidden plot
  also takes no hover or clicks now when the call has no `onchange`, as it already did with
  one (#484).
- A large block of cells picked on a grid of small cells is outlined inside its edge, like any
  other area 12 px or more across. Before, the outline went by the grid's smallest cell, so it
  sat on the edge and spilled onto the neighbouring cells. Lone cells and one-cell-wide strokes
  stay outlined on their edge, so their colour still shows (#463).
- A mark hidden under a legend stays hidden: its hover ring, pick outline and fade no longer
  draw over the legend, and the pointer inside the legend no longer shows its tooltip, picks it,
  or reads the axis under the legend. The keyboard and a box selection still reach it. A legend
  with no background, or a mostly see-through one, still shows the marks under it and lets the
  pointer reach them (#437, #472).
- The text of a `Menu`, `Button`, `Textbox` or `SliderGrid` value label is in the font Makie
  draws it in, so it matches the rest of the figure. Before, it was in Helvetica or Arial. For
  Makie's own fonts the browser downloads each font file once, about 33 KB for the regular one,
  and only on a page showing one of these controls; offline it keeps Helvetica or Arial. A font of your own is
  used if the reader has it installed (#476).
- Hovering a line plot with many points keeps up with the pointer: a figure of 100 000 points
  no longer drops frames as the pointer crosses its lines (#469).
- A faded line stays faded where it crosses a line or mark that stays in focus. It used to show at
  full strength at each crossing (#462).
- A plot holding thousands of picked segments or polyline pieces stays quick to click and to
  hover. Since 0.4.2 each pick's outline carried its own mask, so with 5 000 segments held a
  click took about a second and hovering could stall the page for seconds. A click now changes
  only the outline of the pick it adds or takes out, for every kind of pick. Where two picked
  lines cross, one's outline no longer paints over the other (#478).

## [0.4.2] - 2026-10-30

### Added
- A Makie `SliderGrid` named in `masque` works in the notebook: its field holds a tuple of its
  sliders' values, in order, and each value label follows its slider, written with the grid's
  own `format`. A grid that `masque` isn't given warns, as before (#430).
- A Makie `Button` named in `masque` works in the notebook, drawn as Makie draws it, with its
  hover and pressed colours. Its field counts the clicks. With `onchange`, each click also sets
  the button's `clicks`, so code listening to it runs. A button that `masque` isn't given warns,
  as before (#431).
- A Makie `Textbox` named in `masque` works in the notebook, drawn as Makie draws it. Its field
  holds the text the reader last entered with Enter, or `nothing` before any. A `Regex` or
  number-type `validator` and the `restriction` are checked as the reader types; a function
  `validator` is checked on Enter, and text it refuses leaves the field as it was; without
  `onchange` the box can't learn that, so `masque` warns. A text box that `masque` isn't given
  warns, as before (#433).
- `linked(plots...)` makes plots that draw the same rows one selection: clicking a mark in
  any of them selects its row in all of them, and hovering a mark outlines the same row on the
  others. The `@bind` field holds the row's position, or with `key = :id` the `id` of its
  payload, so plots that order or split the rows differently still pair up, and an axis
  stands for every plot on it. With `select = :many` the field holds several rows, and a box
  or a legend entry picks many at once. `selected=` takes the rows, and
  `interactables(plot; key = vector)` gives a plot keys of its own (#346).
- `interactables(plot)` works on a recipe Masque builds from the plots it draws, such as
  `contour!`, `tricontourf!` or `rainclouds!`. It returns the layers `masque(fig)` gives the
  recipe, under the same ids, so `masque(fig, interactables(c), ViewInteractable(ax);
  auto = false)` keeps a contour and adds a pan. Before, it raised an error.
- `overlaystyle` takes `preview_opacity`, how much of the other marks still shows while you
  hover a line or a legend entry and nothing is picked, from 0 to 1 (default 0.35).

### Changed
- A tooltip near the figure's edge can now extend past the figure onto the page around it,
  instead of being pushed back over the plot. It still sits above the mark, and moves below
  it or sideways only at the edge of the browser window. In browsers without the Popover API
  (before Safari 17 and Firefox 125) it stays inside the figure as before.
- Highlights read on any colour. The outline on a hovered or picked mark, a focused mark, a
  picked heatmap cell or region, and a picked point on a line is now a dark line between two
  light ones (light between dark on a dark figure), where it was one grey that vanished on
  mid-tone cells. It sits inside a cell, bar or shape, so neighbouring outlines never overlap,
  and outside a marker, so the marker keeps its colour. It is one screen pixel per band:
  1.5 px for hover and 2 px for a pick on a high-density screen, 3 and 4 px on a standard one.
  `overlaystyle` `color`, `hover_width` and `selected_width` still set it.
- Lines fade like other plots. Hovering a line fades the other lines and marks the point the
  tooltip reads out, instead of drawing grey over the whole line. Hovering or picking a legend
  entry fades the other lines too, and the picked line keeps its own colour instead of a grey
  wash. Hovering a legend entry no longer outlines each of its points. A line with a
  `hoverstyle` stroke gets that colour on the dot, not along the whole line.
- A hover preview (a legend entry's or a line's) fades the rest less than a pick does: 35%
  of them still shows, against 20% for a pick.
- The first widget in a session shows in under a second instead of after 15 to 25 s, and
  its first pick, pan or orbit answers right away instead of after several seconds. Masque
  now compiles that work when it is installed, which takes about 2 minutes longer, once per
  backend. To turn this off, see the troubleshooting page.

### Fixed
- On `backend = :webgl`, a line with gaps, such as a `contour!` or a `lines!` with `NaN`
  points, breaks at each gap, and so does a zero on a log axis. Before, each gap drew a straight
  line to the axis origin (#439).
- A click on a colorbar or an axis readout now gives the value its tooltip shows. Before,
  it could be off by up to half a pixel, such as `9.525` against a tooltip's `9.500` (#448).
- A figure with a Makie `Button`, `Textbox` or `SliderGrid` that `masque` isn't given now
  warns that it shows as a picture and won't respond. Before, it looked live and did
  nothing (#426).
- A Makie `Toggle` named in `masque` is drawn the way Makie draws it: a vertical or angled
  toggle (`orientation`) stands the right way, and `length`, `markersize`, `rimfraction` and
  `toggleduration` carry over. Before, every toggle was a horizontal pill stretched over its
  box (#427).
- A Makie `Menu` named in `masque` shows its own `prompt` before a choice, instead of
  "Select…", and its `fontsize`, `textcolor`, `textpadding` and
  `selection_cell_color_inactive` carry over to the closed menu (#429).
- A Makie `Checkbox` named in `masque` is drawn the way Makie draws it: its `size`,
  `roundness`, stroke, both box and checkmark colours and its `checkmark` marker carry over,
  and the checkmark shows in its unchecked colour under the pointer. Only the square takes the
  pointer, as in Makie. Makie's `onchange` on a checkbox does nothing in `masque`, where a
  click always flips the box, and `masque` warns once when a named checkbox has one (#428,
  #457).
- A legend entry over `select = :many` plots picks their marks when `bind` leaves the legend
  out, as in `bind = :picked`. Before, the click did nothing.
- On a focused figure, Cmd or Ctrl or Alt with an arrow key, Home, End, Page Up or Page Down
  now goes to the browser, so Cmd-Left (Back on a Mac) and Alt-Left (Back elsewhere) work.
  A bare arrow or Shift with an arrow still moves through the marks (#404).
- While a pan or zoom preview is showing, a second axis drawn over the one you pan, such as a
  twin y axis in the same cell or an inset, keeps its selection rings, threshold lines, ROI
  boxes and slice readout on its own marks, and hover, click and drags find them there. A
  threshold line, ROI box or box selection on an axis tied by `linkaxes!` in a cell of its
  own moves with that axis instead of with the one you pan. On a twin tied by `linkxaxes!`,
  the axis you pan now follows the pointer up and down as well as across; the twin's marks
  move the same way until the new frame arrives (#391).

## [0.4.1] - 2026-10-24

### Added
- `overlaystyle` takes `unpicked_opacity`, how much of an unpicked mark still shows once
  its plot has a pick, from 0 to 1 (default 0.2) (#394).
- With a figure focused, Cmd-Z (on a Mac) or Ctrl-Z (elsewhere) undoes the last change to the
  selection, whether a click, a box, a legend click, or Escape made it, and Shift-Cmd-Z,
  Shift-Ctrl-Z, or Ctrl-Y redoes it. Each step changes the `@bind` value once. Undo covers the
  selection only, and with nothing to undo the key reaches the page as before. Escape that
  clears a selection now keeps the figure focused, so an undo can follow, and a second Escape
  leaves the figure (#386).

### Changed
- A pick on a scatter, bar, polygon, text or violin plot keeps its own color and the plot's
  other marks fade, instead of a grey highlight over the pick. A pick with no other pick next
  to it gets a thin outline in a shade of its own color, so it stands out among faded marks.
  The fade also shows a legend entry's series while you hover it. With thousands of picks the
  plot now reads at a glance where the highlights covered it
  ([before](docs/src/assets/selection-look-before.png),
  [after](docs/src/assets/selection-look-after.png)), and a click on such a plot redraws
  faster. Lines keep their ring, and heatmap cells and regions their outline (#394).

### Fixed
- After a click on a figure, a Cmd or Ctrl shortcut, such as undo, no longer draws the
  keyboard focus outline around it. Keys that move through the figure still do (#402).
- While a pan or zoom preview is showing, hovering or clicking a mark on an axis tied to the
  view by `linkaxes!`, or on any other axis, finds the mark where it is drawn. A mark on
  another axis couldn't be hovered or clicked until the new frame arrived, and a linked axis
  with a different scale answered at the wrong point (#379).

## [0.4.0] - 2026-10-22

### Added
- A CairoMakie widget has a PNG form, `show(io, MIME"image/png"(), w)`, so a tool that reads a
  notebook without a browser, such as an AI agent, can see the figure. Pluto still shows the
  live figure. Printed in the REPL, a widget now gives a short summary instead of its fields:
  each axis with its title, each layer with what it draws, the gestures it takes and its
  tooltip fields, and the `@bind` value it starts with. A WGLMakie widget has the summary but
  no PNG, since the browser draws it (#373).

### Changed
- **Breaking:** on a plot built with `select = :many`, a click adds the mark or cell to the
  selection, or takes it out when it is already selected, so a stray click no longer throws
  the rest of the selection away. It used to replace the selection with the one mark, and
  only Cmd-click or Ctrl-click added to it; now both do the same. The same goes for a whole
  region of a grid built with `regions`, for Enter on a focused mark, and for a legend entry
  whose legend holds several picks. A box drawn by dragging adds what it covers, or takes it
  out when the drag starts on a selected mark, where a plain drag used to replace the
  selection. A click on an empty part of the plot now keeps the selection too; to start
  over, press Escape. A plot with the default `select = :one` still clears its pick on an
  empty click (#358, #384).
- On a Documenter page, a CairoMakie widget shows as a plain picture unless the build sets
  `example_size_threshold = nothing`: Documenter prefers a picture to an output larger than
  8 KB, and every widget is. The build log warns when it does (#373).

### Fixed
- While you pan or zoom a view, a selected or hovered mark on an axis tied to it by
  `linkaxes!` keeps its ring, which slides with that axis's data. A ring on any other axis
  stays where it is. Both used to disappear until the new frame arrived (#368).
- A click on a figure gives it keyboard focus, so Escape clears the selection and the arrow
  keys work. A click on a `select = :many` plot, or anywhere on a plot you can pan, orbit, or
  drag a line or box on, used to leave the figure unfocused, and Escape did nothing until you
  pressed Tab. The click does not scroll the page (#380).

### Removed
- **Breaking:** the keywords `tooltip_bg`, `tooltip_color`, `tooltip_accent`, `tooltip_font`,
  `tooltip_font_size`, `tooltip_radius`, and `tooltip_caret`, deprecated in 0.3, are gone.
  Passing one raises a `MethodError` whose message names the `tooltipstyle` form, such as
  `tooltipstyle = (; bg = …)`. `tooltip_sigdigits` stays (#374).
- **Breaking:** a `Slider`, `Toggle`, `Checkbox`, `IntervalSlider` or `Menu` laid out in the
  figure but not named in the `masque` call is an `ArgumentError`, where 0.3.1 warned. Name
  it, `masque(fig, (name = block,))`, or take it out of the figure. A `SliderGrid` stays a
  picture (#374).
- The error messages that named the 0.3 replacement for a form removed in 0.3, such as
  `RectInteractable(ax; grid = …)` or `auto_interactables`, are gone. The calls raise the same
  errors as before, without the hint; the 0.3.0 entry below lists the replacements (#374).

## [0.3.1] - 2026-10-16

### Added
- A WGLMakie widget shown outside Pluto, in Documenter or in an HTML page written with
  `show(io, MIME"text/html"(), w)`, draws its figure and keeps its tooltips and highlights,
  where it used to show a box saying it is drawn only in Pluto. As with CairoMakie, a click
  highlights a mark but sets no `@bind` value, and orbiting or panning the view needs Pluto
  (#300).

  The page loads WGLMakie's script, about 1 MB, once from jsDelivr (or GitHub when jsDelivr
  is down), from the release of your installed Makie, checked against your copy's hash.
  Read offline, or if the published script differs from your copy, each figure shows a note
  in its box saying which. Each figure writes its scene into the page, so a Documenter page
  with one goes in `size_threshold_ignore`. A WGLMakie installed with `Pkg.develop` writes
  the script into each widget instead.
- `linkcameras!(ax1, ax2, ...)` turns several `Axis3` panels together: orbiting one turns
  the others to the same azimuth and elevation. With `limits = true`, zooming and panning
  are shared too. Add a `ViewInteractable` to each panel you want to drag (#362).
- A heatmap or image built with `select = :many` can start with cells selected:
  `selected = (region = mask,)` takes a `Bool` matrix the size of the plotted matrix, and
  also a `GridSelection`, `CartesianIndex`es, or linear indices. The cells start highlighted
  and in the `@bind` value, so a selection saved to a file can be loaded back, and a
  Cmd-click or Ctrl-click takes one out like any other. A mask of the wrong size raises an
  `ArgumentError` (#356).
- A heatmap or image takes `regions`, a matrix of whole numbers the size of the plotted one
  that gives each cell a region id, such as the labels of a segmentation. Cells that share
  an id act as one: hovering outlines the whole region, and on a `select = :many` grid a
  click, Cmd-click, or Ctrl-click picks or drops the whole region, and a box picks every
  region it touches. `GridSelection` gains `regions`, the ids of the regions it holds whole,
  and a click on a grid that picks one cell carries the region's id in `GridCellEvent`'s
  `region`. Cells with id `0` act alone, as before (#359).
- `masque(fig, ...; onchange = state -> ...)` changes the figure as the reader works the
  widget, without running the cell again, so picks, controls and the view stay put. `state`
  has a field for every plot you can pick from and every control, named as in the `@bind`
  value, and a field `bind` leaves out still reaches `onchange`. The function changes plots
  that already exist, with Makie's `update!`; it runs once before the figure first shows, then
  after every click and release, and while a threshold or box moves. `update_while_dragging =
  false` on a `ThresholdInteractable` or `ROIInteractable` waits for the release. A plot whose
  number of marks changes loses its picks. Works on both backends (#334).
- Makie's `Slider`, `IntervalSlider`, `Toggle`, `Checkbox` and `Menu` work in the notebook:
  name one in `masque` (`masque(fig, (freq = sl,))`) and the reader gets a real control where
  the figure's layout put it. Its field holds the block's plain value: the slider's value,
  `(lo, hi)`, `true`/`false`, or the menu's selection. With `onchange` the figure follows the
  control as it moves (`update_while_dragging = false` waits for the release), and the block's
  own value is set first, so `on(sl.value)` and `@lift` code keeps working. A block in the
  figure that `masque` isn't given stays a picture, with a warning (#345).

### Fixed
- Where marks of one plot overlap, hover and click answer with the one drawn on top. On a 2D
  `Axis` that is the one listed last: a later `scatter!` marker, `text!` label or `poly!`
  shape no longer loses to an earlier one hidden under it (#340). On an `Axis3`, the
  `meshscatter!` sphere nearer the camera answers on both backends, and so does the nearer
  `scatter!` marker with `backend = :webgl`; CairoMakie draws `scatter!` markers in the order
  you give them, so the last one listed answers there (#331).
- A `series!` works again under Makie 0.24.16, which draws its lines one level further down
  and without their default `series k` names: hover and click on a `PolarAxis`, a slice
  readout over it, and its legend links find the lines, and the tooltip names each line as
  before. A legend whose entries Makie leaves unlabelled (and so doesn't draw) no longer stops
  the figure from building, and a legend with no drawn entries gets no hover or click layer
  (#361).
- Panning an axis tied to others with `linkaxes!`, `linkxaxes!`, or `linkyaxes!` moves them
  all. Before, the pan did nothing. While you drag, the data in the linked axes slides along
  with the axis you hold (#363).

## [0.3.0] - 2026-10-10

### Added
- A `surface!` on an `Axis3` responds to hover and click. Hovering shows the data point
  under the pointer, its `i`, `j`, `x`, `y`, and `z`, and `value` when `color` is a separate
  matrix, always from the side of the surface you can see. A click binds a `GridCellEvent`,
  so `z[pick]` reads the point. A very fine grid is thinned to about one point every four
  screen pixels, and a `wireframe!` over the same grid is left as decoration. While you
  orbit, the surface's highlight hides and comes back on release. `SurfaceInteractable`
  builds one by hand (#259).
- `text!` on an `Axis3` responds to hover and click, so a label can be picked like the point
  it names. Where labels overlap, the one drawn on top answers: the nearest with
  `backend = :webgl`, and the one listed last with CairoMakie, which draws labels in order. A
  label outside the axis limits isn't drawn and doesn't respond. Its default payload adds the
  anchor's `z` (#292).
- `masque(fig; tooltipstyle = (; bg = :black, color = :white, radius = 6))` sets the tooltip
  card's look in one keyword, like `overlaystyle` does for the overlay. Its keys are `bg`,
  `color`, `accent`, `font`, `font_size`, `radius`, and `caret`; an unknown key, or a value
  of the wrong kind, raises an `ArgumentError` (#305).
- An ROI's `selects` takes the plot it brushes, as in `ROIInteractable(ax; bounds, selects = sc)`,
  so you no longer need to know which scatter became `:scatter_2`. A plot that
  draws both lines and points, such as `scatterlines`, gives the box its points. A layer id
  still works (#302).
- A `ViewInteractable` on an `Axis3` zooms as well as orbits: scroll, or press `+` / `-`,
  to zoom around the middle of the axis box, and Shift+drag, or Shift with an arrow key, to
  pan. As in Makie, the box keeps its size and the limits change, so marks outside the new
  limits are hidden and stop responding to hover and clicks. A line that crosses the edge
  of the box still responds along the part that is drawn (#321).
- `interactables(sc; select = :many)` lets a reader select several marks of a plot: its
  `@bind` field is a `Vector{ElementEvent}`, empty to start. A click replaces the selection
  with one mark, and Cmd-click on a Mac, or Ctrl-click elsewhere, adds a mark or takes it
  out. With the keyboard, Cmd+Enter or Ctrl+Enter does the same. Legends and
  `AxisInteractable` take `select = :many` too and hold a vector of their events, and so do
  the constructors for points, bars, polygons, segments, lines, text and regions; heatmap,
  image and surface cells don't take it yet. `selected = (scatter = [1, 3],)` starts with
  several marks selected. A colorbar's pick is one value, so `select = :many` on one raises an
  `ArgumentError` (#335).
- A heatmap or image built with `interactables(hm; select = :many)`, or
  `GridInteractable(ax, hm; select = :many)`, lets a reader select any set of cells: its
  `@bind` field is a `GridSelection`, a `BitMatrix` of the selected cells the size of the
  plotted matrix, empty to start. `img[sel.region]` gives the selected values,
  `findall(sel.region)` the cells, and `sel.region.mask` the matrix. A click selects one cell,
  Cmd-click on a Mac or Ctrl-click elsewhere adds a cell or takes it out, and a click on empty
  plot space or Escape clears it. The selected cells are drawn as one highlighted area with
  an outline around its edge (#335).
- On a plot with `select = :many`, dragging across the plot selects every mark whose centre
  is inside the box (a line's data points inside it, a heatmap's cells it touches), replacing
  the selection; Cmd-drag on a Mac, or Ctrl-drag elsewhere,
  adds them, and takes them out when the drag starts on a selected mark. On a plot that pans
  or orbits, a plain drag still moves the view and Alt-drag draws the box; Alt-drag works on
  every plot; Escape drops the box. A finger drag still scrolls the page, so the box is drawn
  with a mouse or pen. A legend click selects every mark of its entry's plot, Cmd-click or
  Ctrl-click adds them, and clicking a selected entry again takes them out (#335).

### Changed
- **Breaking:** `payloads` add to a mark's own data instead of replacing it. A scatter
  point given `(; name = "a")` now has `name`, `x`, and `y` in its tooltip and `@bind`
  value, so labelling points no longer means copying the coordinates into each payload. The
  same goes for every mark with its own data, such as a bar's `low`, `high`, and `value`,
  and for `DataFrame` rows and `Dict`s. A field the payload names itself wins, and `index`
  is not added, since `pick.index` already holds it. A payload that isn't key-value, such
  as a bare string, still replaces the default (#308).

  Two things change in existing notebooks. A default tooltip that showed only your fields
  now also shows the mark's, such as `x` and `y`; to show only yours, pass a `tooltip`
  template that names them. And a payload that passes its own `x` (or `y`) for something
  other than the plotted coordinate, such as a category name, now sits next to the mark's
  other coordinate, and on a line it takes the place of the `x` the hover reads out from
  the nearest point. Rename that field if you want both.
- **Breaking: the `@bind` value is now a `NamedTuple` with one field for each thing a reader
  can set in the figure, so every notebook that reads it changes.** Each plot that takes
  clicks gets a field, and so does each control you pass (a threshold, an ROI box). A field
  is named by the plot's layer id, so code that read `sel.index` now reads
  `sel.scatter.index`, and a figure with two scatters gives `sel.scatter` and
  `sel.scatter_2`, each holding its own pick. Clicking one plot no longer clears the other's
  pick. Before, one widget held one value, so a click anywhere replaced it (#335):

  ```julia
  @bind sel masque(fig)       # before: sel was an ElementEvent or nothing
  sel.scatter                 # now: one field per plot, an ElementEvent or nothing
  ```

  To get one value back, name it with `bind`: `masque(fig; bind = sc)`, with `sc` the plot
  `scatter!` returned, makes `sel` that plot's `ElementEvent` or `nothing` again, and
  `bind = thr` makes it the threshold's `ThresholdEvent`. `bind` also takes several, as a
  tuple of plots, interactables or field names (`bind = (sc, :cutoff)`), and a `NamedTuple`
  that names the fields where you list them: `bind = (left = sc1, right = sc2)` gives
  `sel.left` and `sel.right`, and the events carry those names as their `layer`. A
  `NamedTuple` argument names interactables the same way, as in
  `masque(fig, (cutoff = thr,))`. An object given two different names, by `id`, by a
  `NamedTuple` argument or by `bind`, raises an `ArgumentError`. Plots and fields left out
  of `bind` keep their hover and tooltip and take no clicks.

  A threshold's field starts at a `ThresholdEvent` at its `value`, and a box's at a
  `BoundsEvent` at its `bounds`, so `sel.cutoff.value` works from the first run. Before, a
  threshold's or a box's value was `nothing` until the first drag, so a check such as
  `isnothing(level)` is now never true (#309):

  ```julia
  @bind level masque(fig, thr; bind = thr)
  level           # before: nothing until the first drag; now: ThresholdEvent at thr's value
  ```

  A pick starts at `nothing`, or at the element `selected=` names.
- **Breaking:** clicking an empty part of a plot, or pressing Escape on a focused figure,
  clears the selection. A click on empty space clears the picks of the plots in that axis
  (both axes, for twin axes), and Escape clears every pick in the figure before it clears
  the focus. A click on a mark that only shows a tooltip, such as a line, inside a legend's
  box, or with Cmd/Ctrl held, keeps the picks. Cells that use the `@bind` value run again
  when a clear changes it. Before, both left
  the selection as it was, and only a second click on the selected mark cleared it (#335).
- **Breaking:** a plot that builds several layers names them as its parts. A `stem!` gives
  `stem.points` and `stem.stems`, a `scatterlines!` gives `scatterlines.points` and
  `scatterlines.line`, and a `RegionInteractable` with more than one kind of shape gives
  `region.circles`, `region.rects` and `region.polygons`. A `RegionInteractable` of one kind
  of shape is just `:region`, where it used to be `:region_c`, `:region_r` or `:region_p`. The `@bind` value nests them, as
  in `sel.stem.stems`, and an event on a part has the plot's name as its `layer` and the
  rest in `part`, so `pick.layer == :stem` and `pick.part == (:stems,)`. Before, the second
  layer added a suffix (`:stem_stems`, `:scatterlines_line`, `:region_c`), and the first
  took the plot's name, so code that read `pick.layer == :stem` for a stem's points now
  reads `pick.part`. `selected=` nests the same way:
  `selected = (stem = (stems = [2],),)`. A recipe's `interactables` method names its parts
  by returning a `NamedTuple`; one that returns a vector still works, and its layers become
  parts named by their own ids (#335):

  ```julia
  st = stem!(ax, x, y)
  @bind sel masque(fig; bind = st)
  sel.stems.layer     # before, a stem click gave an event whose layer was :stem_stems
  sel.stems.part      # now its layer is :stem and its part (:stems,)
  ```
- **Breaking:** a box with `selects` adds two fields: its own `BoundsEvent`, which used to be
  left out, and its target's, holding what the box contains. The target's field starts at
  what the box's starting `bounds` contain, highlighted: a `Vector{ElementEvent}` of the
  points inside, or a `GridWindowEvent` for the cells under it. Before, the value was
  `nothing` until the first drag. The target takes no clicks, and the other plots in the
  widget keep theirs. Several boxes may now share a figure (#330, #335).
- **Breaking:** a `lines!` plot, the line of a `scatterlines!`, a `stairs!` and a `series!`
  show their tooltip on hover but take no clicks, since neither the whole line nor a point
  on it is the obvious pick. Before, a click selected the whole line. Bind one to make it clickable, as in `bind = (fit = ln,)`, or
  pass `interactables(ln)` (#335).
- **Breaking:** `selected=` names fields: `selected = (scatter = 3,)`, or `selected = 3` when
  the widget has one plot that takes picks. A field holds one pick, so several indices for
  one plot raise an `ArgumentError`, where they used to highlight without setting the value.
  So does `selected=` for a control, which starts at its own value, or for a plot left out
  of `bind`. Several indices still work on the target of a box with `selects`. To start that
  target empty, name it, as in `selected = (scatter = Int[],)`; a bare `selected = Int[]`,
  which used to start it empty, now sets nothing, so the box starts at what it contains (#335).
- **Breaking:** a `wireframe!` layer has one element per drawn edge. Makie outlines every
  face, so an edge shared by two faces used to ship twice, and its second copy could never
  be hovered or clicked. Edges keep Makie's drawing order, with a shared edge kept where it
  first appears, so every edge after the first shared one moves to a lower index. Edge `k`
  is `SegmentInteractable(ax, w).vertices[2k-1:2k]`, and half that vector's length is the
  edge count. A `payloads` vector of the old length, or a `selected` index past the new
  count, raises an `ArgumentError`. An in-range `selected` index, or a saved `pick.index`,
  silently points at a different edge, so check those by hand (#316).
- **Breaking:** a color string in `overlaystyle` or `tooltipstyle` must be a color, so a
  typo such as `color = "steelbleu"` raises an `ArgumentError` instead of being dropped by
  the browser. Names, hex codes, and `rgb(…)` and `hsl(…)` strings work as before, and
  `"var(--name)"` still follows a CSS custom property. Other CSS-only forms, such as
  `currentColor`, `color-mix(…)`, or `oklch(…)`, now raise; pass a Makie color or wrap the
  value in a custom property your page sets. An `overlaystyle` colour given as a bare number,
  which used to be read as a grey level, raises too, as it already did in `tooltipstyle` (#342).
- **Breaking:** a click on a line named in `bind` picks the point you plotted nearest the
  click, the one its tooltip shows, instead of the whole line, and a ring marks that point.
  `pick.index` is now the point's position in the line's data, so `xs[pick]` reads it; the
  event also holds `x` and `y`, and `line`, which line of a `series!` it is on. Code that
  read `pick.index` as which line reads `pick.line` now. `selected = (fit = [3],)` on a bound
  line starts at its third point; on a `series!` the starting point can't be given by index.
  From the keyboard, Shift + ← / → moves along a focused line's points and Enter picks one.
  With `select = :many`, each pick on a line is a point, and `selected=` names points.
  A line on an `Axis3` has no points to pick, so its click still picks the whole line (#335).

### Deprecated
- The keywords `tooltip_bg`, `tooltip_color`, `tooltip_accent`, `tooltip_font`,
  `tooltip_font_size`, `tooltip_radius`, and `tooltip_caret` still work, with a warning naming
  the `tooltipstyle` form, and are removed in 0.4. Their values are now checked like
  `tooltipstyle`'s, so one such as `tooltip_font_size = "12"` raises an `ArgumentError`, and
  passing a key both ways is an error. `tooltip_sigdigits` stays (#305).

### Removed
- **Breaking:** the forms deprecated in 0.2 are gone. Calling one now raises a
  `MethodError` ("no method matching …"), or an `UndefVarError` for `auto_interactables`,
  and the error message names the form to use instead (#299, #348):

  | Removed | Use instead |
  |---|---|
  | `CairoBackend(; max_width)` | `masque(fig; backend = :cairo, max_width)` |
  | `WebGLBackend(; px_per_unit, max_width)` | `masque(fig; backend = :webgl, px_per_unit, max_width)` |
  | `auto_interactables(fig)` and its export | `interactables(fig)` |
  | `RectInteractable(ax, p)` for a heatmap or image | `GridInteractable(ax, p)` |
  | `RectInteractable(ax; grid = …)` | `GridInteractable(ax, xedges, yedges, values)` |
  | `RectInteractable(ax; rects = …)` | `RectInteractable(ax, rects)` |
  | `RegionInteractable(ax; regions = …)` | `RegionInteractable(ax, regions)` |

### Fixed
- A `meshscatter!` sphere on `Axis3` responds to hover and clicks out to its drawn edge, and
  its highlight sits on its outline. Before, its hit circle could fall well inside the
  sphere, so pointing near the edge missed it (#317).
- A box with `selects` on a heatmap or image no longer takes an extra row or column when
  its edge sits exactly on a cell edge. With cell edges at 0, 1, 2, 3, a box from 1 to 2
  selects only the cell between them, where it used to take the cells on either side too.
  This changes the cells a release and the starting value return for such boxes (#337).
- Hovering a line near the edge of its axis reads out the nearest point you can see. It
  used to show a point past the axis limits when that one was closer along the line, and a
  click on a bound line there picked that hidden point (#335).

## [0.2.2] - 2026-10-09

### Added
- A CairoMakie widget shown outside Pluto, in Documenter or in an HTML page written with
  `show(io, MIME"text/html"(), w)`, keeps its tooltips and highlights, with nothing to turn
  on. Clicks highlight a mark but set no `@bind` value, and dragging the view needs Pluto. A
  display that blocks scripts still shows the plain figure (#298).

  The page loads the overlay script once from jsDelivr, pinned to the installed Masque
  release and checked against its hash, so each widget adds little beyond its image. Read
  offline, the page shows the plain figures. A Masque checked out with `Pkg.develop` writes
  the script into each widget instead, about 80 KB apiece. An install from a branch or URL
  shows the plain figures; use `Pkg.develop` to try unreleased changes outside Pluto (#298).
- `SliceInteractable([a, b])` builds a slice from plots without naming the axis; `masque`
  puts it on the axis that draws them, and plots on different axes raise an error naming
  both. `SliceInteractable(ax, [a, b])` still works (#306).
- A heatmap or image takes `payloads`, one per cell: a function `(i, j) -> payload` or a
  matrix the same size as the plotted one, passed to `interactables(p; payloads)` or
  `GridInteractable`. The tooltip lists the payload's fields and the cell's value, a
  template can use those fields next to `i`, `j`, and `value`, and a click's
  `GridCellEvent` carries the payload, so `pick.row` reads it. Before, a grid took no
  payloads, and labelling cells meant one `RectInteractable` per cell (#290).
- A plot's layer is named after the plot's own `label`, the text its legend entry shows, so
  `scatter!(ax, xs, ys; label = "wild type")` announces "wild type, element 3 of 10: …" to
  screen readers. Passing `label` to `interactables(plot; …)` or a constructor still names the
  layer, and `label = nothing` leaves the name out. A plot with no `label`, or one written in
  LaTeX or rich text (whose markup a screen reader would read out), announces what it did
  before (#304).

### Fixed
- A slice built from a `lines!` plot (or `stairs`, `series`, `band`, `density`) whose data
  has a NaN in one coordinate, such as a missing `y` value, now samples around the gap the
  way the line is drawn. Before, it raised "series 1 has a non-finite coordinate" (#319).
- `masque` warns once per call about the plots it skips, listing each kind, with a count when
  one repeats. Before, it warned once per skipped plot, so two `Axis3` panels with `text!`
  gave two identical warnings per call (#289).
- Two interactables of the same kind in one `masque` call no longer clash over their
  default id. Two `ViewInteractable(ax)` on two axes become `:view` and `:view_2`, the way
  two scatters become `:scatter` and `:scatter_2`; the same holds for `AxisInteractable`,
  `ColorbarInteractable`, `LegendInteractable`, `ThresholdInteractable`, `ROIInteractable`,
  and every other constructor's default. Before, `masque` raised "two interactables use the
  layer id". Ids you choose are unchanged, and two that match still raise. With two
  `AxisInteractable`s, each panel now reads its own coordinates; before, the first one
  answered over both panels (#287).
- A `scatter!` sized in data units (`markerspace = :data`) no longer stops `masque(fig)`
  from showing the figure. Each marker responds over its drawn shape (a square marker over
  its square, a circle over its circle). Passing `radius` to `interactables(plot; …)` still gives circles of that
  many pixels. More generally, a plot `masque(fig)` can't make interactive is now skipped
  with a warning instead of failing the whole widget (#291).
- Showing a `masque` widget outside Pluto no longer throws an `AssertionError`. A
  `backend = :webgl` widget, which has no image to fall back on, shows a box of the figure's
  size saying it is drawn only in Pluto. Widgets in Pluto are unchanged (#288).
- Two tooltip examples, in the `interactables` docstring and on the constructors page, wrote a
  template field as `{x}`, which a tooltip shows as literal text. They now write `$(x)`.
  Thanks to Jah-yee (#303).

## [0.2.1] - 2026-10-04

### Added
- `scatterlines!` on an `Axis3` responds to hover and click, with the same `:scatterlines`
  (markers) and `:scatterlines_line` (line) layers it gives on a 2D `Axis`. Before, `masque`
  skipped it with a warning (#273).
- `arrows2d!` (and `arrows!` on a 2D `Axis`) responds to hover and click: each arrow is one
  element of an `:arrows2d` layer, hit along the drawn arrow from tail to tip, with payload
  `(; index, x, y, u, v)`. Before, `masque` made no layer for it (#274).
- Hovering a line from `lines!`, `stairs!`, `series!`, or `scatterlines!` shows `x` and `y`
  of the plotted point nearest the pointer along the line, and a tooltip template can name
  `x`, `y`, and `i`, that point's index. Clicks and the `@bind` value still pick the whole
  line. Lines on an `Axis3` are unchanged (#262).

### Fixed
- The 0.2 deprecations now show their warning in Pluto and the REPL. Before, Julia showed
  them only when it ran with `--depwarn=yes`, so a notebook still using `CairoBackend(…)`,
  `auto_interactables`, or a keyword form of `RectInteractable` or `RegionInteractable` got
  no warning before 0.3 removes them (#269).
- After a page reload, the highlighted selection matches the value Pluto restored to the
  `@bind` variable. Before, it showed the `selected=` element while the variable held your
  last click, so the next click could clear the selection instead of making it (#272).
- A slice built from plots replaces the hover of exactly those plots. Before, it guessed
  their layer ids by counting the plots passed to it, so slicing only the second of two
  `lines!` plots took over the first one's hover and left the sliced one's in place. It also
  no longer needs `covers = []` when `auto = false` leaves those plots out of the widget,
  where `masque` used to raise an error. A layer you name in `covers` yourself must still be
  in the call (#271).
- Hovering a `datashader!` pixel shows how many points fell in it. Before, with the default
  `operation`, it showed the histogram-equalized colour value, a number near 1 such as
  `0.99998` (#276).
- An `interactables` method for your own plot type no longer needs an `id` keyword:
  `Masque.interactables(ax, p::MyPlot)` works, and `masque` names the layers it returns after
  the plot. Before, `masque` said it had no default for the plot type. A caller's keyword the
  method does not take, as in `interactables(p; tooltip = …)`, now fails with an error that
  names the plot type and says to add `; kwargs...`, not a bare `MethodError`
  (#270).

## [0.2.0] - 2026-10-03

Some calls written for 0.1 behave differently: each is marked **Breaking** below, and the
categorical and date payloads under Fixed are a change too. The forms listed under Deprecated
still work and are removed in 0.3.

### Changed
- Clicking the selected mark or legend entry again clears the selection, and the `@bind`
  value goes back to `nothing`. Before, a selection could only be replaced by another click.
- **Breaking:** `masque(fig, xs...)` adds to the interactions `masque(fig)` builds instead of
  replacing them, so `masque(fig, ViewInteractable(ax))` keeps every hover and click and adds
  panning. An interactable whose `id` matches a default layer's replaces that layer. To keep
  the old behavior, where only the interactables you pass respond, add `auto = false`:
  `masque(fig, ints; auto = false)`. Two layers with the same id now raise an error.
- **Breaking:** heatmap and image grids are now a `GridInteractable` instead of a
  `RectInteractable`, and `masque(fig)` builds one for each `heatmap!` and `image!`. Build one
  with `GridInteractable(ax, xedges, yedges, values)` or `GridInteractable(ax, p)` for a heatmap
  or image plot. `RectInteractable` is now the list of rectangles only. Code that checks
  `isa RectInteractable` for a heatmap layer needs `GridInteractable`.
- **Breaking:** choose the backend by name, `masque(fig; backend = :cairo)` or
  `backend = :webgl`, and set `max_width` and `px_per_unit` as `masque` keywords, which both
  backends now accept: `px_per_unit = 3` also sharpens a CairoMakie PNG. The
  `CairoBackend(; max_width)` and `WebGLBackend(; px_per_unit, max_width)` objects still work,
  are deprecated, and are removed in 0.3; when a call passes both a backend object
  and `masque`'s `max_width`, the keyword now wins. A third-party `AbstractBackend`'s `_ppu`,
  `context`, and `make_widget` methods take `max_width` as a new last argument.
- `RectInteractable` and `RegionInteractable` take their shapes as the second argument, like
  the other element constructors: `RectInteractable(ax, rects)` and
  `RegionInteractable(ax, regions; payloads)`. `payloads` is now optional for
  `RegionInteractable` and defaults to each region's `index`.
- Where two plots overlap, the one drawn on top now gets the pointer: on each axis, the plot
  created last. A graph's nodes respond over its edges, and points respond over the line or
  shape drawn before them. `interactables(fig)` lists each axis's plots in that order, the
  plot created last first; layer ids are unchanged.
- A legend with no `targets` links to the layers of the `masque` call it is in, including
  layers built with `interactables(plot)` and calls with `auto = false`.

### Added
- `masque(fig; overlaystyle = (; …))` sets the look of highlights, the selection, the
  crosshair, and ROI boxes for one widget: their color, outline widths, fill opacities, and
  the ROI grips. Keys you leave out keep the built-in look. Most keys are also `--masque-*` CSS
  custom properties, which a page can set without Julia. See the Overlay styling section of
  the API page.
- Threshold lines, ROI boxes, and pan and orbit views each get a Tab stop after the plot.
  Arrow keys move the line or the box, or pan or rotate the view; Alt with an arrow resizes an
  ROI box, and `+` / `-` zoom a pan view. The `@bind` value updates once, when the key is
  released.
- `interactables(plot; tooltip, payloads, label, id)` changes one plot's layer without
  rebuilding the rest: `masque(fig, interactables(s; tooltip = masque"…"))`. It keeps the
  layer's id, so `selected=` and legend links still work. `stem!`, `scatterlines!`,
  `boxplot!`, and `annotation!` can be customized this way too.
- `interactables(fig)` and `interactables(ax)` return the interactables `masque(fig)` builds,
  for the whole figure or one axis.
- A recipe can define `Masque.interactables(ax, p::MyPlot; id, kwargs...)`, and `masque(fig)`
  uses it for every plot of that type.
- `AxisInteractable` works on a `PolarAxis`: hovering shows the angle and radius under the
  pointer, and a click returns them as `x` and `y` in the order the axis plots them (angle in
  radians first, unless `theta_as_x = false`). It works in a static export too. Thresholds,
  ROI boxes, slices, and pan views still raise an error on a `PolarAxis`.
- `hexbin!` plots respond: each hexagon is one mark, and hovering shows its center and its
  count (the summed weight when `weights` is given). `PolygonInteractable(ax, p)` builds the
  layer, `:hexbin`, for one hexbin plot.

### Deprecated
- `auto_interactables(fig)`: use `interactables(fig)`. It will be removed in 0.3.
- `RectInteractable(ax; grid = (xedges, yedges, values))` and `RectInteractable(ax, p)` for a
  heatmap or image: use `GridInteractable`. They return a `GridInteractable` until they are
  removed in 0.3.
- `RectInteractable(ax; rects = …)` and `RegionInteractable(ax; regions = …)`: pass the shapes
  positionally, `RectInteractable(ax, rects)` and `RegionInteractable(ax, regions)`. The keyword
  forms will be removed in 0.3.

### Fixed
- The tooltip that follows the pointer (an axis or colorbar readout, a threshold, an ROI, a
  view, a slice) now points at the pointer. Before, its arrow sat about 24 pixels to the side.
- `masque(fig)` no longer fails when a scatter has one marker size per point
  (`scatter!(…; markersize = [10, 20, 30])`, or a GraphMakie `graphplot` with `node_size` or
  `ilabels`). Each point now gets a highlight and click target the size of its own marker.
  `PointInteractable`'s `radius` also takes one value per point.
- `masque(fig)` no longer fails when `poly!` draws shapes instead of point rings: a `Rect2f`,
  a `Circle`, a `Polygon`, a `MultiPolygon`, or a vector of them, and so `tricontourf!` works
  too. Each entry of the vector is one hover and click target, the same element its `color`
  colors, and a polygon's holes are not part of it. A single `MultiPolygon` is one target per
  polygon, since Makie colors each one separately.
- A `band!` drawn with `direction = :y` now responds where it is drawn. Before, its hover and
  click target was the band mirrored across the diagonal.
- `masque(fig)` no longer fails when an `arrows3d!` gives one direction for every arrow
  (`arrows3d!(ax, points, Vec3f(1, 0, 1))`).
- A plot moved by `translate!`, `scale!`, or `rotate!` now responds where it is drawn, and so
  does a scatter drawn with `marker_offset` (pixel or data markerspace) and a `text!` with
  `markerspace = :data`, on linear and scaled axes alike. A `meshscatter!` enlarged by
  `scale!` gets a target of the enlarged size. Before, these targets stayed at the unmoved
  positions and sizes. Tooltips still show the plot's own data values. A rotated plot whose
  targets are rectangles (bars, a heatmap) is skipped with a warning, since its rectangles are
  no longer axis-aligned.
- A plot drawn with `space = :relative`, `:pixel`, or `:clip` is now skipped with a warning, as
  such text already was. Before, its targets were placed as if its positions were data.
- Thick strokes respond over their whole width. A line's hover and click target now covers
  its `linewidth` (it was a fixed 6 px either side), a scatter marker's covers its
  `strokewidth`, bars and polygons respond over their drawn outline, and `errorbars!` and
  `rangebars!` respond on their whiskers.
- On a categorical or date axis, default tooltips and events show the value you plotted:
  `x = "b"` for `Makie.Categorical(["a", "b", "c"])`, `x = "2024-01-02"` for dates. Before,
  they showed Makie's internal number (`2.0`, or milliseconds since the epoch). On those axes
  `x`, `y`, and `z` are now strings, so arithmetic such as `pick.x + 1` no longer works there;
  pass `payloads` to keep numbers of your own.

## [0.1.1] - 2026-10-01

### Changed
- Tooltip numbers show up to four significant figures, so `0.30000000000000004` reads `0.3`.
  This covers the default tooltip, a heatmap cell's value, and a template field with no
  format spec. Whole numbers show in full, and a number too large for four figures (10 000 or
  more) rounds to a whole number (`123456.789` reads `123457`). Axis and colorbar readouts,
  slice samples, and drag labels keep their trailing zeros (`2.500`), so the label does not
  change width as the pointer moves. The `@bind` value is not rounded.

### Added
- `masque(...; tooltip_sigdigits = 4)` sets those significant figures, from 1 to 17.

## [0.1.0] - 2026-09-28

First registered release. It adds hover tooltips and click selection to Makie figures in a
Pluto notebook, and sends the clicked element to the rest of the notebook through `@bind`.
Code written for an earlier development version, installed from the repository, needs 1
added to the `index` in `colors = (; palette, index)`, which is now 1-based like every other
Masque index.

### Added
- `masque(fig)` makes a figure interactive in a Pluto cell, and `@bind pick masque(fig)` binds
  what the reader clicks. It picks up scatters, lines, bars, heatmaps and images, polygons,
  text, legends, and colorbars from the figure. `masque(fig, interactables)` uses the list you
  pass instead.
- Interactables for each kind of mark and gesture: `PointInteractable`,
  `SegmentInteractable`, `RectInteractable` (bars and heatmap or image grids),
  `PolygonInteractable`, `TextInteractable`, `LegendInteractable`, `AxisInteractable` and
  `ColorbarInteractable` (coordinate readouts), `SliceInteractable` (sample series at the
  cursor), `ThresholdInteractable` (a draggable line), `ROIInteractable` (a brush box that can
  select the marks inside it), and `ViewInteractable` (pan and wheel zoom on a 2D axis, orbit
  on an `Axis3`). `RegionInteractable` and `FunctionInteractable` add your own hit regions
  without writing JavaScript.
- Typed `@bind` values. A click on a mark or a legend entry gives an `ElementEvent` or a
  `LegendEvent`, with a 1-based `index` and the Julia object you passed as `payload`, so
  `ev.payload.field` reads it back. A heatmap or image cell gives a `GridCellEvent`, and a
  brushed block of cells a `GridWindowEvent`, both with 1-based cell indices. `AxisEvent`, `ColorbarEvent`,
  `ThresholdEvent`, and `BoundsEvent` carry the coordinates or value you picked.
- Tooltips that show an element's payload, or your own text from a `masque"..."` template.
  They take their light or dark theme from the figure's background.
- `selected=` sets the starting selection, so a second widget can show the element clicked in
  the first.
- Two backends, CairoMakie (a static image) and WGLMakie (a live canvas, for animation, large
  data, and live 3D), with the same overlay and `@bind` values on both. Each is a package
  extension. If both are loaded, `masque` uses CairoMakie unless you pass
  `backend = Base.get_extension(Masque, :MasqueWGLMakieExt).WebGLBackend()`.
- `Axis`, `Axis3`, and `PolarAxis`, with some plot types skipped on the last two. A figure
  that holds an `LScene` is refused.
- Keyboard navigation between elements, and screen-reader announcements for each one.
- Tooltips and highlights keep working in a static HTML export of the notebook.
- User documentation at <https://jowch.github.io/Masque.jl>.

Requires Julia 1.10 or later, Makie 0.24, and CairoMakie 0.15 or WGLMakie 0.13.

[Unreleased]: https://github.com/jowch/Masque.jl/compare/v0.4.4...HEAD
[0.4.4]: https://github.com/jowch/Masque.jl/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/jowch/Masque.jl/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/jowch/Masque.jl/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/jowch/Masque.jl/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/jowch/Masque.jl/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/jowch/Masque.jl/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/jowch/Masque.jl/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/jowch/Masque.jl/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/jowch/Masque.jl/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jowch/Masque.jl/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/jowch/Masque.jl/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jowch/Masque.jl/releases/tag/v0.1.0
