// :surface hit-testing (docs/dev/architecture/03-interactables.md, SurfaceInteractable). Julia
// ships the projected points of a 3D surface and its quads sorted front to back; the first quad
// under the pointer is the visible one, and its corner nearest the pointer is the answer. The
// highlight is that point's dual cell: the polygon through the midpoints of its grid edges and
// the centres of its quads, drawn with the closed-mark recipe.
import type { Hit, HitLayer, SurfaceGeometry } from "./types"

// [x, y] of shipped point k, or null when it is not drawn.
function vertex(g: SurfaceGeometry, k: number): [number, number] | null {
    const x = g.xy[2 * k], y = g.xy[2 * k + 1]
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
}

// Strictly inside or on the edge of triangle (a, b, c), either winding.
function inTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0
    return !(neg && pos)
}

// The point's dual cell, flat [x, y, …]: going round the point, each drawn quad adds its edge
// midpoints and its centre; where a quad is missing (the grid's edge, a NaN hole, a clipped
// corner) the ring passes through the point itself.
export function dualCell(g: SurfaceGeometry, k: number): number[] {
    const ni = g.ni, nj = g.nj
    const a = k % ni, b = (k - a) / ni
    const p = vertex(g, k)
    if (!p) return []
    const at = (aa: number, bb: number): [number, number] | null =>
        aa < 0 || bb < 0 || aa >= ni || bb >= nj ? null : vertex(g, aa + bb * ni)
    // Neighbours E, N, W, S in grid directions; sector s lies between neighbour s and s+1.
    const steps: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
    const nb = steps.map(([da, db]) => at(a + da, b + db))
    const ring: number[] = []
    const push = (x: number, y: number): void => {
        const n = ring.length
        if (n >= 2 && ring[n - 2] === x && ring[n - 1] === y) return
        ring.push(x, y)
    }
    for (let s = 0; s < 4; s++) {
        const [da0, db0] = steps[s], [da1, db1] = steps[(s + 1) % 4]
        const n0 = nb[s], n1 = nb[(s + 1) % 4], far = at(a + da0 + da1, b + db0 + db1)
        if (n0 && n1 && far) {
            push((p[0] + n0[0]) / 2, (p[1] + n0[1]) / 2)
            push((p[0] + n0[0] + n1[0] + far[0]) / 4, (p[1] + n0[1] + n1[1] + far[1]) / 4)
            push((p[0] + n1[0]) / 2, (p[1] + n1[1]) / 2)
        } else {
            push(p[0], p[1])
        }
    }
    if (ring.length >= 4 && ring[0] === ring[ring.length - 2] && ring[1] === ring[ring.length - 1]) ring.length -= 2
    return ring
}

// Point k as a hit: its source (i, j) and z for the bond, and its dual cell for the highlight.
// A suspended layer, or a point that is not drawn, has no geometry to draw from.
export function surfacePointHit(layer: HitLayer, k: number): Omit<Hit, "layer"> | null {
    const g = layer.geometry as SurfaceGeometry
    if (g.suspended || !g.xy || !Number.isInteger(k) || k < 0 || k >= g.ni * g.nj) return null
    const ring = dualCell(g, k)
    if (ring.length < 6) return null
    const a = k % g.ni, b = (k - a) / g.ni
    return { index: k, grid_: [g.i[a], g.j[b], g.z[k]], geom_: ["poly", ring] }
}

// The quad under (px, py) nearest the camera, answered by its corner nearest the pointer.
export function hitSurface(layer: HitLayer, px: number, py: number): Omit<Hit, "layer"> | null {
    const g = layer.geometry as SurfaceGeometry
    if (g.suspended || !g.xy || !g.order) return null
    const ni = g.ni, w = ni - 1, xy = g.xy
    for (const q of g.order) {
        const a = q % w, b = (q - a) / w
        const k0 = a + b * ni, k1 = k0 + 1, k2 = k0 + ni, k3 = k2 + 1
        const x0 = xy[2 * k0], y0 = xy[2 * k0 + 1], x1 = xy[2 * k1], y1 = xy[2 * k1 + 1]
        const x2 = xy[2 * k2], y2 = xy[2 * k2 + 1], x3 = xy[2 * k3], y3 = xy[2 * k3 + 1]
        if (px < Math.min(x0, x1, x2, x3) || px > Math.max(x0, x1, x2, x3)) continue
        if (py < Math.min(y0, y1, y2, y3) || py > Math.max(y0, y1, y2, y3)) continue
        // Corners in ring order k0, k1, k3, k2, split on the k0–k3 diagonal.
        if (!inTriangle(px, py, x0, y0, x1, y1, x3, y3) && !inTriangle(px, py, x0, y0, x3, y3, x2, y2)) continue
        let best = k0, bd = Infinity
        for (const k of [k0, k1, k2, k3]) {
            const d = (xy[2 * k] - px) ** 2 + (xy[2 * k + 1] - py) ** 2
            if (d < bd) { bd = d; best = k }
        }
        return surfacePointHit(layer, best)
    }
    return null
}

// The fields a point shows in its tooltip, 1-based like `GridCellEvent`: i, j, x, y, z, and
// value when the colour matrix shipped. A payload's own fields are merged on top by the caller.
export function surfaceFields(layer: HitLayer, k: number): Record<string, number> {
    const g = layer.geometry as SurfaceGeometry
    const a = k % g.ni, b = (k - a) / g.ni, n = g.ni * g.nj
    const out: Record<string, number> = {
        i: g.i[a] + 1, j: g.j[b] + 1,
        x: g.x.length === n ? g.x[k] : g.x[a],
        y: g.y.length === n ? g.y[k] : g.y[b],
        z: g.z[k],
    }
    if (g.value) out.value = g.value[k]
    return out
}

// The point's projected position, which the tooltip sits above.
export function surfaceVertex(layer: HitLayer, k: number): [number, number] | null {
    const g = layer.geometry as SurfaceGeometry
    return g.suspended || !g.xy ? null : vertex(g, k)
}
