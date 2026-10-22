// Figure colours: the background's light/dark side, shared by mount.ts (chrome greys) and
// fade.ts (the faded marks and the pick outlines).

// Parses the handful of CSS colour syntaxes build_manifest's `background` kwarg actually emits
// (#rrggbb/#rgb, rgb()/rgba()) — not a general CSS colour parser (no named colours, hsl(), etc.);
// an unparseable or absent string falls through to "light" below anyway.
export function parseRGB(css: string): [number, number, number] | null {
    const hex6 = css.match(/^#([0-9a-f]{6})$/i)
    if (hex6) { const n = parseInt(hex6[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
    const hex3 = css.match(/^#([0-9a-f]{3})$/i)
    if (hex3) { const [r, g, b] = [...hex3[1]].map((c) => parseInt(c + c, 16)); return [r, g, b] }
    const rgb = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
    if (rgb) return [parseFloat(rgb[1]), parseFloat(rgb[2]), parseFloat(rgb[3])]
    return null
}

// Same light/dark pivot as mount.ts's --masque-ink: 49.44 is the lch lightness of middle grey
// (#808080), the exact threshold the CSS lch(from --masque-fig-bg …) clamp already pivots on for
// the tooltip theme. --masque-chrome is one of two fixed greys written once at mount (it isn't a
// live lch(from …) derivation like the tooltip vars), so this mirrors that CSS math in JS:
// sRGB → relative luminance → CIE L*. A plain WCAG relative-luminance cutoff (Y > 0.5) pivots
// at a different point than lch lightness and would disagree with the tooltip theme on some
// backgrounds — matching the constant keeps the two derivations in lockstep.
export function isLightBackground(css: string | undefined): boolean {
    const rgb = css ? parseRGB(css) : null
    if (!rgb) return true // unparseable/absent → light, matching --masque-fig-bg's own #ffffff default
    const [r, g, b] = rgb.map((c) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const lStar = y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
    return lStar > 49.44
}
