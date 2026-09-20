# Masque.jl — Architecture

> The coherent design. The original decisions, spike validation, and supporting research
> are superseded by this document (kept in git history, not in the tree).
> This document is the contract: the two interfaces (`AbstractBackend`,
> `AbstractInteractable`), the geometry primitives between them, and how custom
> interactions use the same infra as the built-ins.

## 1. The whole picture in one diagram

```
 user's Makie figure + declared interactables
                 │
   ┌─────────────▼──────────────┐
   │ AbstractBackend            │  render(fig)      → RenderResult (image bytes + dims + scaling)
   │   (CairoBackend for v1)    │  context(fig)     → InteractionContext (projection + axis transforms)
   └─────────────┬──────────────┘
                 │ ctx
   ┌─────────────▼──────────────┐
   │ AbstractInteractable[]      │  hitlayers(i, ctx) → Vector{HitLayer}   (compact, image-px geometry)
   │   Point/Segment/Rect/...    │  validate / events / tooltip / hoverstyle
   └─────────────┬──────────────┘
                 │ layers + axis transforms + image
   ┌─────────────▼──────────────┐
   │ masque           │  assembles ONE manifest, emits the @bind widget
   └─────────────┬──────────────┘
                 │ HTML (image + transparent overlay + JS)
   ┌─────────────▼──────────────┐
   │ JS overlay (stateless view) │  hit-test by kind • hover=local • click=@bind round-trip
   └────────────────────────────┘
```

Two contracts cross between layers, and only two: **`InteractionContext`** (backend → interactable)
and **`HitLayer`** (interactable → manifest/JS). Everything else is private to a layer.

## Sections

The rest of the document is split one file per section, under `architecture/`, so each can be
cited and linked precisely:

- [2. The backend seam — `AbstractBackend`](architecture/02-backends.md)
- [3. The interactable seam — `AbstractInteractable`](architecture/03-interactables.md)
- [4. Custom interactions — same infra, three ergonomic
  tiers](architecture/04-custom-interactions.md)
- [5. The bond value](architecture/05-bond-value.md)
- [6. How it composes — the three interaction tiers](architecture/06-composition.md)
- [7. v1 scope](architecture/07-scope.md)
- [8. Payload scaling & robustness to large inputs](architecture/08-scaling.md)
- [9. Wire encoding & precision](architecture/09-wire-encoding.md)
- [10. Tooltips](architecture/10-tooltips.md)
- [11. Keyboard navigation & ARIA](architecture/11-keyboard.md)
- [12. The gesture channel (#102)](architecture/12-gesture-channel.md)
