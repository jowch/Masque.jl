# Masque.jl — agent notes

Julia package (`Masque`, entry fn `masque`) that overlays JS interactivity on static CairoMakie
plots in Pluto. Browser layer is TypeScript in `frontend/`, bundled by esbuild to a **committed**
`assets/overlay.js`, read by Julia at `__init__`. Manifest shipped to JS via `published_to_js`.

## Commands
- Julia tests: `GROUP=Core julia --project="${MASQUE_DEV_ENV:-$HOME/.julia/environments/masque-dev}" test/runtests.jl` (groups: `Core`
  default, `NoBackend`, `WebGL`; warm env: ~6 min / ~20 s / ~70 s, all test time). **Not** `--project=.`: the test deps (CairoMakie, WGLMakie,
  JSON3, …) are `[extras]`, invisible to the package env — it only "works" when your default
  `@v1.x` env happens to stack them in. Keep the `:-` default: an unset variable would make it
  `--project=`, which silently means `@v1.x`. `scripts/cloud-warm.sh julia` builds that env.
  CI runs `Pkg.test()`, which builds its own fresh env (~6 min precompile cold, may resolve
  newer deps than `$MASQUE_DEV_ENV`) — use it to reproduce a CI-only failure, not day to day.
- Upstream canary (`.github/workflows/UpstreamCanary.yml`, nightly + manual, advisory): runs
  `test/makie_compat_tests.jl` and `test/wgl_compat_tests.jl` against Makie master via
  `test/upstream/canary.jl` (usage at its top). A red run's annotation says whether resolution,
  loading, or a canary broke.
- Frontend gate: `cd frontend && npm run lint && npm run typecheck && npm test && npm run build` (build → `../assets/overlay.js` IIFE + `../assets/masque-webgl.js` ESM)
- Format (Runic, CI-enforced): `julia -e 'using Runic; exit(Runic.main(["--inplace","src","test","bench","docs"]))'` — pass every dir with `.jl`, since CI's `runic-action` has no `paths:` filter and checks the whole repo (including `bench/` and `docs/make.jl`), and tracks the latest Runic (1.7+). Format every `.jl` you add, with current Runic.
- Registry name-clash check (manual, not `Pkg.test`): ask Pkg, which reads General
  however it is stored —
  `julia -e 'using Pkg; println(any(e.name == "Masque" for r in Pkg.Registry.reachable_registries() for e in values(r.pkgs)))'`
  (`false` = unregistered). Don't grep or untar the registry: packed General is a small
  `General.toml` pointer + a tarball whose compression varies by Julia version
  (`.tar.gz` on older, `.tar.zst` on 1.13, and the cloud image has no `zstd`), and
  `grep '^name = "X"$'` only hits `name = "General"`, so it **false-passes**. Do not
  assert unregistered in CI — that fails once General indexes the package and needs
  network.
