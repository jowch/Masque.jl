#!/usr/bin/env python3
"""Assemble a short docs loop (lossless animated WebP) from the frames + timestamps.json that a
recorder such as test/e2e/docs_clip.mjs or home_feature_gifs.mjs writes.

    python3 docs/dev/clips/assemble_webp.py <frames-dir> <out.webp> [--length-ms N]

Frames keep their captured pacing, or with --length-ms are rescaled onto a fixed length (the
Home loops, whose live capture varies with machine load). Frames keep the recorder's 2x size.

This uses libwebp's animation encoder through Pillow, which stores only the part of each frame
that changed. ffmpeg's libwebp encoder stores whole frames and makes files 20x larger.
"""
import argparse
import json
import os

from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("frames_dir")
ap.add_argument("out")
ap.add_argument("--length-ms", type=float, default=None)
args = ap.parse_args()

ts = json.load(open(os.path.join(args.frames_dir, "timestamps.json")))
total = ts[-1]["t"] or 1
scale = args.length_ms / total if args.length_ms else 1.0
durations = []
for i in range(len(ts)):
    gap = (ts[i + 1]["t"] - ts[i]["t"]) if i + 1 < len(ts) else 200
    durations.append(max(round(gap * scale), 20))

def load(f):
    return Image.open(os.path.join(args.frames_dir, f["file"])).convert("RGB")


# Merge runs of identical frames into one, so a still stretch costs one frame.
kept, kept_d, prev = [], [], None
for f, d in zip(ts, durations):
    data = load(f).tobytes()
    if data == prev:
        kept_d[-1] += d
    else:
        kept.append(f)
        kept_d.append(d)
        prev = data

first = load(kept[0])
first.save(
    args.out,
    save_all=True,
    append_images=(load(f) for f in kept[1:]),
    duration=kept_d,
    loop=0,
    lossless=True,
    minimize_size=True,
)
w, h = first.size
print(f"{len(ts)} frames ({len(kept)} distinct) over {sum(kept_d) / 1000:.1f}s, {w}x{h}, "
      f"{os.path.getsize(args.out) / 1024:.0f} KB -> {args.out}")
