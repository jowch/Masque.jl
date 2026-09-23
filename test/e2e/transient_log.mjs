// Durable in-page recorder for the transient masque-enter/masque-leave classes (#99, round 2).
//
// The overlay's enter/leave fade (frontend/src/highlight.ts's clearHi, MOTION_MS = 80-120ms) is
// a transient: the class exists for a bounded window and then the element is gone. Sampling it
// with a single page.evaluate at a hand-picked instant (the original approach in kind_sweep.mjs
// and polish_verify.mjs) is a bet on scheduling, not a test — issue #99's own investigation
// (see the PR this file shipped with) showed the same forced failure going from 0/4 to 3/5
// reproductions purely by restructuring the evaluate around it, with no product code changed.
// A MutationObserver installed BEFORE the interaction turns the transient into durable state:
// childList (element add/remove) and class-attribute mutations on g.hi/g.sel/g.link, across all
// three blend svgs, are appended to an array kept on the widget's own `.ip-host` element. Each
// svg has two of those groups: the photograph one inside g.masque-photo, and the screen-fixed
// one inside g.masque-fixed (legend, colorbar, axis). querySelector would bind the first and
// miss a legend hover, which is why every match is observed. Runner
// speed then changes WHEN entries land, not WHETHER they do — the array can be read any time
// after the interaction, at whatever pace page.evaluate round trips actually take.
//
// Scope: only the four assertion families that used to sample a transient (no-pulse/firstEnter,
// remount-fade, links-fade at both call sites) go through this. Click/bond/tooltip/geometry/
// selection assertions read stable state and are untouched.
//
// Shared between kind_sweep.mjs (per-key sweep) and polish_verify.mjs (scatter-only chrome
// check) — both already use the same `#coords_${key}` marker convention (duplicated inline in
// each evaluate below, matching this file's existing style rather than trying to share a
// function reference across the Node/page boundary) to find a widget's `.ip-host` among the
// page's many.

