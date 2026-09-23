// node context_menu.mjs <base-url> <notebook-abs-path> <cairo|webgl> [artifact-dir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [base, notebook, backend, artifactDirArg] = process.argv.slice(2);
if (!base || !notebook || !backend) {
  console.error("usage: node context_menu.mjs <base-url> <notebook> <cairo|webgl> [artifact-dir]");
  process.exit(2);
}
const artifactDir = artifactDirArg || process.env.E2E_ARTIFACT_DIR || null;
if (artifactDir) mkdirSync(artifactDir, { recursive: true });

const SHIM_LEAK = /\b(?:Bonito|comm)\.\w+ is not a function/;
const ALLOWED = [/Bonito\.decode_binary is not a function/, /Bonito\.fetch_binary is not a function/];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const browser = await chromium.launch({
  headless: false,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--max-active-webgl-contexts=64"],
});
const passed = [];
const unexpected = [];
let failed = null;
try {
  const context = await browser.newContext({
    locale: "en-US", timezoneId: "UTC",
    viewport: { width: 1100, height: 1400 },
    deviceScaleFactor: 2,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    const shim = SHIM_LEAK.test(e.message);
    const benign = shim && ALLOWED.some((re) => re.test(e.message));
    if (!benign) unexpected.push(e.message);
    console.error(benign ? "PAGEERROR (known-benign):" : "PAGEERROR:", e.message);
  });

  const WGL_CHURN_RE = /removing WGL context/;
  let lastWglChurnAt = 0;
  page.on("console", (m) => {
    if (WGL_CHURN_RE.test(m.text())) lastWglChurnAt = Date.now();
  });

  await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const deadline = Date.now() + 900000;
  let ready = false;
  let tick = 0;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const runBtn = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
      if (runBtn && !window.__masqueClickedRun) { runBtn.click(); window.__masqueClickedRun = true; }
      const hosts = [...document.querySelectorAll(".ip-host")];
      let surfaces = 0;
      for (const h of hosts) {
        let sr = null; h.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        if (sr && sr.querySelector(".surface")) surfaces++;
      }
      let metaN = 0;
      try { metaN = JSON.parse(document.querySelector("#kind_meta")?.textContent || "[]").length; } catch { metaN = 0; }
      const scatter = document.querySelector("#coords_scatter");
      const hostsBefore = scatter
        ? [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(scatter) & Node.DOCUMENT_POSITION_FOLLOWING))
        : [];
      const plot = hostsBefore.at(-1);
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        errored: document.querySelectorAll("pluto-cell.errored").length,
        surfaces, metaN,
        base: !!(plot && plot.querySelector("img, canvas")),
        errText: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).slice(0, 1).join("").slice(0, 300),
      };
    });
    if (st.errored) throw new Error(`${backend} notebook errored: ${st.errText}`);
    const wglQuiet = backend !== "webgl" || !lastWglChurnAt || (Date.now() - lastWglChurnAt) > 3000;
    if (!st.busy && st.metaN >= 14 && st.surfaces >= st.metaN && st.base && wglQuiet) { ready = true; break; }
    if (tick % 15 === 0) console.error(`  …${backend} [${tick}s] busy=${st.busy} surfaces=${st.surfaces} meta=${st.metaN} base=${st.base}`);
    tick++;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error(`${backend}: timed out waiting for widgets`);

  await page.evaluate(() => {
    window.__masqueMenu = [];
    document.addEventListener("contextmenu", (e) => {
      const t = e.target;
      window.__masqueMenu.push({
        tag: t.tagName,
        prevented: e.defaultPrevented,
        src: t instanceof HTMLImageElement ? (t.currentSrc || t.src) : "",
      });
    }, true);
  });

  const hostBox = async (key) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const box = await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        if (!host) return null;
        host.scrollIntoView({ block: "center", inline: "nearest" });
        const baseEl = host.querySelector("img, canvas");
        if (!baseEl) return null;
        const b = baseEl.getBoundingClientRect();
        if (!(b.width > 0 && b.height > 0)) return null;
        return {
          left: b.left, top: b.top, width: b.width, height: b.height,
          tag: baseEl.tagName,
          frame: host.dataset.masqueGestureFrame || "",
        };
      }, key);
      if (box) return box;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`${key}: base element not in the DOM`);
  };

  const menuEvents = () => page.evaluate(() => window.__masqueMenu);
  const clearMenu = () => page.evaluate(() => { window.__masqueMenu = []; });

  async function rightClick(key) {
    await clearMenu();
    const box = await hostBox(key);
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.click(x, y, { button: "right" });
    await page.waitForFunction(() => window.__masqueMenu.length > 0, { timeout: 2000 });
    const events = await menuEvents();
    return { box, events, x, y };
  }

  const expectBase = backend === "cairo" ? "IMG" : "CANVAS";

  for (const key of ["scatter", "heatmap"]) {
    const { events } = await rightClick(key);
    const hit = events[events.length - 1];
    if (hit.tag !== expectBase || hit.prevented) {
      throw new Error(`${key}: contextmenu target ${hit.tag} prevented=${hit.prevented}`);
    }
    if (backend === "cairo") {
      const png = await page.evaluate(async (src) => {
        const buf = new Uint8Array(await (await fetch(src)).arrayBuffer());
        return { len: buf.length, magic: [...buf.slice(0, 8)] };
      }, hit.src);
      if (png.len < 1000 || PNG_MAGIC.some((b, i) => png.magic[i] !== b)) {
        throw new Error(`${key}: base image is not a PNG (${png.len} bytes, magic ${png.magic})`);
      }
    }
    if (artifactDir && key === "scatter") {
      await page.screenshot({ path: join(artifactDir, `${backend}-scatter-contextmenu.png`) });
    }
    await page.keyboard.press("Escape");
    passed.push(`${key}/contextmenu-targets-${expectBase}`);
  }

  for (const key of ["threshold", "view"]) {
    const before = await hostBox(key);
    await clearMenu();
    const x = before.left + before.width / 2;
    const y = before.top + before.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(x + 36, y + 24);
    const mid = await page.evaluate((k) => {
      const span = document.querySelector(`#coords_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const surface = sr.querySelector(".surface");
      return { grabbing: surface.classList.contains("grabbing"), passthrough: surface.classList.contains("passthrough") };
    }, key);
    await page.mouse.up({ button: "right" });
    await new Promise((r) => setTimeout(r, 400));
    const afterFrame = await page.evaluate((k) => {
      const span = document.querySelector(`#coords_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      return {
        frame: host.dataset.masqueGestureFrame || "",
        grabbing: sr.querySelector(".surface").classList.contains("grabbing"),
      };
    }, key);
    if (mid.grabbing || afterFrame.grabbing) throw new Error(`${key}: right-drag engaged grabbing ${JSON.stringify({ mid, afterFrame })}`);
    if (key === "view" && afterFrame.frame !== before.frame) {
      throw new Error(`${key}: right-drag wrote a gesture frame ${afterFrame.frame}`);
    }
    const events = await menuEvents();
    const hit = events[events.length - 1];
    if (!hit || hit.tag !== expectBase || hit.prevented) {
      throw new Error(`${key}: contextmenu ${JSON.stringify(hit)}`);
    }
    await page.keyboard.press("Escape");
    passed.push(`${key}/right-drag-does-not-start`);
  }

  const custom = await page.evaluate(() => {
    const found = [];
    for (const h of document.querySelectorAll(".ip-host")) {
      h.querySelectorAll("*").forEach((el) => {
        if (!el.shadowRoot) return;
        el.shadowRoot.querySelectorAll("[role=menu], .masque-menu, .context-menu").forEach((n) => found.push(n.className));
      });
    }
    return found;
  });
  if (custom.length) throw new Error(`custom context menu in the overlay: ${custom.join(", ")}`);
  passed.push("no-custom-menu");

  {
    const layers = await page.evaluate(() => JSON.parse(document.querySelector("#coords_scatter").textContent));
    const pts = layers.find((l) => l.kind === "circles");
    const box = await hostBox("scatter");
    const s = box.width / (await page.evaluate(() => {
      const span = document.querySelector("#coords_scatter");
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      return sr.querySelector("svg").viewBox.baseVal.width;
    }));
    const x = box.left + pts.geometry[0] * s;
    const y = box.top + pts.geometry[1] * s;
    await page.evaluate(() => {
      const span = document.querySelector("#coords_scatter");
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      window.__masqueClick = { fired: false, value: null };
      host.addEventListener("input", () => { window.__masqueClick = { fired: true, value: host.value }; }, { once: true });
    });
    await page.mouse.move(x, y);
    await page.waitForFunction(() => {
      const span = document.querySelector("#coords_scatter");
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const tipEl = sr.querySelector(".masque-tip");
      return tipEl.textContent.length > 0 && getComputedStyle(tipEl).opacity !== "0";
    }, { timeout: 3000 });
    await page.mouse.click(x, y);
    await page.waitForFunction(() => window.__masqueClick?.fired === true, { timeout: 5000 });
    const result = await page.evaluate(() => window.__masqueClick);
    if (!result?.value || result.value.layer !== pts.id) {
      throw new Error(`scatter click after menu: ${JSON.stringify(result)}`);
    }
    passed.push("scatter/click-and-hover-after-menu");
  }

  if (unexpected.length) throw new Error(`page errors: ${unexpected.join(" | ")}`);
  passed.push("no-console-errors");
  console.log(`CONTEXT MENU OK — ${backend}: ${passed.join(", ")}`);
} catch (e) {
  failed = e;
} finally {
  await browser.close();
}
if (failed) {
  console.error(`CONTEXT MENU FAIL (${backend}, after ${passed.join(", ")}):`, failed.message);
  process.exit(1);
}
