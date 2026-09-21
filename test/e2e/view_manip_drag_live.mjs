// Live-verify ViewInteractable drag-to-pan / drag-to-orbit through Pluto.
//   node view_manip_drag_live.mjs <base-url> <notebook-abs-path> <evidence-dir>
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const base = process.argv[2];
const notebook = process.argv[3];
const evidence = process.argv[4] || ".";
if (!base || !notebook) {
  console.error("usage: node view_manip_drag_live.mjs <base-url> <notebook-abs-path> [evidence-dir]");
  process.exit(2);
}
fs.mkdirSync(evidence, { recursive: true });

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.error(`${ok ? "PASS" : "FAIL"} ${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

const browser = await chromium.launch({ headless: true });
let failed = null;
let page = null;
try {
  const context = await browser.newContext({ locale: "en-US", timezoneId: "UTC" });
  page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.screenshot({ path: path.join(evidence, "00-open.png"), fullPage: true });

  const deadline = Date.now() + 1500000;
  let ready = false, tick = 0;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const runBtn = [...document.querySelectorAll("button, a")].find((b) =>
        /run notebook code/i.test(b.innerText || b.title || "")
      );
      if (runBtn) runBtn.click();
      const hosts = document.querySelectorAll(".ip-host").length;
      const running = document.querySelectorAll(".running, .queued").length;
      const errored = [...document.querySelectorAll("pluto-cell.errored, .errored")].filter((e) =>
        /Cyclic reference/i.test(e.innerText || "")
      ).length;
      const pan = document.querySelector("#panout")?.textContent || "";
      const orb = document.querySelector("#orbout")?.textContent || "";
      return { hosts, running, errored, pan, orb };
    });
    if (tick % 10 === 0) console.error("wait", st);
    // Don't abort on transient cycle errors from a stale notebook session — wait for
    // a clean ready state (hosts + readouts, zero cyclic errors, idle).
    if (st.hosts >= 2 && st.running === 0 && st.errored === 0 && /lims=/.test(st.pan) && /cam=/.test(st.orb)) {
      ready = true;
      break;
    }
    if (st.errored > 0 && st.running === 0 && tick > 5) {
      failed = `notebook errored cells=${st.errored}`;
    }
    await page.waitForTimeout(3000);
    tick++;
  }
  record("notebook-ready", ready, ready ? "hosts+panout+orbout" : failed || "timeout");
  if (!ready) throw new Error(failed || "notebook not ready");

  await page.screenshot({ path: path.join(evidence, "01-ready.png"), fullPage: true });

  async function hostNear(sel) {
    return page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return -1;
      const hosts = [...document.querySelectorAll(".ip-host")];
      let best = -1, bestDist = Infinity;
      const er = el.getBoundingClientRect();
      for (let i = 0; i < hosts.length; i++) {
        const hr = hosts[i].getBoundingClientRect();
        const dy = Math.abs(hr.bottom - er.top);
        const dx = Math.abs(hr.left - er.left);
        const d = dy + dx * 0.01;
        if (d < bestDist) { bestDist = d; best = i; }
      }
      // Prefer the host *above* the readout (drag surface), not the committed view below.
      // Walk hosts whose bottom is above the readout top.
      let above = -1, aboveDist = Infinity;
      for (let i = 0; i < hosts.length; i++) {
        const hr = hosts[i].getBoundingClientRect();
        if (hr.bottom <= er.top + 8) {
          const d = er.top - hr.bottom;
          if (d < aboveDist) { aboveDist = d; above = i; }
        }
      }
      return above >= 0 ? above : best;
    }, sel);
  }

  async function dragHost(idx, dxCss, dyCss) {
    const ok = await page.evaluate(([i, dx, dy]) => {
      const host = [...document.querySelectorAll(".ip-host")][i];
      if (!host) return false;
      let sr = null;
      host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const surface = sr?.querySelector(".surface");
      const media = host.querySelector("img, canvas");
      if (!surface || !media) return false;
      const b = media.getBoundingClientRect();
      const ax = b.x + b.width * 0.45, ay = b.y + b.height * 0.55;
      const bx = ax + dx, by = ay + dy;
      // dispatchEvent bypasses hit-testing/capture redirection — it always fires on the element
      // you call it on — so drive move/up on `surface` directly (overlay.ts drives its drag path
      // off pointer capture on the surface now, not window listeners).
      const pid = { pointerId: 1, pointerType: "mouse", isPrimary: true };
      surface.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, cancelable: true, clientX: ax, clientY: ay, ...pid }));
      for (let t = 0.25; t <= 1.0; t += 0.25) {
        surface.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true, cancelable: true, ...pid,
          clientX: ax + (bx - ax) * t, clientY: ay + (by - ay) * t,
        }));
      }
      surface.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX: bx, clientY: by, ...pid }));
      return true;
    }, [idx, dxCss, dyCss]);
    if (!ok) throw new Error(`dragHost(${idx}) failed — no surface`);
  }

  // #102/§12.3: a view gesture commits nothing — waitChange() used to poll #panout/#orbout for
  // a bond change that this drag will never produce. gestureStamp() reads mount.ts's
  // host.dataset.masqueGestureFrame instead: written atomically with every {png, manifest} swap
  // the gesture channel applies, so its counter advancing is the real "a frame landed" signal,
  // the same one test/e2e/kind_sweep.mjs's view/view-gesture-frame check uses.
  async function gestureStamp(idx) {
    return page.evaluate((i) => {
      const host = [...document.querySelectorAll(".ip-host")][i];
      return host?.dataset.masqueGestureFrame ?? null;
    }, idx);
  }
  async function waitStamp(idx, before, label, ms = 120000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const now = await gestureStamp(idx);
      if (now && now !== before) return now;
      await page.waitForTimeout(500);
    }
    throw new Error(`${label}: gesture-channel frame never landed (stamp stayed ${JSON.stringify(before)})`);
  }

  // --- pan (drag surface above #panout) ---
  const panIdx = await hostNear("#panout");
  record("pan-host-index", panIdx >= 0, { panIdx });
  const panBefore = await page.locator("#panout").innerText();
  const panStampBefore = await gestureStamp(panIdx);
  await dragHost(panIdx, 80, 0);
  const panStampAfter = await waitStamp(panIdx, panStampBefore, "pan-drag");
  const panAfter = await page.locator("#panout").innerText();
  record("drag-pan-no-commit", panAfter === panBefore, panAfter.slice(0, 160));
  record("drag-pan-gesture-frame", /"n":\d+/.test(panStampAfter), panStampAfter);
  await page.locator(".ip-host").nth(panIdx).screenshot({ path: path.join(evidence, "02-after-pan.png") });

  // --- orbit ---
  const orbIdx = await hostNear("#orbout");
  record("orbit-host-index", orbIdx >= 0, { orbIdx });
  const orbBefore = await page.locator("#orbout").innerText();
  const orbStampBefore = await gestureStamp(orbIdx);
  await dragHost(orbIdx, 100, 40);
  const orbStampAfter = await waitStamp(orbIdx, orbStampBefore, "orbit-drag");
  const orbAfter = await page.locator("#orbout").innerText();
  record("drag-orbit-no-commit", orbAfter === orbBefore, orbAfter.slice(0, 160));
  record("drag-orbit-gesture-frame", /"n":\d+/.test(orbStampAfter), orbStampAfter);
  await page.locator(".ip-host").nth(orbIdx).screenshot({ path: path.join(evidence, "03-after-orbit.png") });

  const interesting = pageErrors.filter((m) => !/ResizeObserver|favicon/i.test(m));
  record("console-clean", interesting.length === 0, { interesting, pageErrors });

  fs.writeFileSync(path.join(evidence, "results.json"), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => !r.ok);
  if (bad.length) {
    console.error("FAILED", bad);
    process.exit(1);
  }
  console.error("ALL PASS", results.length);
} catch (e) {
  console.error("FATAL", e);
  if (page) await page.screenshot({ path: path.join(evidence, "fatal.png"), fullPage: true }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
