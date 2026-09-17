#!/usr/bin/env python3
"""Fold the two webfonts into the handbook, so it needs nothing from the net.

The handbook is a single file that gets emailed around. Inlining the pictures
(see inline-images.py) left one thread still attached: a <link> to Google Fonts.
Open it on a plane, behind a firewall, or in five years when that URL has moved,
and the typography falls back to whatever the reader happens to have.

Both families are under the SIL Open Font Licence, which expressly permits
embedding in a document. The licence text is kept beside the handbook.

Two choices worth knowing about, because both trade size against fidelity:

  Latin only. The other six subsets Google serves — Cyrillic, Greek, Vietnamese
  and the extended Latins — are 16 of the 20 faces and none of the characters
  this handbook contains.

  The optical-size axis is pinned rather than carried. Newsreader varies its cut
  from 6pt to 72pt, and shipping that axis costs 272 KB against 120 KB pinned.
  The handbook sets type at a handful of fixed sizes, so the axis was buying
  very little for more than half the total weight.

    python docs/embed-fonts.py
"""
import base64
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
BOOK = ROOT / "lcm-finance-handbook.html"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

# Newsreader carries the headings and one italic line in the masthead; Source
# Sans 3 carries everything else. Weights are ranges, so one file per style
# covers every weight the stylesheet asks for.
FAMILIES = (
    "Newsreader:ital,opsz,wght@0,16,400..600;1,16,400..600"
    "&family=Source+Sans+3:ital,wght@0,400..700;1,400..700"
)

MARK_OPEN = "<!-- fonts:embedded -->"
MARK_CLOSE = "<!-- /fonts:embedded -->"


def fetch(url: str) -> bytes:
    return urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90).read()


def main() -> int:
    css = fetch(f"https://fonts.googleapis.com/css2?family={FAMILIES}&display=swap").decode()

    faces = []
    total = 0
    for subset, block in re.findall(r"/\* ([a-z-]+) \*/\s*(@font-face \{.*?\})", css, re.S):
        if subset != "latin":
            continue
        url = re.search(r"url\((https://[^)]+)\)", block).group(1)
        raw = fetch(url)
        total += len(raw)
        uri = "data:font/woff2;base64," + base64.b64encode(raw).decode("ascii")
        fam = re.search(r"font-family:\s*'([^']+)'", block).group(1)
        sty = re.search(r"font-style:\s*(\w+)", block).group(1)
        print(f"  {fam:16} {sty:8} {len(raw)/1024:6.1f} KB")
        faces.append(
            re.sub(r"url\(https://[^)]+\)", f"url({uri})", block)
            .replace("/* latin */", "")
            .strip()
        )

    if not faces:
        print("Google returned no latin faces — nothing embedded.")
        return 1

    html = BOOK.read_text(encoding="utf-8")

    # Drop the three <link> tags that reach out to Google, and any block this
    # script wrote before, so running it twice does not stack two copies.
    html = re.sub(r"\s*<!-- fonts:embedded -->.*?<!-- /fonts:embedded -->", "", html, flags=re.S)
    html = re.sub(r'\s*<link rel="preconnect" href="https://fonts\.[^"]+"[^>]*>', "", html)
    html = re.sub(r'\s*<link rel="stylesheet" href="https://fonts\.googleapis\.com[^"]+">', "", html)

    block = (f"\n{MARK_OPEN}\n<style>\n"
             + "\n".join(faces)
             + f"\n</style>\n{MARK_CLOSE}")
    html = html.replace("<title>", block + "\n<title>", 1)

    BOOK.write_text(html, encoding="utf-8")
    print(f"\n  {len(faces)} faces, {total/1024:.0f} KB of font")
    print(f"  handbook is now {BOOK.stat().st_size/1024:.0f} KB and asks the network for nothing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
