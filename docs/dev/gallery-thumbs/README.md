# Examples card pictures

Source for `docs/src/assets/gallery/*.png`, the pictures on the Examples page's cards. Each
shows its figure mid-interaction, at 2×: a click picked, or the pointer's tooltip showing.

All but one are taken from the docs players by `test/e2e/gallery_thumbs.mjs`, which says on
each card where it clicks or hovers. Run it from `test/e2e` against a docs build, or against
the deployed site once `main` shows what you want:

```sh
node gallery_thumbs.mjs https://jowch.github.io/Masque.jl/dev ../../docs/src/assets/gallery
```

"Compare a cluster" has no player, since its histogram needs Julia, so its picture is the last
frame of its clip (`docs/dev/clips/README.md`), cropped to the two figures:

```sh
ffmpeg -sseof -0.3 -i docs/src/assets/example-cluster.mp4 -frames:v 1 /tmp/cluster.png
python3 -c "from PIL import Image; Image.open('/tmp/cluster.png').convert('RGB').crop((60, 40, 1150, 1270)).save('docs/src/assets/gallery/cluster.png', optimize=True)"
```
