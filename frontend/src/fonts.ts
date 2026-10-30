// The font a control's text is drawn in (#476): the one Makie draws that block's text in, so the
// browser's text matches the figure's. Julia names it; for one of Makie's own fonts it also
// sends where the file is online and the installed copy's hash. The file is fetched only when a
// control with text is drawn, once per page, and must match the hash; a page with no such
// control fetches nothing. Offline, on a hash mismatch, or for a font of the author's, the
// browser uses the font by name if the reader has it, and Helvetica or Arial otherwise.
import type { ControlFont } from "./types"

const FALLBACK = "Helvetica, Arial, sans-serif"

// One load per file per page, shared by every widget on it (each widget runs its own copy of
// the bundle), keyed by the file's hash.
function loads(): Map<string, Promise<void>> {
    const w = window as unknown as { __masqueFonts?: Map<string, Promise<void>> }
    return (w.__masqueFonts ??= new Map())
}

async function load(f: ControlFont & { src: string[]; integrity: string }): Promise<void> {
    if (typeof FontFace === "undefined" || !document.fonts) return
    for (const url of f.src) {
        try {
            const res = await fetch(url, { integrity: f.integrity })
            if (!res.ok) continue
            const face = new FontFace(f.family, await res.arrayBuffer(), {
                weight: String(f.weight ?? 400), style: f.style ?? "normal",
            })
            await face.load()
            document.fonts.add(face)
            return
        } catch {
            // Offline, blocked, or not the installed file: try the next copy, then the fallback.
        }
    }
}

// A CSS family name, quoted.
function quote(name: string): string {
    return `"${name.replace(/["\\]/g, "\\$&")}"`
}

// Set `el`'s text in font `f`: the family, weight and style its CSS reads, inherited by the
// elements inside it, and the file's load, if Julia sent one.
export function useFont(el: HTMLElement, f: ControlFont | undefined): void {
    if (!f) return
    el.style.setProperty("--ff", `${quote(f.family)}, ${FALLBACK}`)
    el.style.setProperty("--fw", String(f.weight ?? 400))
    el.style.setProperty("--fst", f.style ?? "normal")
    if (f.src && f.integrity && typeof window !== "undefined") {
        const all = loads()
        if (!all.has(f.integrity)) all.set(f.integrity, load({ ...f, src: f.src, integrity: f.integrity }))
    }
}

// The CSS every control's text uses: the font `useFont` set, or Makie's own by name.
export const FONT_CSS = `font-family: var(--ff, "TeX Gyre Heros Makie", ${FALLBACK}); font-weight: var(--fw, 400); font-style: var(--fst, normal);`
