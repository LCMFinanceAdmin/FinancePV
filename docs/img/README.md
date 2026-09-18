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
| `05-my-leave.png` | My Leave, the Balance tab | Same, with stand-in leave data |
| `06-leave-apply.png` | The Leave Application Form | Same |
| `07-leave-queue.png` | The Leave Queue an approver sees | Same |
| `08-leave-approve.png` | The Sign to approve dialog | Same |

Everyone in figures 05 to 08 is invented — Grace Lim, Esther Ng, Rev. John Tan,
Bishop Samuel Lau and the rest. No real person's leave balance appears in the
handbook, which matters because the handbook is circulated.

## Rebuilding the handbook after changing a picture

Replace a file here, keeping the name, then:

```bash
python docs/inline-images.py
```

It re-sizes anything wider than 1200px, re-encodes it as WebP and embeds it as
a data URI. Run it as often as you like — it replaces what is already embedded
rather than stacking a second copy.

1200px is a floor set by the smallest type in these pictures, which is the
Chinese on the bilingual voucher form rather than anything in English: it
carries more stroke in the same height and softens a step earlier. Keep the
sources here at full size — the folder is not what gets emailed — and let the
script do the reducing, so the decision lives in one place.

A file missing from this folder is left as a folder reference in the handbook,
which is what makes the drawn fallback appear in its place. That is intended
behaviour, not a failure.

## Checking where the numbered labels land

The handbook draws its rings and badges as percentages over each image, so they
move with it. To check placement without opening a browser:

```bash
python docs/check-annotations.py
```

It reads the ring coordinates out of the handbook, draws them onto copies of
these images, and writes the results to `docs/img/_check/`. Open those, confirm
each ring sits on what its caption claims, and delete the folder afterwards.

## Re-capturing

The sign-in page is public, so it can be taken at any time:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --force-prefers-reduced-motion --force-device-scale-factor=2 --virtual-time-budget=12000 --window-size=1000,780 --screenshot="<abs path>/docs/img/01-sign-in.png" "https://finance-pv.vercel.app/login"
```

Everything else sits behind the login, where a headless browser has no session.
Those were taken by copying the page component into a throwaway route, replacing
only its `load()` function with literal stand-in data, capturing, and then
deleting the route. Real markup, invented figures. Nothing in `lib/supabase/`
was touched — faking a session there would be a back door, and the screenshots
are not worth one.

Five things to know if you do it again:

- **`--virtual-time-budget`** is what stops the capture landing on the loading
  splash. Without it you photograph a spinner.
- **`--force-prefers-reduced-motion`** matters as much. Every page fades in with
  `cloudlight-enter`, and without this the capture catches it half-faded and
  washed out. The stylesheet already collapses that animation under reduced
  motion.
- **The service-worker "A new version is available" bar** lands in the frame.
  Crop it off by finding the dark band and cutting above it.
- **Headless lays the page out wider than the window it is given**, so a mobile
  capture loses its right-hand margin. Capture wider than the phone width and
  crop back to the card with equal margins. `04-request-mobile.png` also carries
  100px of replicated background down its left edge — that is the gutter the
  numbered labels sit in, not part of the app.
- **Rebuild and restart the server in that order, and check the restart took.**
  `next start` fails silently if the old process is still holding the port, and
  you then photograph the previous build without noticing. This cost an hour.

## A note on sharing

The handbook is a single self-contained file — images and fonts embedded, no
external requests. Email it on its own and it arrives complete.
