// Template literal markup is author-trusted; every interpolated data value is HTML-escaped.
import { format } from "d3-format"
import type { Hit, TemplateSegment } from "./types"

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
export const esc = (v: unknown): string => String(v).replace(/[&<>"']/g, (c) => ESC[c])

const fmtCache = new Map<string, (n: number) => string>()
function applySpec(spec: string, v: unknown): string {
    if (typeof v !== "number" || !Number.isFinite(v)) return esc(v)
    let f = fmtCache.get(spec)
    if (!f) {
        try { f = format(spec) } catch { f = String as unknown as (n: number) => string }
        fmtCache.set(spec, f)
    }
    try { return esc(f(v)) } catch { return esc(v) }
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

// Auto name/value table from a payload object (the zero-config default). All values escaped.
export function renderAutoTable(payload: unknown, digits: number = DEFAULT_SIGDIGITS): string {
    if (payload == null) return ""
    if (typeof payload !== "object") return esc(fmtNum(payload, digits))
    return Object.entries(payload as Record<string, unknown>)
        .map(([k, v]) => `<div class="masque-tip-row"><span class="masque-tip-key">${esc(k)}</span><span class="masque-tip-val">${esc(fmtNum(v, digits))}</span></div>`)
        .join("")
}

// --- plain-text renderings, for the screen-reader live region (keyboard.ts) ---
// The live region takes plain text, not markup — a tag-stripped renderAutoTable output would
// read "index0x1y4" (its markup is all in the tags); this builds the same key/value pairs
// without HTML. Values are NOT run through esc() (no HTML context to escape for).
export function renderAutoTablePlain(payload: unknown, digits: number = DEFAULT_SIGDIGITS): string {
    if (payload == null) return ""
    if (typeof payload !== "object") return fmtNum(payload, digits)
    return Object.entries(payload as Record<string, unknown>)
        .map(([k, v]) => `${k} ${fmtNum(v, digits)}`)
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
export function plainTextForHit(hit: Hit, digits: number = DEFAULT_SIGDIGITS): string {
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
    if (layer.template) return stripToPlain(renderTemplate(layer.template, payload, digits))
    return renderAutoTablePlain(payload, digits)
}
