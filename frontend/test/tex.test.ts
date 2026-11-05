// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { adoptGlyphs, splitTex, texFailed, texText, typesetTex } from "../src/tex"
import { nameHtml, renderAutoTable, renderAutoTablePlain } from "../src/template"

const NS = "http://www.w3.org/2000/svg"

// A stand-in for the page's MathJax with Pluto's `fontCache: "global"`: each formula's SVG points
// at a glyph drawn once in MathJax's cache. That cache reaches the page only once MathJax
// typesets the page (`offPage` leaves it off, as on a page with nothing to typeset); `noGlyph`
// loses the glyph altogether.
function fakeMathJax(opts: { fail?: RegExp; offPage?: boolean; noGlyph?: boolean } = {}) {
    const defs = document.createElementNS(NS, "defs")
    defs.id = "MJX-cache"
    if (!opts.offPage) {
        const svg = document.createElementNS(NS, "svg")
        svg.appendChild(defs)
        document.body.appendChild(svg)
    }
    const calls: string[] = []
    const mj = {
        startup: { promise: Promise.resolve(), output: { fontCache: { defs } } },
        tex2mml: (tex: string) => (opts.fail?.test(tex) ? `<math><merror><mtext>${tex}</mtext></merror></math>` : "<math><mi>x</mi></math>"),
        tex2svgPromise: async (tex: string) => {
            calls.push(tex)
            const id = `MJX-G-${[...tex].map((c) => c.charCodeAt(0)).join("-")}`
            if (!opts.noGlyph && ![...defs.children].some((c) => c.id === id)) {
                const p = document.createElementNS(NS, "path"); p.id = id; defs.appendChild(p)
            }
            const c = document.createElement("mjx-container")
            const svg = document.createElementNS(NS, "svg")
            const use = document.createElementNS(NS, "use"); use.setAttribute("href", `#${id}`)
            svg.appendChild(use); c.appendChild(svg)
            return c
        },
    }
    ;(globalThis as { MathJax?: unknown }).MathJax = mj
    return calls
}

const flush = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => { delete (globalThis as { MathJax?: unknown }).MathJax; document.body.replaceChildren() })

