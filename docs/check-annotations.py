#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Check where the handbook's numbered labels land, without a browser.

The figures in the handbook are annotated with rings and numbered badges placed
as percentages over each image, so they scale with it. That also means a ring
can drift off its target when a screenshot is retaken at a different size, and
nothing will complain — the page still renders, it just points at the wrong
thing.

This redraws those rings onto copies of the source images using the same
percentage arithmetic the CSS does, and writes them to docs/img/_check/. Open
them, confirm every ring sits on what its caption claims, then delete the
folder. The handbook itself is never modified.
"""
import io
import os
import re
import shutil
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("This needs Pillow:  pip install pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
HANDBOOK = os.path.join(HERE, "lcm-finance-handbook.html")
IMAGES = os.path.join(HERE, "img")
OUT = os.path.join(IMAGES, "_check")

RING = re.compile(
    r'anno-ring" style="--x:([\d.]+)%;--y:([\d.]+)%;--w:([\d.]+)%;--h:([\d.]+)%;"')
BADGE = re.compile(r'class="anno" style="--x:([\d.]+)%;--y:([\d.]+)%;">(\d+)<')
FIGURE = re.compile(r'data-img="([^"]+)"(.*?)</figure>', re.S)

ORANGE = (194, 65, 12)          # the same --anno colour the handbook uses
PREVIEW_WIDTH = 1100            # wide enough to read, small enough to open


def main():
    html = io.open(HANDBOOK, encoding="utf-8").read()
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    checked = 0
    for match in FIGURE.finditer(html):
        name, block = match.group(1), match.group(2)
        source = os.path.join(IMAGES, name)
        if not os.path.exists(source):
            print("  {}: no source image — skipped".format(name))
            continue

        rings = RING.findall(block)
        badges = BADGE.findall(block)
        if not rings and not badges:
            continue

        im = Image.open(source).convert("RGB")
        width, height = im.size
        draw = ImageDraw.Draw(im)

        for x, y, w, h in rings:
            cx, cy = float(x) / 100 * width, float(y) / 100 * height
            bw, bh = float(w) / 100 * width, float(h) / 100 * height
            draw.rounded_rectangle(
                [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2],
                radius=14, outline=ORANGE, width=6)

        radius = max(14, width // 90)
        for x, y, n in badges:
            cx, cy = float(x) / 100 * width, float(y) / 100 * height
            draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius],
                         fill=ORANGE, outline=(255, 255, 255), width=4)
            draw.text((cx - radius / 3, cy - radius / 1.6), n, fill=(255, 255, 255))

        scale = PREVIEW_WIDTH / width
        im = im.resize((PREVIEW_WIDTH, int(height * scale)), Image.LANCZOS)
        im.save(os.path.join(OUT, name), optimize=True)
        print("  {}: {} rings, {} badges".format(name, len(rings), len(badges)))
        checked += 1

    print("\n{} figures written to docs/img/_check/ - open them, then delete the folder."
          .format(checked))


if __name__ == "__main__":
    main()
