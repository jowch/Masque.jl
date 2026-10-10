// Mirrors the Julia structs in src/interactables.jl / src/backend.jl; keep in sync.
export type Kind =
    | "circles"   // geometry: [cx,cy,r, …]
    | "polyline"  // geometry: [x,y, …]  (NaN = gap); segment i = (v[i], v[i+1])
    | "lines"     // geometry: number[][]  one [x,y,…] polyline per element (NaN = gap inside that line)
    | "segments"  // geometry: [x0,y0,x1,y1, …]  disjoint pairs
    | "rects"     // geometry: [cx,cy,w,h, …]
    | "grid"      // geometry: GridGeometry  (compact; edges not N rects)
    | "surface"   // geometry: SurfaceGeometry — a projected vertex grid, quads tried in `order`
    | "polygons"  // geometry: (number[] | number[][])[]  one ring, or [exterior, ...holes]; even-odd per element
    | "axis"      // geometry: null  — continuous, rides the axis transform
    | "threshold" // geometry: ThresholdGeometry — a draggable h/v line; value computed via AxisTransform on drag
    | "roi"       // geometry: ROIGeometry — a draggable+resizable rect; bounds computed via AxisTransform
    | "view"      // geometry: ViewGeometry — drag-to-pan (2D) / drag-to-orbit (Axis3); commit on mouse-up
    | "slice"     // geometry: SliceGeometry — data-space series sampled at the cursor; not a hit target

export interface GridGeometry {
    xedges: number[]
    yedges: number[]
    ncols: number
    nrows: number
    values?: number[] // row-major: values[j*ncols + i]; the source matrix, when a cell is at least one screen pixel
    // One source value per screen pixel of the axis viewport, when cells are smaller.
    // Row-major over (sncols, snrows). NaN is a center that misses the grid (not a hit) or a
    // non-finite source cell (still a hit; the cell comes from the edges). Absent, with
    // `values` also absent, when the matrix is not real-valued.
    sample?: number[]
    sncols?: number
    snrows?: number
    sample_origin?: [number, number] // image px, top-left of sample (0, 0)
    sample_span?: [number, number]   // image px width, height of the sampled viewport
    sample_px?: number                // image px per sample; the last bin may be shorter
}

// A 3D surface's shipped points (a strided subset of the source grid on a dense surface).
// Point (a, b) is entry k = a + b*ni of every per-point array. Quad q = a + b*(ni-1) has
// corners (a, b), (a+1, b), (a, b+1), (a+1, b+1). `suspended` alone (no arrays) is an in-drag
// frame that left the geometry out: no hit area and no highlight until the release frame.
export interface SurfaceGeometry {
    suspended?: true
    ni: number
    nj: number
    i: number[]     // 0-based source row of each shipped row: length ni
    j: number[]     // 0-based source column of each shipped column: length nj
    xy: number[]    // image px, interleaved per point; NaN = a point not drawn
    order: number[] // quads front to back; quads with a corner not drawn are left out
    x: number[]     // data x: length ni (a vector grid) or ni*nj (a matrix grid)
    y: number[]     // data y: length nj or ni*nj
    z: number[]     // ni*nj
    value?: number[] // ni*nj, the colour matrix when it is separate from z
}

export interface ThresholdGeometry {
    orientation: "h" | "v"
    pos: number            // image-px coordinate of the line (y if "h", x if "v")
    span: [number, number] // image-px extent along the axis viewport
}

export interface ROIGeometry {
    x: number      // image-px rect, top-left origin
    y: number
    w: number
    h: number
    handle: number // hit half-size, image px; the painted grip is HANDLE_CSS in drag/roi.ts
}

export interface SliceSeries {
    id: string
    label?: string
    color?: string
    xy: number[] // data space, interleaved (probe, value); NaN starts a new run
}

export interface SliceGeometry {
    orientation: "v" | "h" // which data coordinate is the probe, and which single hair is drawn
    crosshair?: boolean    // true draws that one hair; false or absent draws none
    covers: string[]       // layer ids whose hover this slice replaces
    series: SliceSeries[]
}