// Installs the recorder for `key`'s widget, idempotently (a no-op if already installed — this
// is called once per widget but is safe to call again from a later check in the same widget).
export async function installRecorder(page, key) {
  await page.evaluate((k) => {
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    if (host.__masqueRec) return;
    let nextId = 1;
    const idOf = (el) => {
      if (el.__masqueRecId == null) el.__masqueRecId = nextId++;
      return el.__masqueRecId;
    };
    const rec = { entries: [] };
    host.__masqueRec = rec;
    const findShadowHost = () => {
      let sh = null;
      host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sh = el; });
      return sh;
    };
    let groupObservers = [];
    const attachGroups = () => {
      for (const o of groupObservers) o.disconnect();
      groupObservers = [];
      const shEl = findShadowHost();
      const sr = shEl && shEl.shadowRoot;
      if (!sr) return;
      for (const [svgSel, svgName] of [["svg.masque-fill", "fill"], ["svg.masque-edge", "edge"], ["svg.masque-plain", "plain"]]) {
        const svg = sr.querySelector(svgSel);
        if (!svg) continue;
        for (const group of ["hi", "sel", "link"]) {
          // Both homes: g.masque-photo (data) and g.masque-fixed (legend, colorbar, axis).
          // The photograph group is created first, so a single querySelector never sees a
          // screen-fixed hover.
          for (const g of svg.querySelectorAll(`g.${group}`)) {
            const mo = new MutationObserver((muts) => {
              for (const m of muts) {
                if (m.type === "childList") {
                  // getAttribute, not .className -- on an SVG element .className is an
                  // SVGAnimatedString, not a string, and would log as "[object SVGAnimatedString]".
                  for (const n of m.addedNodes) {
                    rec.entries.push({ t: performance.now(), type: "add", svg: svgName, group, id: idOf(n), classes: n.getAttribute ? n.getAttribute("class") : null });
                  }
                  for (const n of m.removedNodes) {
                    // A removed node's own attributes are untouched after removal, so this is the
                    // class it carried AT THE MOMENT of removal, immune to MutationObserver's
                    // microtask batching (which would otherwise coalesce a remove-class +
                    // add-class pair on a node that's still IN the tree into a single record
                    // showing only the final state) -- this is the one signal the pass/fail
                    // assertions below actually depend on: removed carrying masque-leave (a real
                    // fade completed) vs. removed without it (the genuine "cleared instantly" bug).
                    rec.entries.push({ t: performance.now(), type: "remove", svg: svgName, group, id: idOf(n), classes: n.getAttribute ? n.getAttribute("class") : null });
                  }
                } else if (m.type === "attributes" && m.attributeName === "class") {
                  rec.entries.push({ t: performance.now(), type: "attr", svg: svgName, group, id: idOf(m.target), classes: m.target.getAttribute("class") });
                }
              }
            });
            mo.observe(g, { childList: true, attributes: true, attributeFilter: ["class"], subtree: true });
            groupObservers.push(mo);
          }
        }
      }
    };
    attachGroups();
    // A genuine remount (mount.ts's mount() running again) replaces the shadow-hosting element
    // outright, which would silently orphan groupObservers above -- they'd keep "observing" a
    // detached subtree that never mutates again, and the log would just go quiet with no
    // explanation. mount.ts's cleanup only runs on Pluto's own cell-invalidation promise, so
    // WGLMakie/Bonito's canvas churn (the leading suspect for #99, per CI artifact evidence --
    // see the PR body) does NOT re-invoke mount() in the current architecture; this is
    // defensive, not a response to a confirmed mechanism, and deliberately doesn't touch
    // mount.ts itself (no frontend/ diff, no committed-bundle question) -- watching `host`
    // (persists across a remount) for the shadow-hosting element's identity changing gives the
    // same signal from the test side alone.
    let curShadowHost = findShadowHost();
    const hostObserver = new MutationObserver(() => {
      const sh = findShadowHost();
      if (sh !== curShadowHost) {
        rec.entries.push({ t: performance.now(), type: "hostRemount" });
        curShadowHost = sh;
        attachGroups();
      }
    });
    // childList only, no subtree: mount.ts always attaches/detaches the shadow-hosting element
    // as a DIRECT child of `host` (`host.appendChild(shadowHost)` on mount, `shadowHost.remove()`
    // on cleanup — never replaced in place, never nested under an intermediate wrapper), and a
    // live DOM check confirms `host`'s actual children are flat (base canvas/img + Pluto's own
    // script tags + the shadow host, no deeper light-DOM nesting) — so a direct-child-only
    // observer already sees both halves of a remount (old host removed, new host added).
    // `subtree: true` bought nothing here: shadow DOM encapsulates its own mutations from an
    // ancestor-scoped light-DOM observer regardless of `subtree` (verified with a standalone
    // synthetic-DOM check — a subtree:true observer on a light-DOM ancestor never receives
    // records for mutations inside an attached shadow root), so it was never actually seeing the
    // g.hi/g.sel/g.link mutations the group observers below track; it only added unnecessary
    // traversal scope for no additional signal.
    hostObserver.observe(host, { childList: true });
  }, key);
}

// Current length of the recorded array -- an in-page INDEX, not a timestamp: Node's Date.now()
// and the page's performance.now() don't share an origin, so a timestamp-based window would
// silently include everything or nothing depending on which clock a caller reached for.
export async function logCursor(page, key) {
  return page.evaluate((k) => {
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    return host.__masqueRec ? host.__masqueRec.entries.length : 0;
  }, key);
}

export async function logSince(page, key, cursor) {
  return page.evaluate(([k, c]) => {
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    return host.__masqueRec ? host.__masqueRec.entries.slice(c) : [];
  }, [key, cursor]);
}

// Polls logSince (bounded) until `predicate` is satisfied or the tries run out, returning
// whatever was last read either way. Fade removal can take up to MOTION_MS (~80-120ms); the
// default budget (12 * 25ms = 300ms) comfortably covers that without hanging on a genuine miss.
export async function pollLog(page, key, cursor, predicate, { tries = 12, delayMs = 25 } = {}) {
  let entries = await logSince(page, key, cursor);
  for (let a = 0; a < tries && !predicate(entries); a++) {
    await new Promise((r) => setTimeout(r, delayMs));
    entries = await logSince(page, key, cursor);
  }
  return entries;
}
