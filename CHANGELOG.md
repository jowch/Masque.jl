# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/jowch/Masque.jl/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jowch/Masque.jl/releases/tag/v0.1.0
