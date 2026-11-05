// LaTeX in a tooltip's key (an axis label written `L"..."`), typeset by the MathJax 3 the page
// already has: Pluto loads it on every notebook, and the docs players load the same build. Masque
// ships no math library of its own. The key is first written as plain text (the label read
// aloud, `omega_0 (rad/s)`) in a `.masque-tex` span carrying the source in `data-tex`; this
// swaps in the typeset form when MathJax can give one, and leaves the text when it can't: no
// MathJax on the page, a source MathJax reports as an error, or an unknown command.
//
// Pluto sets MathJax's `svg.fontCache` to "global": each glyph is drawn once in a `<defs>` on the
// page, and a formula's SVG only points at it with `<use href="#MJX-…">`. A tooltip lives in a
// shadow root, where those ids don't resolve, so it would draw nothing. Each glyph a formula
// uses is therefore copied once into a hidden `<defs>` in the widget's own shadow root, from
// MathJax's own glyph cache (which reaches the page only once MathJax typesets the page, so a
// page with nothing to typeset may never have it). A formula with any glyph that can't be found
// keeps the plain text: blank math reads worse than the label's source.

interface MathJaxLike {
    tex2svgPromise?: (tex: string, opts: { display: boolean }) => Promise<Element>
    tex2mml?: (tex: string, opts: { display: boolean }) => string
    startup?: { promise?: Promise<unknown>; output?: { fontCache?: { defs?: Element | null } } }
}

const SVG_NS = "http://www.w3.org/2000/svg"
const STORE_ID = "masque-glyphs"

// One typeset formula per source, shared by every widget on the page; null when MathJax gave
// an error, so the text stays.
const cache = new Map<string, Promise<SVGElement | null>>()

function mathJax(): MathJaxLike | undefined {
    const mj = (globalThis as { MathJax?: MathJaxLike }).MathJax
    return mj && typeof mj.tex2svgPromise === "function" ? mj : undefined
}

// Pluto loads MathJax at idle after the notebook opens, so a tooltip shown sooner waits for
// it: checked every 250 ms for up to 30 s, then given up on (a page without MathJax).
const WAIT_MS = 250, WAIT_TRIES = 120
let waiting: Promise<MathJaxLike | undefined> | null = null
function whenMathJax(): Promise<MathJaxLike | undefined> {
    const now = mathJax()
    if (now) return Promise.resolve(now)
    if (!waiting) {
        waiting = new Promise((resolve) => {
            let n = 0
            const tick = () => {
                const mj = mathJax()
                if (mj || ++n >= WAIT_TRIES) { waiting = null; resolve(mj); return }
                setTimeout(tick, WAIT_MS)
            }
            setTimeout(tick, WAIT_MS)
        })
    }
    return waiting
}

// Text mode outside `$…$`: `\$` and the like stand for the character itself, as in the plain
// text Julia sends.
export function texText(t: string): string {
    return t.replace(/\\([$%&#_{}])/g, "$1")
}

// Makie reads a LaTeXString as text with `$…$` math in it. Pieces at odd positions are math.
export function splitTex(src: string): { text: string; math: boolean }[] {
    const out: { text: string; math: boolean }[] = []
    let buf = "", math = false
    for (let i = 0; i < src.length; i++) {
        const c = src[i]
        if (c === "\\" && i + 1 < src.length) { buf += c + src[i + 1]; i++; continue }
        if (c === "$") { if (buf) out.push({ text: buf, math }); buf = ""; math = !math; continue }
        buf += c
    }
    if (buf) out.push({ text: buf, math })
    return out
}

// A source MathJax can't read comes back as an error node (`merror`) or, for an unknown command,
// the command itself as red text from its `noundefined` extension. Either keeps the plain text.
// A `\color{red}{…}` the author wrote is an `mstyle`, and stays.
export function texFailed(mml: string): boolean {
    return /<merror\b/.test(mml) || /<mtext\b[^>]*mathcolor="red"[^>]*>\s*\\/.test(mml)
}

function render(mj: MathJaxLike, tex: string): Promise<SVGElement | null> {
    let p = cache.get(tex)
    if (!p) {
        p = (async () => {
            await mj.startup?.promise
            if (mj.tex2mml && texFailed(mj.tex2mml(tex, { display: false }))) return null
            const node = await mj.tex2svgPromise!(tex, { display: false })
            return node.querySelector("svg")
        })().catch(() => null)
        cache.set(tex, p)
    }
    return p
}

function glyphId(u: Element): string {
    return (u.getAttribute("href") ?? u.getAttribute("xlink:href") ?? "").replace(/^#/, "")
}

// A glyph by id: from the page, else from MathJax's own cache, which isn't on the page until
// MathJax typesets the page.
function findGlyph(id: string, mj?: MathJaxLike): Element | null {
    const g = document.getElementById(id)
    if (g) return g
    const defs = mj?.startup?.output?.fontCache?.defs
    if (!defs) return null
    for (const c of defs.children) if (c.id === id) return c
    return null
}

// Copy into the shadow root's glyph store every glyph `svg` points at that isn't there yet.
// Returns false when some glyph `svg` needs can't be reached from `root`.
export function adoptGlyphs(svg: SVGElement, root: ShadowRoot | Document, mj?: MathJaxLike): boolean {
    const uses = svg.querySelectorAll("use")
    if (!uses.length) return true
    if (!(root instanceof ShadowRoot)) return [...uses].every((u) => !glyphId(u) || findGlyph(glyphId(u), mj))
    let store: Element | null = root.getElementById(STORE_ID)
    if (!store) {
        const holder = document.createElementNS(SVG_NS, "svg")
        holder.setAttribute("aria-hidden", "true")
        holder.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"
        const defs = document.createElementNS(SVG_NS, "defs")
        defs.id = STORE_ID
        holder.appendChild(defs)
        root.appendChild(holder)
        store = defs
    }
    let ok = true
    for (const u of uses) {
        const id = glyphId(u)
        if (!id || root.getElementById(id)) continue
        const g = findGlyph(id, mj)
        if (g) store.appendChild(g.cloneNode(true))
        else ok = false
    }
    return ok
}

// Typeset every `.masque-tex` key under `el`. `done` runs after a key changed size, so the
// tooltip can be measured and placed again.
export function typesetTex(el: ParentNode, root: ShadowRoot | Document, done?: () => void): void {
    const spans = el.querySelectorAll<HTMLElement>(".masque-tex[data-tex]")
    if (!spans.length) return
    void whenMathJax().then((mj) => {
        if (mj) for (const span of spans) typesetOne(span, mj, root, done)
    })
}

function typesetOne(span: HTMLElement, mj: MathJaxLike, root: ShadowRoot | Document, done?: () => void): void {
    const src = span.dataset.tex!
    const parts = splitTex(src)
    Promise.all(parts.map((p) => (p.math ? render(mj, p.text) : Promise.resolve(null)))).then((svgs) => {
        if (!span.isConnected || span.dataset.tex !== src) return
        if (parts.some((p, i) => p.math && !svgs[i])) return
        const frag = document.createDocumentFragment()
        let ok = true
        parts.forEach((p, i) => {
            if (!p.math) { frag.appendChild(document.createTextNode(texText(p.text))); return }
            const svg = svgs[i]!.cloneNode(true) as SVGElement
            svg.setAttribute("aria-hidden", "true")
            if (!adoptGlyphs(svg, root, mj)) ok = false
            frag.appendChild(svg)
        })
        if (!ok) return
        span.setAttribute("aria-label", span.textContent ?? "")
        span.replaceChildren(frag)
        span.removeAttribute("data-tex")
        done?.()
    })
}
