# Contributing

The browser code for both backends is one TypeScript project in
`frontend/`. `npm run build` writes both committed bundles:
`../assets/overlay.js` (IIFE) and `../assets/masque-webgl.js` (ESM).

```bash
cd frontend
npm ci
npm run lint && npm run typecheck && npm test && npm run build
```

CI rebuilds those two files and commits them on `main`, so committing
your local build is optional.

The Julia tests run in three groups, chosen with the `GROUP` environment
variable. Each group loads a different set of backends: `Core` loads
CairoMakie only, `WebGL` loads WGLMakie first and then both at the end,
and `NoBackend` loads neither. `GROUP` defaults to `Core`:

```bash
julia --project=. -e 'using Pkg; Pkg.test()'                 # GROUP=Core
GROUP=NoBackend julia --project=. -e 'using Pkg; Pkg.test()' # neither backend
GROUP=WebGL julia --project=. -e 'using Pkg; Pkg.test()'     # WGL then both
```

Julia code is formatted with [Runic](https://github.com/fredrikekre/Runic.jl).
CI checks every `.jl` file in the repository, not only `src` and `test`,
so format all of them:

```bash
julia -e 'using Runic; exit(Runic.main(["--inplace", "src", "test", "bench", "docs"]))'
```

This site is built with Documenter from `docs/src/`. Maintainer notes
are in `docs/dev/` and are not in the site's sidebar.

```bash
julia --project=docs -e 'using Pkg; Pkg.develop(PackageSpec(path=pwd())); Pkg.instantiate()'
julia --project=docs docs/make.jl
```

Run locally, `make.jl` writes HTML to `docs/build/` and skips
`deploydocs`. CI deploys the site to GitHub Pages from `main` and from
tags.

## Live verification

A change to what users see or interact with needs a check in a live
Pluto notebook on each backend. Follow
[`docs/dev/live-interaction-checklist.md`](https://github.com/jowch/Masque.jl/blob/main/docs/dev/live-interaction-checklist.md).
