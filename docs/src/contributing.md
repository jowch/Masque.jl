# Development

The overlay and the `:webgl` shim are one TypeScript project in
`frontend/`. `npm run build` writes both committed bundles:
`../assets/overlay.js` (IIFE) and `../assets/masque-webgl.js` (ESM).

```bash
cd frontend
npm ci
npm run lint && npm run typecheck && npm test && npm run build
```

CI is the sole author of those two files (it rebuilds and commits on
`main`). Committing a local build is optional.

Julia tests are split into three `GROUP`s so each process has a known
loaded-backend set (`Core` = Cairo only; `WebGL` = WGL first, then both
at the end; `NoBackend` = neither). `GROUP` defaults to `Core`:

```bash
julia --project=. -e 'using Pkg; Pkg.test()'                 # GROUP=Core
GROUP=NoBackend julia --project=. -e 'using Pkg; Pkg.test()' # neither backend
GROUP=WebGL julia --project=. -e 'using Pkg; Pkg.test()'     # WGL then both
```

Julia code is formatted with [Runic](https://github.com/fredrikekre/Runic.jl)
(CI enforces it, and checks the whole repo, not only `src` / `test`):

```bash
julia -e 'using Runic; exit(Runic.main(["--inplace", "src", "test", "bench", "gallery", "examples", "docs"]))'
```

This site is Documenter, built from `docs/src/`. Maintainer notes live
in `docs/dev/` and are not part of the Documenter sidebar.

```bash
julia --project=docs -e 'using Pkg; Pkg.develop(PackageSpec(path=pwd())); Pkg.instantiate()'
julia --project=docs docs/make.jl
```

Local `make.jl` builds HTML under `docs/build/` and skips `deploydocs`
(that runs on CI, which also owns the deploy to GitHub Pages on `main`
and tags).

## Live verification

Unit and frontend tests check the manifest and the JS in isolation; they
do not prove the rendered widget behaves for a user. Any change that can
alter what a user interacts with or sees — including a Julia-only change
to the manifest shape, hit-test geometry, or tooltip text — needs to be
checked live in a real Pluto + browser, on every supported backend, for
every interactable kind it touches. This is the gate before a
user-facing change is done. The full playbook is
[`docs/dev/live-interaction-checklist.md`](https://github.com/jowch/Masque.jl/blob/main/docs/dev/live-interaction-checklist.md).
