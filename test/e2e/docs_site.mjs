// The built docs site for the Playwright drivers: a static server for `docs/build`, and the
// Pluto frontend the players load from jsDelivr, served from the Julia depot.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { extname, join, normalize, sep } from "node:path";

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webp": "image/webp",
};

export function serve(dir, rewrite = null) {
  return createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = normalize(join(dir, p));
    const prefix = dir.endsWith(sep) ? dir : dir + sep;
    if (file !== dir && !file.startsWith(prefix)) {
      res.writeHead(403); res.end(); return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.setHeader("content-type", MIME[extname(file)] || "application/octet-stream");
    const body = readFileSync(file);
    res.end(rewrite && extname(file) === ".html" ? rewrite(body.toString("utf8"), p) : body);
  });
}

// Pluto's static export loads its editor from jsDelivr. On the docs CI runner
// that document reaches readyState "complete" and still never creates
// .ip-host. The same file boots when those scripts load. Serve the copy
// already in the Julia depot (the harvest that wrote the HTML used it).
function plutoFrontendDirs() {
  const depots = (process.env.JULIA_DEPOT_PATH || join(homedir(), ".julia")).split(":");
  const dirs = [];
  for (const depot of depots) {
    if (!depot) continue;
    const root = join(depot, "packages", "Pluto");
    if (!existsSync(root)) continue;
    for (const slug of readdirSync(root)) {
      const dist = join(root, slug, "frontend-dist");
      if (existsSync(dist)) dirs.push(dist);
    }
  }
  return dirs;
}

const plutoDists = plutoFrontendDirs();

export const PLUTO_FRONTEND = /https:\/\/cdn\.jsdelivr\.net\/gh\/JuliaPluto\/Pluto\.jl@[^/]+\/frontend-dist\//;

export function localPlutoAsset(url) {
  const marker = "/frontend-dist/";
  const i = url.indexOf(marker);
  if (i < 0) return null;
  let name = url.slice(i + marker.length).split("?")[0].split("#")[0];
  try { name = decodeURIComponent(name); } catch { return null; }
  if (!name || name.split("/").includes("..")) return null;
  for (const dir of plutoDists) {
    const file = normalize(join(dir, name));
    const prefix = dir.endsWith(sep) ? dir : dir + sep;
    if (file !== dir && !file.startsWith(prefix)) continue;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}
