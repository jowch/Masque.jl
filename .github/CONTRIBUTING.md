# Contributing to Masque

Thanks for helping. Bug reports, small fixes and documentation corrections are welcome as
they are. For a new feature or a change to how something behaves, open an issue first so we
can agree on the design before you write the code.

## Reporting a bug

Use the bug report form. The most useful report is a short notebook or snippet that someone
else can paste into Pluto, with the Masque version, the backend (CairoMakie or WGLMakie), and
what you saw next to what you expected.

## Making a change

The [contributing page](https://jowch.github.io/Masque.jl/dev/contributing/) of the docs has
the setup: building the browser code in `frontend/`, running the Julia test groups,
formatting with Runic, and building the docs. In short, before you open a pull request:

- Run the Julia tests for the groups your change touches, and the frontend checks if you
  changed anything in `frontend/`.
- Format every `.jl` file you touched with Runic.
- Add a line under `[Unreleased]` in [`CHANGELOG.md`](../CHANGELOG.md) for anything a user
  would notice, written from their side.
- If the change alters what someone sees or does in a notebook, try it in a live Pluto
  notebook on both backends (see
  [`docs/dev/live-interaction-checklist.md`](../docs/dev/live-interaction-checklist.md)).

Pull requests go against `main`. Before 1.0, a patch release may add features but never
breaks existing code; a change that breaks a call waits for the next minor release and gets
the `breaking` label.

## Code of conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
