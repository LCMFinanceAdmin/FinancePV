#!/usr/bin/env python3
"""Fold docs/img/*.png into the handbook as data URIs, so it is one file.

The handbook is meant to be emailed. An <img src="img/..."> is right while it
is being written and wrong the moment somebody forwards the HTML on its own —
the pictures simply vanish, and the person receiving it has no way of knowing
they were ever there.

Each figure carries data-img="<filename>", which is what this reads. The src is
rewritten from the file every run, so this is safe to run again after a picture
is replaced, and safe to run when nothing has changed.

A picture named by data-img but missing from docs/img/ is left pointing at the
folder. That is deliberate: the handbook's dashboard figure falls back to a
drawing when its src fails to load, so a missing photograph degrades to a
diagram rather than to a broken-image icon.

    python docs/inline-images.py
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
BOOK = ROOT / "lcm-finance-handbook.html"
IMGS = ROOT / "img"

MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml"}


def main() -> int:
    html = BOOK.read_text(encoding="utf-8")
    tags = re.findall(r'<img\b[^>]*\bdata-img="([^"]+)"[^>]*>', html)
    if not tags:
        print("No figure carries data-img — nothing to inline.")
        return 0

    inlined = missing = 0
    for name in tags:
        path = IMGS / name
        if not path.is_file():
            print(f"  {name:22} not in docs/img — left as a folder reference")
            missing += 1
            continue

        mime = MIME.get(path.suffix.lower())
        if mime is None:
            print(f"  {name:22} unknown type {path.suffix} — skipped")
            continue

        uri = f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")

        # Replace the src of the one tag that names this file, leaving every
        # other attribute — alt text, the onerror fallback — untouched.
        def sub(m: "re.Match[str]") -> str:
            tag = m.group(0)
            if f'data-img="{name}"' not in tag:
                return tag
            if 'src="' in tag:
                return re.sub(r'src="[^"]*"', lambda _: f'src="{uri}"', tag, count=1)
            return tag.replace("<img", f'<img src="{uri}"', 1)

        html = re.sub(r"<img\b[^>]*>", sub, html)
        print(f"  {name:22} inlined, {len(uri) // 1024} KB as text")
        inlined += 1

    BOOK.write_text(html, encoding="utf-8")
    size = BOOK.stat().st_size // 1024
    print(f"\n{inlined} inlined, {missing} still referenced. Handbook is now {size} KB.")
    if missing:
        print("Missing pictures fall back to the drawn diagram, not a broken image.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
