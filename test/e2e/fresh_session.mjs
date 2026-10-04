// Shut down any Pluto session already open on `notebook`, so the next /open runs it fresh.
//
// A session keeps its @bind values for as long as it is open, and since #272 the overlay shows
// the restored value, not the `selected=` seed. kind_sweep.mjs clicks every widget, so without
// this polish_verify.mjs and keyboard_a11y.mjs (run next on the same server in CI) would open
// on kind_sweep's last clicks instead of the seeds they check. A cold server has nothing open
// and this is a no-op.
//
// /notebooklist is a MessagePack map of notebook id => path; ids are UUID strings, each one
// written right before its path (after a 1–3 byte string header).
export async function shutdownOpenSession(base, notebook) {
  const res = await fetch(`${base}/notebooklist`);
  if (!res.ok) throw new Error(`notebooklist: HTTP ${res.status}`);
  const s = Buffer.from(await res.arrayBuffer()).toString("latin1");
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
  for (const m of s.matchAll(uuid)) {
    const after = m.index + m[0].length;
    const at = s.indexOf(notebook, after);
    if (at < 0 || at > after + 3) continue;
    const r = await fetch(`${base}/shutdown?id=${m[0]}`);
    if (!r.ok) throw new Error(`shutdown ${m[0]}: HTTP ${r.status}`);
    console.error(`phase: shut down the open session on ${notebook} for a fresh run`);
  }
}
