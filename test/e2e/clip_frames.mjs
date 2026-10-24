// Shared by the docs clip recorders (cluster_clip.mjs, docs_clip.mjs): a frame's painted
// cursor. docs/dev/clips/assemble_mp4.sh turns the frames into the MP4.
import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "node:fs";

// Painted onto each screenshot at the Playwright pointer: a DOM cursor does not show in a
// headless capture (see home_orbit_gif.mjs).
const CURSOR = [
  [1, 1], [1, 13], [4.5, 10.2], [6.8, 15], [9, 14], [6.7, 9.2], [11, 9],
];

function fillPolygon(png, pts, rgb) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(png.height - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const t = (y + 0.5 - y1) / (y2 - y1);
        xs.push(x1 + t * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i]));
      const xb = Math.min(png.width - 1, Math.floor(xs[i + 1]));
      for (let x = xa; x <= xb; x++) {
        const o = (png.width * y + x) << 2;
        png.data[o] = rgb[0];
        png.data[o + 1] = rgb[1];
        png.data[o + 2] = rgb[2];
        png.data[o + 3] = 255;
      }
    }
  }
}

export function paintCursor(pngPath, cssX, cssY, clip) {
  const png = PNG.sync.read(readFileSync(pngPath));
  const sx = png.width / clip.width;
  const sy = png.height / clip.height;
  const hx = (cssX - clip.x) * sx;
  const hy = (cssY - clip.y) * sy;
  const scale = (28 / 16) * sx;
  const pts = CURSOR.map(([x, y]) => [hx + (x - 1) * scale, hy + (y - 1) * scale]);
  const halo = 1.6 * sx;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const dx = Math.cos(a) * halo;
    const dy = Math.sin(a) * halo;
    fillPolygon(png, pts.map(([x, y]) => [x + dx, y + dy]), [255, 255, 255]);
  }
  fillPolygon(png, pts, [0, 0, 0]);
  writeFileSync(pngPath, PNG.sync.write(png));
}
