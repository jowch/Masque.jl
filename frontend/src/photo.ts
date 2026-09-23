// Photographic pan/zoom of the last frame (#85). The matrix is in the shown frame's image
// pixels: `translate(tx, ty) scale(s)` with origin at (0, 0), so a point p lands at s*p + t.
// Wheel notches compose with `tx' = tx + (s - ns) * localX` (same for y). A form that
// divides by the current scale walks off the cursor.

export interface PhotoMatrix {
    s: number
    tx: number
    ty: number
}

export const IDENTITY: PhotoMatrix = { s: 1, tx: 0, ty: 0 }

// A flick should not request a degenerate window before the next frame lands.
const S_MIN = 1 / 16
const S_MAX = 16

export const WHEEL_IDLE_MS = 150

export function isIdentity(m: PhotoMatrix): boolean {
    return Math.abs(m.s - 1) < 1e-6 && Math.abs(m.tx) < 1e-3 && Math.abs(m.ty) < 1e-3
}

// deltaMode 0 is pixels, 1 is lines, 2 is pages. Wheel-up (negative deltaY) zooms in.
export function wheelScale(deltaY: number, deltaMode: number): number {
    const lines = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
    return Math.exp(-lines * 0.001)
}

export function zoomAt(m: PhotoMatrix, local: { x: number; y: number }, k: number): PhotoMatrix {
    const ns = Math.min(S_MAX, Math.max(S_MIN, m.s * k))
    return {
        s: ns,
        tx: m.tx + (m.s - ns) * local.x,
        ty: m.ty + (m.s - ns) * local.y,
    }
}

// Grabbed image point `anchor` stays under the layout point `cur`. Scale is unchanged.
export function panTo(anchor: { x: number; y: number }, cur: { x: number; y: number }, s: number): PhotoMatrix {
    return { s, tx: cur.x - s * anchor.x, ty: cur.y - s * anchor.y }
}

// The sent frame is now the shown image. `s = sNow / sSent`, `t = tNow - tSent * s`
// is the matrix, in the new frame, that keeps the screen where the live matrix had it.
export function residual(sent: PhotoMatrix, now: PhotoMatrix): PhotoMatrix {
    const s = now.s / sent.s
    return { s, tx: now.tx - sent.tx * s, ty: now.ty - sent.ty * s }
}

export function mapPoint(m: PhotoMatrix, p: { x: number; y: number }): { x: number; y: number } {
    return { x: m.s * p.x + m.tx, y: m.s * p.y + m.ty }
}

// Inverse of `mapPoint`. A layout point on the untransformed base is the content pixel
// under the cursor once a photographic matrix is live.
export function unmapPoint(m: PhotoMatrix, p: { x: number; y: number }): { x: number; y: number } {
    const s = m.s > 0 ? m.s : 1
    return { x: (p.x - m.tx) / s, y: (p.y - m.ty) / s }
}

// Layout point → content pixel. Identity keeps the same point: the base is not transformed,
// so layout and content coincide until a photograph is live.
export function contentPoint(m: PhotoMatrix, layout: { x: number; y: number }): { x: number; y: number } {
    return isIdentity(m) ? layout : unmapPoint(m, layout)
}
