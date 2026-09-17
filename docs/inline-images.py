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
import io
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
BOOK = ROOT / "lcm-finance-handbook.html"
IMGS = ROOT / "img"

MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml"}

# A figure renders about 620px wide in the handbook. Screenshots arrive at two
# or three times that, which is right for the folder and wasteful inside a file
# people email: the dashboard capture was 740 KB of PNG, a megabyte once encoded
# as text, for a picture nothing will ever draw above 1600px.
MAX_WIDTH = 1600
WEBP_QUALITY = 88


def optimise(path: pathlib.Path) -> "tuple[bytes, str] | None":
    """Right-size a screenshot and encode it small, or None to use it as-is.

    WebP rather than PNG because a screenshot is mostly flat colour with a few
    gradients, which is the case WebP is best at — 64 KB against 524 KB here,
    for a difference nobody can see at the size it is drawn. Anything that is
    not a raster photograph (an SVG, say) is left alone.
    """
    if path.suffix.lower() not in (".png", ".jpg", ".jpeg"):
        return None
    try:
        from PIL import Image
    except ImportError:
        print("    (Pillow not installed — embedding at full size)")
        return None

    im = Image.open(path).convert("RGB")
    if im.width > MAX_WIDTH:
        im = im.resize((MAX_WIDTH, round(im.height * MAX_WIDTH / im.width)),
                       Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=WEBP_QUALITY, method=6)
    return buf.getvalue(), "image/webp"


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

        raw = path.read_bytes()
        small = optimise(path)
        if small and len(small[0]) < len(raw):
            was = len(raw)
            raw, mime = small
            print(f"  {name:22} {was//1024} KB -> {len(raw)//1024} KB as {mime.split('/')[1]}")

        uri = f"data:{mime};base64," + base64.b64encode(raw).decode("ascii")

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
