# Handbook screenshots

Source pictures for `../lcm-finance-handbook.html`. The handbook that gets sent
out does **not** read this folder — the images are baked into it by
`../inline-images.py`. These files are what that script reads, so they are kept
here to make the handbook rebuildable.

| File | What it shows | How it was taken |
|---|---|---|
| `01-sign-in.png` | The sign-in screen | Headless Chrome against the live site — the page is public |
| `02-dashboard.png` | The dashboard after signing in | Headless Chrome against a temporary local route |
| `03-request-desktop.png` | New Payment Request, computer layout | Same |
| `04-request-mobile.png` | New Payment Request, phone layout | Same, at phone width |

## Rebuilding the handbook after changing a picture

Replace a file here, keeping the name, then:

```bash
python docs/inline-images.py
```

It re-sizes anything wider than 1600px, re-encodes it as WebP and embeds it as
a data URI. Run it as often as you like — it replaces what is already embedded
rather than stacking a second copy.

A file missing from this folder is left as a folder reference in the handbook,
which is what makes the drawn fallback appear in its place. That is intended
behaviour, not a failure.

## Re-capturing

The sign-in page is public, so it can be taken at any time:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --virtual-time-budget=12000 --window-size=1000,780 --screenshot="<abs path>/docs/img/01-sign-in.png" "https://finance-pv.vercel.app/login"
```

`--virtual-time-budget` is the part that matters: without it the capture lands
on the loading splash before the card has rendered.

Everything else sits behind the login, where a headless browser has no session.
Those three were taken by adding a temporary route that renders the real page
component with a stand-in profile, capturing it, then deleting the route — real
UI, no real financial data on screen. The route is deliberately not kept in the
repository; recreate it if the screens change enough to need re-shooting.

Two things to know if you do:

- **The service-worker "A new version is available" bar** lands in the frame.
  It is cropped off afterwards by finding the dark band and cutting above it.
- **Headless lays the page out wider than the window it is given**, so a mobile
  capture loses its right-hand margin. Capture wider than the phone width and
  crop back to the card with equal margins. `04-request-mobile.png` also carries
  100px of replicated background down its left edge — that is the gutter the
  numbered labels in the handbook sit in, not part of the app.

## A note on sharing

The handbook is a single self-contained file — images and fonts embedded, no
external requests. Email it on its own and it arrives complete.
