# Handbook screenshots

Pictures used by `../lcm-finance-handbook.html`. Drop a file in here with the
right name and it appears in the handbook — there is no other step.

| File | What it shows | Where it comes from |
|---|---|---|
| `01-sign-in.png` | The sign-in screen | Captured automatically — the page is public |
| `02-dashboard.png` | The dashboard after signing in | **You** — it needs a signed-in session |

## What is needed from you

`02-dashboard.png` sits behind the login, so it cannot be captured here. Take
it yourself and save it into this folder under exactly that name.

Worth doing before you take it:

- **Sign in as the person the handbook is written for.** The Finance Executive
  view shows the fullest menu. A Staff view would be truthful but sparse.
- **Full window, not a phone.** Around 1400px wide, so the left-hand menu and
  the tiles are both in frame.
- **Include the bottom left.** The handbook points at the name, address and
  role block, so the picture has to contain it.
- **Dismiss the "A new version is available" bar** if it is showing. Click
  Later, then take the shot.

Anything else worth putting in the handbook is welcome too — drop the file in
and say which section it belongs to.

## Re-capturing the sign-in screen

It is a public page, so it can be taken again at any time:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --virtual-time-budget=12000 \
  --window-size=1000,780 \
  --screenshot="<absolute path>/docs/img/01-sign-in.png" \
  "https://finance-pv.vercel.app/login"
```

`--virtual-time-budget` is the part that matters: without it the capture lands
on the loading splash before the sign-in card has rendered, which is exactly
what happened the first time.

## A note on sharing

The handbook is one HTML file so it can be emailed as one attachment, but it
reads these pictures from this folder. Send the handbook on its own and the
pictures will be missing. Ask for the pictures to be **inlined** and it will be
rebuilt as a single self-contained file with the images embedded — larger, but
it travels alone.
