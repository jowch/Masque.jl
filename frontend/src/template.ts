// Template literal markup is author-trusted; every interpolated data value is HTML-escaped.
import { format } from "d3-format"
import type { AxisTransform, CoordFormat, Hit, HitLayer, TemplateSegment } from "./types"

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
export const esc = (v: unknown): string => String(v).replace(/[&<>"']/g, (c) => ESC[c])

const fmtCache = new Map<string, (n: number) => string>()
function specFn(spec: string): (n: number) => string {
    let f = fmtCache.get(spec)
    if (!f) {
        try { f = format(spec) } catch { f = String as unknown as (n: number) => string }
        fmtCache.set(spec, f)
    }
    return f
}
function applySpec(spec: string, v: unknown): string {
    if (typeof v !== "number" || !Number.isFinite(v)) return esc(v)
    try { return esc(specFn(spec)(v)) } catch { return esc(v) }
}

// A number with no format spec: at most `digits` significant figures, trailing zeros dropped,
// so 0.30000000000000004 reads "0.3". Integers, and the integer part of a value at or above
// 10^digits, are kept whole: 123456.789 reads "123457", not "123500". Display only — the
// `@bind` value keeps the exact number. `tooltip_sigdigits` on masque() sets `digits`.
export const DEFAULT_SIGDIGITS = 4
export function fmtNum(v: unknown, digits: number = DEFAULT_SIGDIGITS): string {
    if (typeof v !== "number" || !Number.isFinite(v) || Number.isInteger(v)) return String(v)
    if (Math.abs(v) >= 10 ** digits) return String(Math.round(v))
    return String(Number(v.toPrecision(digits)))
}

// A coordinate as the axis around it reads (#510): scaled, with the axis's prefix and suffix.
// Precision, highest first: `tooltip_sigdigits` when the user set it (`explicit`), the precision
// a Makie format string states (`spec`), then `digits` significant figures. `live` is for a value
// that changes as the pointer moves, which keeps its trailing zeros so the label holds its width
// (state.ts's `fmt`). A value exactly on a hand-placed tick prints that tick's label, except
// `live` (#606). With no format this is today's plain number. Not HTML-escaped.
export function fmtCoord(v: unknown, f: CoordFormat | undefined, digits: number, explicit: boolean, live = false): string {
    if (typeof v !== "number" || !Number.isFinite(v)) return String(v)
    if (!f) return live ? v.toPrecision(digits) : fmtNum(v, digits)
    if (f.ticks && !live) {
        const t = f.ticks.find(([tv]) => tv === v)
        if (t) return t[1]
    }
    const x = v * (f.scale ?? 1)
    let body: string
    if (f.spec && !explicit) {
        const fn = specFn(f.spec) // String when the spec doesn't parse: then significant figures
        body = fn === (String as unknown) ? fmtNum(x, digits) : fn(x)
    } else if (f.exp) {
        body = specFn(`.${digits - 1}${live ? "" : "~"}e`)(x)
    } else {
        body = live ? x.toPrecision(digits) : fmtNum(x, digits)
        if (f.group && !body.includes("e")) body = body.replace(/^(-?)(\d+)/, (_, s: string, d: string) => s + d.replace(/\B(?=(\d{3})+(?!\d))/g, ","))
    }
    return (f.prefix ?? "") + body + (f.suffix ?? "")
}

// Which of a hit's fields are measured along an axis, each with that axis's format: the payload
// fields Masque filled in (`layer.coords`, even beside a user's own fields), such as a point's
// `x`/`y` or a bar's `value`; a line's readout, `x` and `y` unless the payload has its own; a
// surface point, the `x`, `y` and `z` its payload doesn't override. A field the user set stays a
// plain number. Only fields whose axis has a format are listed. The format's `label` (θ, r)
// renames only the axis's own field: a `value` along r stays `value`.
export type CoordFields = Record<string, CoordFormat>
// The coordinates a line hover's readout fills in: `x`, `y`, and `z` on an Axis3 line.
export function readoutKeys(hit: Hit): readonly string[] {
    return !hit.pt_ ? [] : hit.pt_.length > 3 ? ["x", "y", "z"] : ["x", "y"]
}
export function coordFields(t: AxisTransform | undefined, layer: HitLayer, payload: unknown, computed: readonly string[]): CoordFields | undefined {
    if (!t || !(t.xfmt || t.yfmt || t.zfmt)) return undefined
    const own = payload != null && typeof payload === "object" ? payload as Record<string, unknown> : {}
    const out: CoordFields = {}
    for (const [k, dim] of Object.entries(layer.coords ?? {})) {
        const f = t[`${dim}fmt`]
        if (f) out[k] = k === dim || f.label === undefined ? f : { ...f, label: undefined }
    }
    for (const k of computed) {
        const f = (k === "x" || k === "y" || k === "z") && t[`${k}fmt`]
        if (f && !(k in own) && !(k in out)) out[k] = f
    }
    return out
}

// A line hover's readout merged into its payload: `x` and `y` of the nearest sample (and `z` on
// an Axis3), and for a
// template also `i`, its 1-based index. The default table leaves `i` out, next to the line's own
// `index` it reads as a second index. Julia sends a categorical or date coordinate as its text;
// a number on an axis with categories still shows the label Makie puts at that position. As
// with every mark's default fields, the payload's own fields win a clash. A non-object payload
// has nowhere to put fields and is shown as it is.
export function withReadout(payload: unknown, hit: Hit, t: AxisTransform | undefined, template: boolean): unknown {
    if (!hit.pt_ || (payload != null && typeof payload !== "object")) return payload
    const [s, x, y, z] = hit.pt_
    const cat = (v: number | string, cats?: string[] | null) => (typeof v === "number" && cats?.length ? cats[Math.round(v) - 1] ?? v : v)
    const own = (payload ?? {}) as Record<string, unknown>
    const readout: Record<string, unknown> = template ? { i: s + 1 } : {}
    readout.x = cat(x, t?.xcats)
    readout.y = cat(y, t?.ycats)
    if (z !== undefined) readout.z = z
    const out: Record<string, unknown> = { ...own }
    for (const [k, v] of Object.entries(readout)) if (!(k in own)) out[k] = v
    return out
}

// Missing fields (undefined) emit nothing.
export function renderTemplate(segments: TemplateSegment[], payload: unknown, digits: number = DEFAULT_SIGDIGITS): string {
    const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>
    let html = ""
    for (const seg of segments) {
        if (typeof seg === "string") { html += seg; continue }
        const v = obj[seg.f]
        if (v === undefined) continue
        html += seg.spec ? applySpec(seg.spec, v) : esc(fmtNum(v, digits))
    }
    return html
}

// The name each field shows under: a coordinate's axis label (θ, r, or the axis's own label
// such as "Time (s)") in place of its key. A label that would read the same as another row's
// name, another field's key or another label (`xlabel == ylabel`), is dropped for the key, as
// two rows of one name can't be told apart.
export function rowNames(keys: readonly string[], coords?: CoordFields): Record<string, string> {
    const out: Record<string, string> = {}
    const label = (k: string) => coords?.[k]?.label
    for (const k of keys) {
        const l = label(k)
        out[k] = l !== undefined && l !== k && !keys.some((o) => o !== k && (o === l || label(o) === l)) ? l : k
    }
    return out
}

// A row's name as markup: the key, escaped, or, where the axis label names it, the label. A
// rich label brings its own markup (escaped by Julia); a LaTeX label is written as its plain
// text in a `.masque-tex` span for tex.ts to typeset.
export function nameHtml(k: string, name: string, f: CoordFormat | undefined): string {
    if (name === k || !f) return esc(name)
    if (f.html !== undefined) return f.html
    if (f.tex !== undefined) return `<span class="masque-tex" data-tex="${esc(f.tex)}">${esc(name)}</span>`
    return esc(name)
}

// Auto name/value table from a payload object (the zero-config default). All values escaped.
// `coords` prints the listed coordinate fields in their axis's format, under its key label.
export function renderAutoTable(payload: unknown, digits: number = DEFAULT_SIGDIGITS, coords?: CoordFields, explicit = false): string {
    if (payload == null) return ""
    if (typeof payload !== "object") return esc(fmtNum(payload, digits))
    const entries = Object.entries(payload as Record<string, unknown>)
    const names = rowNames(entries.map(([k]) => k), coords)
    return entries
        .map(([k, v]) => {
            const f = coords?.[k]
            const val = f ? fmtCoord(v, f, digits, explicit) : fmtNum(v, digits)
            // A number with its unit stays on one line beside a key that wraps; text may wrap.
            const cls = typeof v === "number" ? "masque-tip-val masque-tip-num" : "masque-tip-val"
            return `<div class="masque-tip-row"><span class="masque-tip-key">${nameHtml(k, names[k], f)}</span><span class="${cls}">${esc(val)}</span></div>`
        })
        .join("")
}

// --- plain-text renderings, for the screen-reader live region (keyboard.ts) ---
// The live region takes plain text, not markup — a tag-stripped renderAutoTable output would
// read "index0x1y4" (its markup is all in the tags); this builds the same key/value pairs
// without HTML. Values are NOT run through esc() (no HTML context to escape for).
export function renderAutoTablePlain(payload: unknown, digits: number = DEFAULT_SIGDIGITS, coords?: CoordFields, explicit = false): string {
    if (payload == null) return ""
    if (typeof payload !== "object") return fmtNum(payload, digits)
    const entries = Object.entries(payload as Record<string, unknown>)
    const names = rowNames(entries.map(([k]) => k), coords)
    return entries
        .map(([k, v]) => {
            const f = coords?.[k]
            return f ? `${names[k]} ${fmtCoord(v, f, digits, explicit)}` : `${k} ${fmtNum(v, digits)}`
        })
        .join(", ")
}

const UNESC: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }

// Strip tags from author-trusted template HTML and un-escape entities `esc()` already applied
// — a bare tag-strip alone would announce "&amp;" as the literal text "amp;". Tags are
// replaced with a space, not deleted outright: a template like "<div>x: 1</div><div>y:
// 2</div>" would otherwise announce "x: 1y: 2" with the two rows run together. The following
// whitespace collapse absorbs the extra spaces this introduces at word boundaries that
// already had none.
export function stripToPlain(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => UNESC[m])
        .replace(/\s+/g, " ")
        .trim()
}

// Plain-text tooltip content for one hit — the announcement body in keyboard.ts's live region.
// `:axis`/`:grid` hits never reach here (keyboard.ts's focus list excludes those kinds), so
// unlike hover.ts's tipHtmlForHit this needs no manifest/px/py for continuous-axis inversion.
export function plainTextForHit(hit: Hit, digits: number = DEFAULT_SIGDIGITS, t?: AxisTransform, explicit = false): string {
    const layer = hit.layer
    if (layer.tooltip === false) {
        // A legend entry has no visual card by default — the label is already in the row —
        // but the live region still names the entry. Without this, focus announces only
        // "Legend, element k of n".
        if (layer.bond === "legend") {
            const payload = layer.payloads[hit.index]
            if (payload && typeof payload === "object" && "label" in payload) {
                const label = (payload as { label?: unknown }).label
                if (label !== undefined && label !== null) return String(label)
            }
        }
        return ""
    }
    const payload = layer.payloads[hit.index]
    if (layer.template) return stripToPlain(renderTemplate(layer.template, withReadout(payload, hit, t, true), digits))
    return renderAutoTablePlain(withReadout(payload, hit, t, false), digits, coordFields(t, layer, payload, readoutKeys(hit)), explicit)
}
