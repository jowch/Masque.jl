# README demo

Source for `docs/src/assets/demo.webp`, the loop at the top of the README: a real Pluto
session on CairoMakie, recorded at 2× by `test/e2e/docs_clip.mjs readme`. The pointer hovers
over Tokyo, clicks Lagos, São Paulo and Tokyo, drags a box over Europe, and presses Ctrl-Z to
take the box back; the cell below lists the picked cities after each step.

It is a lossless animated WebP rather than an MP4 because GitHub shows a WebP in a README
`<img>` but does not play a video stored in the repository (`docs/dev/clips/README.md`
§ Formats has the size trade-off).

Re-record from `test/e2e`, with a Pluto server whose notebooks can load this checkout
(`serve.jl` with `MASQUE_DEV_ENV` set to a warmed env, see `CLAUDE.md`):

```sh
MASQUE_DEV_ENV=~/.julia/environments/masque-dev julia serve.jl 1240 &
# poll curl http://localhost:1240 → 200
node docs_clip.mjs http://127.0.0.1:1240 "$PWD/../../docs/dev/readme-demo/notebook.jl" /tmp/readme-demo readme
python3 ../../docs/dev/clips/assemble_webp.py /tmp/readme-demo ../../docs/src/assets/demo.webp --length-ms 17000 --max-hold-ms 1200
```

The capture runs about 22 s, most of it waiting for Julia after each move; `--length-ms` and
`--max-hold-ms` bring the loop to about 17 s with no still stretch over 1.2 s.