describe("LaTeX keys", () => {
    it("splits a LaTeXString into text and $…$ math, keeping escaped dollars", () => {
        expect(splitTex("$\\omega_0$")).toEqual([{ text: "\\omega_0", math: true }])
        expect(splitTex("Frequency $\\omega$ (Hz)")).toEqual([
            { text: "Frequency ", math: false }, { text: "\\omega", math: true }, { text: " (Hz)", math: false },
        ])
        expect(splitTex("Cost \\$ $x$")).toEqual([{ text: "Cost \\$ ", math: false }, { text: "x", math: true }])
    })
    it("spots a source MathJax can't read", () => {
        expect(texFailed("<math><merror></merror></math>")).toBe(true)
        expect(texFailed('<math><mtext mathcolor="red">\\nope</mtext></math>')).toBe(true)
        expect(texFailed("<math><mi>x</mi></math>")).toBe(false)
        // a colour the author asked for is not an error
        expect(texFailed('<math><mstyle mathcolor="red"><mi>T</mi></mstyle></math>')).toBe(false)
        expect(texFailed('<math><mtext mathcolor="red">hot</mtext></math>')).toBe(false)
    })
    it("writes a LaTeX label as its plain text, marked for typesetting", () => {
        const f = { label: "omega (rad/s)", tex: "$\\omega$ (rad/s)" }
        expect(nameHtml("x", "omega (rad/s)", f)).toBe('<span class="masque-tex" data-tex="$\\omega$ (rad/s)">omega (rad/s)</span>')
        expect(renderAutoTablePlain({ x: 1 }, 4, { x: f })).toBe("omega (rad/s) 1")
    })
    it("writes a rich label as Julia's markup, but its plain text for the screen reader", () => {
        const f = { label: "T_e", html: "T<sub>e</sub>" }
        expect(renderAutoTable({ x: 1 }, 4, { x: f })).toContain(">T<sub>e</sub><")
        expect(renderAutoTablePlain({ x: 1 }, 4, { x: f })).toBe("T_e 1")
        expect(nameHtml("x", "x", f)).toBe("x") // a clash fell back to the key: no markup
    })
    it("typesets into a shadow root, copying each glyph into the widget's own store", async () => {
        const calls = fakeMathJax()
        const host = document.createElement("div"); document.body.appendChild(host)
        const root = host.attachShadow({ mode: "open" })
        const tip = document.createElement("div"); root.appendChild(tip)
        tip.innerHTML = nameHtml("x", "Frequency omega (Hz)", { label: "Frequency omega (Hz)", tex: "Frequency $\\omega$ (Hz)" })
        let done = 0
        typesetTex(tip, root, () => done++)
        await flush(); await flush()
        const span = tip.querySelector(".masque-tex")!
        expect(span.hasAttribute("data-tex")).toBe(false)
        expect(span.getAttribute("aria-label")).toBe("Frequency omega (Hz)")
        expect(span.textContent).toBe("Frequency  (Hz)")
        const use = span.querySelector("svg use")!
        const id = use.getAttribute("href")!.slice(1)
        expect(root.getElementById(id)).not.toBeNull()
        expect(root.getElementById("masque-glyphs")!.children.length).toBe(1)
        expect(done).toBe(1)
        // The same formula again comes from the cache and adds no second glyph.
        tip.innerHTML = nameHtml("x", "Frequency omega (Hz)", { label: "Frequency omega (Hz)", tex: "Frequency $\\omega$ (Hz)" })
        typesetTex(tip, root)
        await flush(); await flush()
        expect(calls).toEqual(["\\omega"])
        expect(root.getElementById("masque-glyphs")!.children.length).toBe(1)
    })
    it("writes text outside $…$ the way the plain label does", () => {
        expect(texText("Cost \\$ ")).toBe("Cost $ ")
        expect(texText("a \\% b \\_c")).toBe("a % b _c")
    })
    it("finds glyphs in MathJax's own cache when the page has none", async () => {
        fakeMathJax({ offPage: true })
        const host = document.createElement("div"); document.body.appendChild(host)
        const root = host.attachShadow({ mode: "open" })
        const tip = document.createElement("div"); root.appendChild(tip)
        tip.innerHTML = nameHtml("x", "alpha", { label: "alpha", tex: "$\\alpha$" })
        typesetTex(tip, root)
        await flush(); await flush()
        const use = tip.querySelector(".masque-tex svg use")!
        expect(root.getElementById(use.getAttribute("href")!.slice(1))).not.toBeNull()
    })
    it("keeps the plain text when a glyph can't be found", async () => {
        fakeMathJax({ noGlyph: true })
        const host = document.createElement("div"); document.body.appendChild(host)
        const root = host.attachShadow({ mode: "open" })
        const tip = document.createElement("div"); root.appendChild(tip)
        tip.innerHTML = nameHtml("x", "Cost beta", { label: "Cost beta", tex: "Cost $\\beta$" })
        typesetTex(tip, root)
        await flush(); await flush()
        expect(tip.querySelector(".masque-tex svg")).toBeNull()
        expect(tip.querySelector(".masque-tex")!.textContent).toBe("Cost beta")
    })
    it("typesets once MathJax arrives after the tooltip", async () => {
        const host = document.createElement("div"); document.body.appendChild(host)
        const root = host.attachShadow({ mode: "open" })
        const tip = document.createElement("div"); root.appendChild(tip)
        tip.innerHTML = nameHtml("x", "gamma", { label: "gamma", tex: "$\\gamma$" })
        let done = 0
        typesetTex(tip, root, () => done++)
        await flush()
        expect(tip.querySelector(".masque-tex svg")).toBeNull()
        fakeMathJax()
        await new Promise((r) => setTimeout(r, 400))
        expect(tip.querySelector(".masque-tex svg")).not.toBeNull()
        expect(done).toBe(1)
    })
    it("keeps the plain text when MathJax reports an error or isn't on the page", async () => {
        const tip = document.createElement("div"); document.body.appendChild(tip)
        tip.innerHTML = nameHtml("x", "nope", { label: "nope", tex: "$\\nope$" })
        typesetTex(tip, document)
        await flush()
        expect(tip.querySelector(".masque-tex")!.textContent).toBe("nope")
        fakeMathJax({ fail: /nope/ })
        typesetTex(tip, document)
        await flush(); await flush()
        expect(tip.querySelector(".masque-tex")!.hasAttribute("data-tex")).toBe(true)
        expect(tip.querySelector(".masque-tex")!.textContent).toBe("nope")
    })
    it("leaves glyphs alone outside a shadow root", () => {
        const svg = document.createElementNS(NS, "svg") as SVGElement
        svg.appendChild(document.createElementNS(NS, "use"))
        expect(adoptGlyphs(svg, document)).toBe(true)
        expect(document.getElementById("masque-glyphs")).toBeNull()
    })
})