- **Always verify CI is green before merging.** A merged PR can leave `main` red (PR #11 merged with Runic failing). After a PR's checks finish, `gh run list` / `gh pr checks <n>` must show all green — don't merge on a stale or pending run.

## Releases
- **Milestones are the release plan.** `0.1.1`-style milestones hold the next patch, `0.2.0`-style the next minor. Planned work is an issue; give it a milestone when it is committed to a release. `docs/dev/roadmap.md` keeps the unscheduled backlog.
- **Before 1.0, a patch may add features but never break a call; anything that breaks goes in a minor** and carries the `breaking` label. Pkg treats `0.1.0` → `0.1.1` as compatible, so every user with `0.1` compat receives a patch unasked.
- **`main` always holds the next release.** A PR stays a draft while it waits on an earlier release: one in a later milestone than the earliest open one (patch or minor), or a `breaking` one while the earliest open milestone is a patch. Mark it ready once that release is registered and its milestone closed. The `Release gate` check (`.github/workflows/ReleaseGate.yml`) fails such a PR; it blocks merging once it is a required check in ruleset `main-2`. After closing a milestone, re-run the gate on waiting PRs (Checks tab → Re-run, or add/remove any label).
- **Give a PR the milestone of the issue it closes.** A PR with no milestone (docs, CI) passes the gate.
- **A 0.1.x fix after 0.2 work has landed** goes on a `release-0.1` branch cut from the last `v0.1.x` tag; register from that branch's commit. Create the branch only when needed.
- **Releasing:** move `CHANGELOG.md`'s `[Unreleased]` entries under the new version heading and bump `Project.toml` in one PR; once `main` is green on its merge commit, comment the Registrator command on that commit's page (never quote it in GitHub text); TagBot tags the version; then close the milestone.

## Gotchas (verified this session)
- Bundle injection: inject the esbuild IIFE **unconditionally** — wrapping it in `if(!window.Masque){…}` installs `{}` not `{mount}` (block-scope heisenbug).
- Makie `Figure`s **can't `deepcopy`** (module refs) — save/restore `fig.scene.backgroundcolor[]` instead.
- `save(Stream{format"PNG"}, fig)` is broken — use `Makie.colorbuffer(fig; px_per_unit)` then `save(Stream, img_matrix)`.
- Entry fn is lowercase `masque`: a function named `Masque` clashes with `module Masque`.
- `published_to_js` needs a live Pluto — tests call `build_manifest`/`widget.manifest` directly, never `show`.
- `frontend/src/types.ts` mirrors the Julia `HitLayer`/`AxisTransform`/`Manifest` structs — keep in sync.

## Conventions
- Coords: image px, top-left origin = `Makie.project(ax.scene, pt)` + axis `viewport.origin`, ×`px_per_unit`, y-flipped. Tests assert projected coords land on rendered markers.
- DPI is derived, not fixed: `px_per_unit = 2·min(scene_width, max_width=700)` (Pluto's column).
- CI is the **sole author** of `assets/overlay.js` and `assets/masque-webgl.js` (rebuilds + commits on `main`); committing your local bundle is optional, but a stale committed bundle fails PR CI.

## GitHub-facing text (issues, comments, PR titles/bodies, reviews)
- **Never hard-wrap inside a paragraph.** One paragraph is one long line; let the browser wrap it. Hard wraps at ~80–100 chars are right for `.jl`/`.md` files in the repo and wrong on GitHub — they survive into quotes and replies, reflow badly on narrow screens, and turn a one-word edit into a multi-line diff. Blank lines between paragraphs, list items, and fenced code blocks are unaffected; wrap code inside fences as you normally would.
- Write the **corrected text, not a correction**. Issues and PRs are read as current state, not as a log of what we previously believed. Edit the body or comment in place and delete anything obsolete; don't leave "superseded", "retracting the above", or "correcting my earlier framing" paragraphs — the reader can see the thread, so a stale version plus an apology is worse than the clean version alone.
- Backtick every word that contains `@`: macros (`@bind`, `@htl`, `@testset`, …), handles, anything. A bare `@word` pings the GitHub user of that name, and agents never need to mention anyone.
- Never write a bot's command in GitHub text, not even inside a code span: bots read the raw text. The Registrator command in the #210 tracker body opened General#169650 by accident. Describe the command ("comment the Registrator command on the commit page") instead of quoting it.

## Live verification (standing practice — not optional)
Unit/frontend tests assert the manifest and the JS in isolation; they don't prove the rendered
widget behaves for the user. **Any change that can alter what the user interacts with — or
what they see — must be live-verified in a real Pluto + browser on every supported backend
across the interactable kinds before it's called done** (today: CairoMakie and WGLMakie /
`:webgl`; same rule for any future backend — all backends, not one). A 2-plot kitchen-sink
is **not** enough. Agents run the playbook — do not ask the maintainer to click through
plots.

"User-facing" includes **backend/Julia-only changes**: the manifest shape, payload contents,
hit-test geometry, projection/DPI, `@bind` value, hover/tooltip text, overlay chrome, and
visual recipes all originate in Julia. The test passing is necessary, not sufficient. (E.g.
the grid `values[]` cap is a pure-Julia change with no visible markup, yet it changes hover
text and the bond payload → it gets a live check on every backend × the kinds it touches.)
- **What "live-verified" means:** on each backend, open the affected cases in headless Pluto,
  drive them with Playwright (hover/click/drag), and confirm the actual on-screen result —
  tooltip text **and** tooltip theme, highlight recipe (wash / ring / hover outline), remount
  fade (no pulse), `@bind` round-trip, geometry on the mark (not offset), no console errors —
  matches intent. Inspect the real `published_to_js` manifest in-page when the change is
  about payload shape (unit tests never call `show`). **Agents run**
  `docs/dev/live-interaction-checklist.md` via **both** `test/e2e/kind_sweep.mjs` **and**
  `test/e2e/polish_verify.mjs` (Cairo **and** WGL) across scatter, lines/segments,
  heatmap/image, barplot, poly, polar, dark-figure scatter, arrows3d, the Axis3 kinds
  (scatter, lines, meshscatter, wireframe, an overlapping pair), text, datashader, violin,
  stairs, hlines/vlines, threshold, ROI, view-pan, and axis/colorbar. Interaction without
  visual is unfinished; visual chrome without the kind sweep is unfinished. The overlay
  recipes (highlight layers and colours, fades, tooltip placement and theme, ROI chrome) are
  **locked**: the full spec is the "Visual language (settled)" section of
  `docs/dev/live-interaction-checklist.md`. Cite it; do not reopen it.
- **Skip only** pure-internal refactors with zero observable delta (and say so). When unsure,
  it's user-facing — verify all backends × the kinds the change can touch, interaction
  **and** visual.
- Mechanics below. Kind-sweep notebooks: `test/e2e/kind_sweep_cairo.jl` / `kind_sweep_webgl.jl`
  (both drivers). Demo envs (`test/notebooks/api_tour.jl`, `test/notebooks/webgl_demo.jl`) and
  `test/e2e/webgl_sweep.mjs` remain useful extras, not a substitute.
- CI's `kind-sweep` job runs all three drivers (`kind_sweep.mjs`, `polish_verify.mjs`,
  `keyboard_a11y.mjs`) on both backends on every PR, as a required check. It only covers what
  the kind-sweep notebooks exercise, so agents still run the sweep locally before pushing a
  user-facing change, and add a case to `kind_sweep_figures.jl` plus a check in the owning
  driver for any new kind, recipe, or interaction.