export interface ViewGeometry {
    x: number      // axis viewport bbox, image px
    y: number
    w: number
    h: number
    mode: "pan" | "orbit"
    // pan only: the viewport inset past the spine stroke, image px (#171). The photographic
    // preview clips its sliding copy to this, so no axis edge slides with the data.
    clip?: [number, number, number, number]
    // pan only: the empty plot's colour (CSS), painted behind the sliding copy (#171).
    fill?: string
    azimuth?: number    // radians; orbit only (current Axis3 camera)
    elevation?: number  // radians; orbit only
    // orbit only (#321): the Axis3 limits [xmin, xmax, ymin, ymax, zmin, zmax] this frame
    // drew, and the data step that moves the picture one image px right (`panx`) or down
    // (`pany`) at those limits.
    limits?: Limits3
    panx?: [number, number, number]
    pany?: [number, number, number]
}

export type Limits3 = [number, number, number, number, number, number]

export interface AxisTransform {
    xlims: [number, number]
    ylims: [number, number]
    xscale: string // "identity" | "log10" | "log" | …
    yscale: string
    viewport: [number, number, number, number] // x,y,w,h image px, top-left origin
    xreversed: boolean
    yreversed: boolean
    xcats?: string[] | null // categorical tick labels, if any
    ycats?: string[] | null
    valueaxis?: "x" | "y" | null // 1-D colorbar readout: which axis carries the value; absent/null = 2-D {x,y}
    is3d?: boolean // lims are degenerate; Julia validate() rejects inversion consumers on is3d, so invertAxis is never reached with one
    ispolar?: boolean // lims are the viewport's Cartesian window; `polar` turns that point into (θ, r)
    polar?: PolarFrame | null // PolarAxis only; mirrors Julia's PolarFrame (src/backend.jl)
}

// The resolved Makie.Polar fields of one PolarAxis. invertAxis maps a pixel to the Cartesian
// point (x, y) over the transform's lims, then θ = mod(direction·atan2(y, x) − theta_0, branch)
// and r = hypot(x, y) + r0, swapped when theta_as_x is false.
export interface PolarFrame {
    theta_as_x: boolean
    direction: number // +1 or -1
    theta_0: number   // radians
    r0: number        // the radius drawn at the origin
    branch: [number, number] // the 2π-wide interval θ is folded into
}

export interface LayerStyle {
    stroke?: string
    width: number
}

export type TemplateSegment = string | { f: string; spec?: string }

export interface HitLayer {
    id: string
    kind: Kind
    // A polygon element is a flat ring (number[]) or, when it has holes, a ring group (number[][]).
    geometry: number[] | Array<number[] | number[][]> | GridGeometry | SurfaceGeometry | ThresholdGeometry | ROIGeometry | ViewGeometry | SliceGeometry | null
    payloads: unknown[] // one per element; a :grid layer's are per cell, row-major like values; a :surface layer's per shipped point (empty for none)
    axis: string
    events: string[] // "click" | "hover" | "drag"
    style?: LayerStyle
    tol?: number // hit-test slack, image px: :segments/:polyline/:lines (absent → geometry.ts's SEG_TOL fallback); :rects/:polygons reach past the shape's edge (absent → none)
    template?: TemplateSegment[] // masque"..." parsed once per layer; $() fields fill from payloads[]
    tooltip?: false              // explicit suppress; absent + no template → auto name/value table
    brush?: "elements" | "grid" // a `selects` box's target: its field holds what the box holds
    // Bond stamp the Julia side reads back: element | legend | gridcell | axis | colorbar | threshold | bounds | none
    bond?: "element" | "legend" | "gridcell" | "axis" | "colorbar" | "threshold" | "bounds" | "none"
    selects?: string   // id of the target layer this ROI selects; absent → bounds-ROI (no multi-select)
    // Per-element linked highlight (e.g. a Legend entry): other layers this element
    // highlights with the selected recipe on hover/focus; [] or absent-per-element = no link.
    // Each id is a layer id (every element) or `id:k` pinning element k (Julia 1-based).
    // Julia guarantees every referenced layer exists and has a kind in SELECTED_KINDS, and
    // that a `:k` pin is in range.
    links?: string[][]
    label?: string     // the layer's name (by default the plot's Makie label), announced before the position; absent → no name
    // Per-element tooltip accent colour: one CSS colour string (uniform across the layer), or a
    // shared palette + one 0-based palette index per element (colormapped/categorical data).
    // Absent → no accent (unresolvable or not attempted for this plot kind).
    colors?: string | { palette: string[]; index: number[] }
    // :lines on a 2D axis: per element, the data samples [x0, y0, x1, y1, …] that a hover
    // readout snaps to. Vertex k of the drawn path is sample k, except for a staircase (`step`),
    // whose drawn path adds a corner between samples. A coordinate on a categorical or date axis
    // is its label or date text. Absent → no readout (Axis3, or a layer built by hand).
    points?: (number | string)[][]
    step?: "pre" | "post" | "center"
    // :rects: 0-based element indices, front to back, to hit-test in (text on an Axis3, where
    // the label nearest the camera wins an overlap). An element left out is not drawn.
    // Absent → index order.
    order?: number[]
    // Bond value shape: selects-ROI mouse-up ships { items: [...] }; single-click / bounds-ROI
    // ships { layer, index, payload } directly.
}

