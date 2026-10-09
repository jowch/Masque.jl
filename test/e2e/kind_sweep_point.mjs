// Shared by kind_sweep.mjs and polish_verify.mjs.

// A point a little inside the front-most drawn quad at surface point k, so the quad's nearest
// corner is k. The vertex pixel itself can sit on the surface's silhouette, where a synthetic
// MouseEvent's integer clientX/Y lands a pixel outside every quad.
export function surfacePoint(g, k) {
  const ni = g.ni, w = ni - 1, a = k % ni, b = Math.floor(k / ni);
  const x = g.xy[2 * k], y = g.xy[2 * k + 1];
  for (const q of g.order) {
    const qa = q % w, qb = Math.floor(q / w);
    if (a - qa < 0 || a - qa > 1 || b - qb < 0 || b - qb > 1) continue;
    const k0 = qa + qb * ni, ks = [k0, k0 + 1, k0 + ni, k0 + ni + 1];
    const cx = ks.reduce((s, c) => s + g.xy[2 * c], 0) / 4, cy = ks.reduce((s, c) => s + g.xy[2 * c + 1], 0) / 4;
    return { x: x + 0.3 * (cx - x), y: y + 0.3 * (cy - y) };
  }
  return { x, y };
}