## Cloud sessions (claude.ai/code)
- **The setup script's output is snapshotted.** The environment's setup script installs Julia
  (on PATH; the latest release, like CI's `'1'` job — 1.13 today), the General registry and
  Runic, then runs `scripts/cloud-warm.sh julia-fetch` (lines at the top of that script), which
  resolves and downloads the `$MASQUE_DEV_ENV` env without precompiling it. The cloud keeps a
  filesystem snapshot of the result and starts later sessions from it, but only when the whole
  script ends within ~5 min; past that nothing is cached and every session reruns the script.
  So precompiling stays out of setup: it takes ~8.5 min, nearly all of it the serial
  Makie → WGLMakie chain, so a time-boxed partial precompile saves almost nothing. The
  snapshot is rebuilt when the script changes and about weekly. Project threads clone two
  repos, so repo `.claude/settings.json` hooks don't run there.
- **Warm lazily, and early.** On a task that will run Julia, start
  `scripts/cloud-warm.sh julia > /tmp/masque-warm.log 2>&1 &` *first*, then read code while it
  precompiles (~8.5 min from the snapshot, ~11 min with nothing fetched). It also points the
  env at this checkout: the snapshot's env points at the deleted setup clone, so tests fail
  until it has run. Add `frontend` before the frontend gate and `e2e` before live verification.
  Don't run Julia tests or Pluto until the warm-up log says `done` — competing for the 4 cores
  slows both.
- **Playwright is pinned to the image's Chromium.** The image preinstalls one Chromium build in
  `$PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers`), and `test/e2e/package.json` pins the
  Playwright release whose build matches it (1.56.1 ↔ build 1194), so `cloud-warm.sh e2e`
  downloads nothing. On a mismatch the script says so and falls back to a download, which
  works only from Playwright releases that know the `cdn.playwright.dev` mirror (1.56 does;
  1.49's three azureedge/microsoft hosts are all blocked by the network policy). To re-match:
  find the release whose `playwright-core/browsers.json` names the image's build (`npm pack
  playwright-core@<v>`), bump the pin, re-run both e2e drivers.
- That one warmed env lives at `$MASQUE_DEV_ENV`, defaulting to
  `~/.julia/environments/masque-dev` when the variable is unset (the script and the test
  command both fall back to it). It serves the unit tests and, when `MASQUE_DEV_ENV` is set in
  the cloud environment's settings, the kind-sweep notebooks too (unset, each notebook builds
  its own temp env — the ~6 min cold precompile).
- Julia 1.10 (CI's floor) is not installed; 1.10-only breakage is caught by CI. Reproduce one
  with `juliaup add 1.10` and `julia +1.10 …` (cold env, so another full precompile).

## Pluto integration testing (slow — minutes)
- A fresh per-notebook env re-resolves + precompiles the Makie stack (~6 min first open).
  The kind-sweep/contourf notebooks skip this when `MASQUE_DEV_ENV` points at a warmed env.
- To test the local package: `Pkg.develop(path=...)` in a notebook cell (disables Pluto's pkg mgmt).
- Headless: `Pluto.run(; port=1234, launch_browser=false, require_secret_for_open_links=false, require_secret_for_access=false)`; open `localhost:1234/open?path=…`; click "Run notebook code" to exit Safe preview; export HTML via `localhost:1234/notebookexport?id=…`.
- **Readiness: poll the port (`curl localhost:1234` → 200), not the log** — Pluto doesn't reliably flush its "Go to…" line, so a log-grep readiness loop hangs on a server that's actually up.
- **Selected/highlight is overlay-drawn, so the PNG is byte-identical across clicks** — don't detect interaction by watching `img.src`; assert the overlay/tooltip/`@bind` value instead (bake state into the figure only if you specifically need the PNG to differ).

## Profiling → design feedback (standing practice)
Profiling exists to inform the design, not to sit in a file. The loop is anchored on the committed
`bench/payload_envelope.jl` + `bench/stress.jl` → `docs/dev/perf-findings.md` pair.
- **`perf-findings.md` is the single source of every size/latency number.** Other docs
  (architecture/roadmap) **cite** it — never restate figures (numbers
  duplicated across docs drift; one reconciliation already had to fix exactly that).
- **Re-run + reconcile whenever the wire format changes**: a new interactable kind / geometry layout, a
  new payload field (e.g. M2.3 tooltips), an encoding change, or an animation/frames slot. Each is a
  "manifest-shape change" that can invalidate the envelope. Re-run the benches, update `perf-findings.md`
  (note the commit), then grep the other docs for size/latency claims that now contradict it.
- Treat each milestone that touches the manifest as re-opening a mini Phase 0 (measure → reconcile) before
  it's marked done — same gating spirit as M5 spatial-acceleration. A whole-`docs/` reconciliation can be
  fanned out as a workflow (see how Phase 0 was propagated).

## Layout
- User docs are the Documenter site, built from `docs/src/` (`docs/make.jl`, deployed by
  `.github/workflows/Documentation.yml`). Maintainer/design docs live in `docs/dev/`
  (architecture.md = the contract; perf-findings.md = the measured payload/latency envelope +
  the single source of those numbers; frontend-delivery.md = build/delivery decisions).
  `spike/` is gitignored scratch; `bench/` holds the committed, re-runnable benchmarks.
- Before writing or editing `docs/src/` or the README, read `docs/dev/writing-style.md`: plain
  words, the reader's side, no mechanism the reader doesn't act on.
- Process docs (brainstorming specs, implementation plans) go in `.superpowers/` — gitignored, local-only, not part of the package.
- The package was renamed from `Holo` to `Masque` on 2026-09-17 (same UUID). The local checkout folder and the GitHub remote may still be called `Holo.jl` until renamed; the package, module, and all in-repo references are `Masque`.
- Cross-references within `docs/dev/**` cite by file, not by heading anchor —
  `[§5](architecture/05-bond-value.md)`, never `[§5](architecture/05-bond-value.md#5-the-bond-value)`;
  a reference to a subsection of the *same* file is prose (`§12.3`), never a link. Keep a
  `#anchor` only when the citation targets one subsection of a genuinely long, multi-section
  file (today: `architecture/12-gesture-channel.md`, `architecture/10-tooltips.md`) and landing
  at the top would lose the reader. Rewording a heading breaks every inbound anchor link to
  it — file-level citations don't have that failure mode, so they're the default.
