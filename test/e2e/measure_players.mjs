// Reserve each docs player's height before it loads, so the page doesn't move when the
// player draws. Runs on `docs/build` after makedocs and before deploy (docs/make.jl).
//
// A player's height depends on the column: its picture scales with the width and its code
// cells rewrap. So this opens every page with players once, widens the window through several
// widths, waits at each for every iframe to settle at its own height, and writes the heights
// into the page as container queries on the iframe's `.masque-embed-wrap`, joined by straight
// lines between the measured widths. The iframe's `height:` in the Markdown is dropped: it was
// one number for every width.
//
//   node measure_players.mjs <docs/build>

import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, normalize, relative, sep } from "node:path";
import { localPlutoAsset, PLUTO_FRONTEND, serve } from "./docs_site.mjs";

const rootArg = process.argv[2];
if (!rootArg) {
  console.error("usage: node measure_players.mjs <docs/build>");
  process.exit(2);
}
const root = normalize(rootArg);

// Phones up to the widest column. Documenter shows the sidebar from 1056 px; past 1280 the
// column stops growing.
const WIDTHS = [360, 390, 430, 520, 600, 640, 800, 1056, 1280];
const SETTLE_MS = 1500;
const TIMEOUT_MS = 45000;
// A player still resizing this late may have settled short of its height: say so.
const LATE_MS = 20000;
const STYLE_ID = "masque-player-heights";

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "embeds" ? [] : htmlFiles(p);
    return name.endsWith(".html") ? [p] : [];
  });
}

const pages = htmlFiles(root).filter((f) => readFileSync(f, "utf8").includes("data-masque-embed="));
if (!pages.length) throw new Error(`no page under ${root} has a player`);

// Heights cache (MASQUE_HEIGHT_CACHE, a JSON file; the docs job sets it on pull requests only).
// A page's heights are reused when nothing that sizes its players changed: its iframe tags,
// the players they load (whose file names their pictures and states by content), the site's
// stylesheets and scripts, and this script.
const IFRAME_RE = /<iframe\b[^>]*\bdata-masque-embed=[^>]*>/g;
const CACHE_FILE = process.env.MASQUE_HEIGHT_CACHE || "";
const sha = (...parts) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\0");
  return h.digest("hex");
};
function siteStyleHash() {
  const dir = join(root, "assets");
  const files = [];
  const walk = (d) => readdirSync(d).forEach((n) => {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(css|js)$/.test(n)) files.push(p);
  });
  if (existsSync(dir)) walk(dir);
  return sha(...files.sort().flatMap((f) => [relative(root, f), readFileSync(f)]));
}
// The browser that measures is part of the key: Chromium comes from the Playwright pin, and
// docs_site.mjs decides which Pluto frontend each player boots.
const browser = await chromium.launch({ headless: true });
const here = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)));
const SITE_KEY = CACHE_FILE
  ? sha(browser.version(), here("measure_players.mjs"), here("docs_site.mjs"), here("package.json"), siteStyleHash())
  : "";
function pageKey(file) {
  const tags = readFileSync(file, "utf8").match(IFRAME_RE) || [];
  const players = tags.map((t) => {
    const name = /data-masque-embed="([^"]+)"/.exec(t)?.[1];
    const p = name && join(root, "embeds", name + ".html");
    if (!p || !existsSync(p)) throw new Error(`${relative(root, file)}: no player file for ${name || t}`);
    return readFileSync(p);
  });
  return sha(SITE_KEY, ...tags, ...players);
}
let cached = {};
if (CACHE_FILE && existsSync(CACHE_FILE)) {
  try { cached = JSON.parse(readFileSync(CACHE_FILE, "utf8")); } catch { cached = {}; }
}
const keys = new Map(CACHE_FILE ? pages.map((f) => [f, pageKey(f)]) : []);

// Load every player at once, not as the reader scrolls to it.
const server = serve(root, (html) => html.replaceAll('loading="lazy"', 'loading="eager"'));
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

function urlOf(file) {
  const rel = relative(root, file).split(sep).join("/");
  return `${origin}/${rel.endsWith("index.html") ? rel.slice(0, -"index.html".length) : rel}`;
}

// Every iframe's id => the [column width, height] pairs it settled at.
const heights = new Map();
const reuse = new Set();
for (const [file, key] of keys) {
  const hit = cached[key];
  if (!hit) continue;
  for (const [id, byWidth] of Object.entries(hit)) {
    heights.set(id, new Map(Object.entries(byWidth).map(([w, h]) => [Number(w), h])));
  }
  reuse.add(file);
}

