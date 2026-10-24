# Examples card pictures

Source for `docs/src/assets/gallery/*.png`, the pictures on the Examples page's cards. Each
shows its figure mid-interaction, at 2×: a click picked, or the pointer's tooltip showing.

All but one are taken from the docs players by `test/e2e/gallery_thumbs.mjs`, which says on
each card where it clicks or hovers. Run it from `test/e2e` against a docs build, or against
the deployed site once `main` shows what you want:

```sh
node gallery_thumbs.mjs https://jowch.github.io/Masque.jl/dev ../../docs/src/assets/gallery
```

The clip examples have no player, since they need Julia running or keep several picks, so
each picture is the last frame of its clip (`docs/dev/clips/README.md`), cropped to the
figures:

```sh
ffmpeg -sseof -0.3 -i docs/src/assets/example-cluster.mp4 -frames:v 1 /tmp/cluster.png
python3 -c "from PIL import Image; Image.open('/tmp/cluster.png').convert('RGB').crop((60, 40, 1150, 1270)).save('docs/src/assets/gallery/cluster.png', optimize=True)"
ffmpeg -sseof -0.3 -i docs/src/assets/example-threshold.mp4 -frames:v 1 /tmp/threshold.png
python3 -c "from PIL import Image; Image.open('/tmp/threshold.png').convert('RGB').crop((60, 50, 1390, 575)).save('docs/src/assets/gallery/threshold.png', optimize=True)"
ffmpeg -sseof -0.3 -i docs/src/assets/example-segmentation.mp4 -frames:v 1 /tmp/segmentation.png
python3 -c "from PIL import Image; Image.open('/tmp/segmentation.png').convert('RGB').crop((70, 50, 1140, 760)).save('docs/src/assets/gallery/segmentation.png', optimize=True)"
ffmpeg -sseof -0.3 -i docs/src/assets/example-linked.mp4 -frames:v 1 /tmp/linked.png
python3 -c "from PIL import Image; Image.open('/tmp/linked.png').convert('RGB').crop((60, 40, 1400, 620)).save('docs/src/assets/gallery/linked.png', optimize=True)"
```