export interface Manifest {
    width: number
    height: number
    scaling: number
    layers: HitLayer[]
    transforms: Record<string, AxisTransform>
    tipStyle?: Record<string, string> // figure-level --masque-tip-* custom properties
    overlayStyle?: Record<string, string> // figure-level overlay chrome custom properties (overlaystyle)
    tipDigits?: number // tooltip_sigdigits; absent means the frontend default (4)
    background?: string // the figure's background colour (CSS string) — drives the tooltip's light/dark theme
    // The layer ids whose commits make the `@bind` value, one field each. Every other layer
    // takes no clicks. The browser sends `{field: envelope}` for all of them on every commit.
    fields?: string[]
    // Every field's starting envelope (`null`: nothing picked yet). Only the mount manifest
    // carries it; a frame's manifest leaves it out.
    initial?: Record<string, unknown>
}

// `layer`/`index` are excluded from the trailing-underscore mangle convention (see
// frontend-delivery.md): they're read back out into the `@bind` payload's `layer`/`index`
// keys throughout bond.ts/drag/*.ts, and keeping the names identical there makes that
// pass-through visible at the call site. `geom_`/`grid_`/`axis_`/`roiPart_` never leave the
// frontend, so esbuild's `mangleProps: /_$/` shortens them in the bundle.
export interface Hit {
    layer: HitLayer
    index: number // -1 for axis (continuous)
    geom_?: unknown[] // shape descriptor for highlight drawing
    grid_?: [number, number, number?] // [i, j, value]; value absent only when neither values nor sample was sent. A :surface point: [source i, source j, z]
    pt_?: [number, number | string, number | string] // :lines readout: [0-based sample index, x, y] nearest the cursor
    axis_?: string // transform id, for continuous inversion
    roiPart_?: { corner?: number; edge?: "n" | "s" | "w" | "e"; move?: boolean } // which sub-part of an :roi a drag grabbed
}

// One entry in keyboard.ts's flat, manifest-order nav list — element-indexed kinds only
// (circles/rects/polygons/segments/polyline/lines; grid/axis/threshold/roi/view excluded, see
// keyboard.ts's FOCUSABLE_KINDS for why). An element not on screen (selection.ts's
// isGapElement: a polyline's NaN-gap "segments", Julia's gap sentinel that geometry.ts's
// hitLayer already skips, or a mark a zoomed Axis3 clipped) never gets a FocusRef at all. `index_` is the raw hitLayerByIndex/geometry index (used to resolve the
// Hit); `ordinal_`/`layerTotal_` are the 1-based position/count among this layer's FOCUSABLE
// elements only, announced to the user ("element `ordinal_` of `layerTotal_`") — not the same
// as `index_`/layerNElements(layer) once a layer has any skipped gaps. FocusRef never crosses
// the Julia/DOM boundary, so every field takes the trailing-underscore mangle suffix.
export interface FocusRef {
    layer_: HitLayer
    index_: number
    ordinal_: number
    layerTotal_: number
}