// Settle every player on the page, then return [id, column width, height, settled at] for
// each. Runs in the page.
async function settleAll({ SETTLE_MS, TIMEOUT_MS }) {
  const frames = Array.from(document.querySelectorAll("iframe[data-masque-embed]"));
  const t0 = performance.now();
  const deadline = t0 + TIMEOUT_MS;
  const settled = (f) => {
    const doc = f.contentDocument;
    return doc && doc.URL !== "about:blank" && doc.querySelector("pluto-notebook") &&
      Array.from(doc.images).every((img) => img.complete || img.offsetParent === null);
  };
  const last = new Map(frames.map((f) => [f, { h: -1, since: 0 }]));
  for (;;) {
    const now = performance.now();
    let done = true;
    for (const f of frames) {
      const h = f.getBoundingClientRect().height;
      const s = last.get(f);
      if (h !== s.h || !settled(f)) last.set(f, { h, since: now });
      if (!settled(f) || now - last.get(f).since < SETTLE_MS) done = false;
    }
    if (done) break;
    if (now > deadline) {
      const stuck = frames.filter((f) => !settled(f)).map((f) => f.id);
      throw new Error(`players did not settle: ${stuck.join(", ") || "(still resizing)"}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return frames.map((f) => {
    const wrap = f.closest(".masque-embed-wrap");
    if (!f.id) throw new Error(`a ${f.dataset.masqueEmbed} player has no id`);
    if (!wrap || getComputedStyle(wrap).display === "none") throw new Error(`${f.id} showed its text twin`);
    return [f.id, wrap.clientWidth, Math.ceil(f.getBoundingClientRect().height), last.get(f).since - t0];
  });
}

function record(file, width, got) {
  for (const [id, w, h, settledAt] of got) {
    if (settledAt > LATE_MS) {
      console.warn(`${relative(root, file)} at ${width} px: ${id} last resized at ${(settledAt / 1000).toFixed(1)} s, its height may be short`);
    }
    if (!heights.has(id)) heights.set(id, new Map());
    heights.get(id).set(w, h);
  }
}

// Load the page once at the narrowest window, then widen it one width at a time and let the
// players settle again at each: booting Pluto's frontend is most of a measurement, and a
// resize only rewraps. Every player refits when its column changes width, so the heights match
// a fresh load at each width (checked against the one-load-per-width method on every docs page
// when this changed).
async function measure(file, widths) {
  const order = [...widths].sort((a, b) => a - b);
  const context = await browser.newContext({ viewport: { width: order[0], height: 900 }, locale: "en-US", timezoneId: "UTC" });
  try {
    const page = await context.newPage();
    await page.route(PLUTO_FRONTEND, async (route) => {
      const asset = localPlutoAsset(route.request().url());
      if (asset) await route.fulfill({ path: asset });
      else await route.continue();
    });
    await page.goto(urlOf(file), { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    for (const width of order) {
      await page.setViewportSize({ width, height: 900 });
      record(file, width, await page.evaluate(settleAll, { SETTLE_MS, TIMEOUT_MS }));
    }
  } finally {
    await context.close();
  }
}

// A few pages at a time: each player boots Pluto's frontend.
const jobs = pages.filter((f) => !reuse.has(f));
if (CACHE_FILE) console.log(`heights cache: reused ${reuse.size} of ${pages.length} pages`);
const t_start = Date.now();
try {
  const workers = Array.from({ length: 4 }, async () => {
    while (jobs.length) {
      const file = jobs.shift();
      const run = () => measure(file, WIDTHS);
      // One retry, so one slow boot of Pluto's frontend doesn't hold back the deploy.
      await run().catch((e) => {
        console.warn(`${relative(root, file)}: ${e.message}; trying once more`);
        return run();
      }).catch((e) => {
        throw new Error(`${relative(root, file)}: ${e.message}`);
      });
    }
  });
  await Promise.all(workers);
} finally {
  await browser.close();
  server.close();
}
console.log(`measured ${pages.length - reuse.size} pages in ${((Date.now() - t_start) / 1000).toFixed(0)} s`);

const px = (x) => `${Math.round(x * 10) / 10}px`;

// Below the narrowest measured column the narrowest height holds, above the widest the widest.
function rules(id, byWidth) {
  const pts = [...byWidth].sort((a, b) => a[0] - b[0]);
  const sel = `#${id}`;
  const out = [`${sel} { height: ${px(pts[0][1])}; }`];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [w0, h0] = pts[i];
    const [w1, h1] = pts[i + 1];
    const slope = (h1 - h0) / (w1 - w0);
    out.push(`@container (min-width: ${w0}px) { ${sel} { height: calc(${px(h0)} + (100cqw - ${w0}px) * ${slope.toFixed(4)}); } }`);
  }
  const [wn, hn] = pts[pts.length - 1];
  out.push(`@container (min-width: ${wn}px) { ${sel} { height: ${px(hn)}; } }`);
  return out.join("\n");
}

const pageIds = new Map();
for (const file of pages) {
  let html = readFileSync(file, "utf8");
  const css = [];
  pageIds.set(file, []);
  // The measured rules decide the height; the iframe sets its own once it has drawn.
  html = html.replace(/<iframe\b[^>]*\bdata-masque-embed=[^>]*>/g, (tag) => {
    const id = /\sid="([^"]+)"/.exec(tag)?.[1];
    const byWidth = id && heights.get(id);
    if (!byWidth) throw new Error(`${relative(root, file)}: no height measured for ${id || tag}`);
    pageIds.get(file).push(id);
    css.push(rules(id, byWidth));
    return tag.replace(/\bstyle="([^"]*)"/, (_, style) => `style="${style.replace(/(^|;)\s*height:\s*[\d.]+px;?/, "$1")}"`);
  });
  html = html.replace(new RegExp(`<style id="${STYLE_ID}">[\\s\\S]*?</style>`), "");
  html = html.replace("</head>", `<style id="${STYLE_ID}">\n${css.join("\n")}\n</style></head>`);
  writeFileSync(file, html);
  console.log(`${relative(root, file)}: ${css.length} player${css.length === 1 ? "" : "s"}`);
}

if (CACHE_FILE) {
  // Only this build's pages, so the cache doesn't grow with every change.
  const out = {};
  for (const [file, key] of keys) {
    out[key] = Object.fromEntries(pageIds.get(file).map((id) => [id, Object.fromEntries(heights.get(id))]));
  }
  writeFileSync(CACHE_FILE, JSON.stringify(out));
}
