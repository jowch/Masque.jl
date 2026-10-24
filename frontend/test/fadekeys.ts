import type { FadeEl } from "../src/fade"

// The picks the closed-mark selected look holds (fade.ts), as `layer:index` keys, every axis
// together: what g.sel used to hold for circles, rects and polygons.
export const fadeKept = (shadow: ShadowRoot): string[] =>
    ([...shadow.querySelectorAll(".masque-fade")] as FadeEl[]).flatMap((w) => w.masqueFade?.kept ?? [])

// The picks drawn with a lone-pick outline.
export const fadeLone = (shadow: ShadowRoot): string[] =>
    ([...shadow.querySelectorAll(".masque-fade")] as FadeEl[]).flatMap((w) => w.masqueFade?.lone ?? [])

// How many times the fade has redrawn, every axis together.
export const fadeDraws = (shadow: ShadowRoot): number =>
    ([...shadow.querySelectorAll(".masque-fade")] as FadeEl[]).reduce((n, w) => n + (w.masqueFade?.draws ?? 0), 0)
