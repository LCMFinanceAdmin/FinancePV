#!/usr/bin/env python3
"""Build one short guide per role from the shared content.

    python docs/guides/build.py          # all of them
    python docs/guides/build.py exco     # one, while writing it

Each guide is a self-contained HTML page — the handbook's own stylesheet and
fonts, its own pictures embedded — plus a Word version built by the same
converter the handbook uses. Nothing here reimplements either.
"""
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
DOCS = HERE.parent
SHELL = DOCS / "guides-shell.html"

sys.path.insert(0, str(HERE))
from content import GUIDES, SECTIONS  # noqa: E402


# Titles and standfirsts in content.py are written as HTML — they carry
# &rsquo; and &amp; deliberately — so they are placed as they are. Escaping
# them turned "Building &amp; Event Manager" into "Building &amp;amp; Event
# Manager" on the page.


def sections_for(role: str):
    """This role's sections, in the order they should be read.

    Sorted by rank, then by the order they are written in, so two sections of
    equal rank keep the sequence the author chose.
    """
    mine = [(i, s) for i, s in enumerate(SECTIONS) if role in s["roles"]]
    mine.sort(key=lambda pair: (pair[1].get("rank", 2), pair[0]))
    return [s for _, s in mine]


def build(role: str, guide: dict) -> pathlib.Path:
    items = sections_for(role)
    if not items:
        sys.exit(f"{role}: no sections name this role — nothing to build.")

    body = "\n\n".join(
        f'      <section id="{s["id"]}">\n'
        f'        <h2 class="head">{s["title"]}</h2>\n'
        f'{s["body"].rstrip()}\n'
        f'      </section>'
        for s in items)

    page = f"""{SHELL.read_text(encoding="utf-8")}

<div class="wrap">

  <header class="masthead">
    <p class="eyebrow">Lutheran Church in Malaysia &middot; LCM Finance &amp; HR</p>
    <h1>{guide["title"]}</h1>
  </header>

  <div class="layout">

    <main>

{body}

      <footer>
        <p>Prepared for the Lutheran Church in Malaysia. This guide covers
        {guide["covers"]} — the rest of the system is in the full
        <b>LCM Finance &amp; HR Handbook</b>, which the HQ office can send you. Anything
        unclear here is worth saying so: a step that needed explaining twice is
        a step written badly.</p>
      </footer>

    </main>
  </div>
</div>
"""
    out = HERE / f"{role}.html"
    out.write_text(page, encoding="utf-8")

    # The same two scripts the handbook uses, so a change to how a picture is
    # embedded or a panel is translated reaches every guide at once.
    for script in ("inline-images.py", "handbook-to-docx.py"):
        r = subprocess.run([sys.executable, str(DOCS / script), str(out)],
                           capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"{role}: {script} failed\n{r.stdout}\n{r.stderr}")
    return out


def main() -> int:
    wanted = sys.argv[1:] or list(GUIDES)
    unknown = [w for w in wanted if w not in GUIDES]
    if unknown:
        sys.exit(f"No such guide: {', '.join(unknown)}. "
                 f"Try one of: {', '.join(GUIDES)}")
    for role in wanted:
        out = build(role, GUIDES[role])
        docx = out.with_suffix(".docx")
        print(f"{role:12} {out.stat().st_size // 1024:5} KB html"
              f"   {docx.stat().st_size // 1024:5} KB docx   {GUIDES[role]['title']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
