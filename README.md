# Cetak Cetak AI Portrait Booth – v1

A web app that runs fullscreen in Chrome on the PRISM+ Roam (or any tablet/screen with a camera).
Guest picks a look → picks number of people → 3-2-1 photo → AI restyles it → guest scans QR to download.

## How it works

```
Roam (Chrome, fullscreen)          Your server (Railway)              OpenRouter
  booth screen  ──photo──▶  server.js ──photo + theme prompt──▶  ChatGPT image model
                ◀──result + QR──      ◀──────── AI image ─────────
Guest phone ──scans QR──▶ /p/<id> download page
```

- **Demo mode:** if no OpenRouter key is set, the app still works end to end, but photos are only tinted (no AI). Use this to test the flow at no cost.
- **Live mode:** set `OPENROUTER_API_KEY` and every photo goes to the AI model.

## Files you will edit

| File | What it is |
|---|---|
| `themes.json` | Your looks. Change `name`, `subtitle`, `prompt`, `maxPeople`. Add more by copying a block. |
| `public/frame.png` | (Optional) Your branding frame, 1200×1800 PNG with a transparent middle. Put it here and every photo gets it. |
| `server.js` → `BASE_RULES` | Rules added to every prompt (keep face, keep hijab on, same number of people). |

## Settings (Railway → your service → Variables)

| Variable | Example | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | `sk-or-...` | From openrouter.ai → Keys. Never share it. |
| `OPENROUTER_MODEL` | `openai/gpt-5-image` | Default is ChatGPT's image model. Try `google/gemini-2.5-flash-image` to compare. Check the exact model name on openrouter.ai/models. |
| `PUBLIC_URL` | `https://ccpb-booth.up.railway.app` | Your Railway web address, so QR codes point to the right place. |
| `DATA_DIR` | `/data` | Only if you add a Railway Volume (see step 5). |

## Put it online (Railway) – one-time setup

1. **GitHub:** create a free account → New repository → name it `ccpb-ai-booth` (Private) → "uploading an existing file" → drag in all files from this folder **except** `node_modules` and `data`.
2. **Railway:** sign up at railway.com with GitHub → New Project → Deploy from GitHub repo → pick `ccpb-ai-booth`. It detects Node and runs `npm start` automatically.
3. **Domain:** service → Settings → Networking → Generate Domain. Copy the https address.
4. **Variables:** add `PUBLIC_URL` (the address from step 3). Leave `OPENROUTER_API_KEY` out for now = demo mode.
5. **Keep photos after restarts:** service → add a Volume, mount path `/data`, then add variable `DATA_DIR=/data`. Without this, old QR links break when Railway redeploys.
6. Open the address on the Roam in Chrome → allow camera → tap ⛶ (bottom-right) for fullscreen. Chrome menu → "Add to Home screen" makes it open like an app.

## Turn on the AI

1. openrouter.ai → sign up → Credits → top up a small amount for testing.
2. Keys → Create key → copy it.
3. Railway → Variables → add `OPENROUTER_API_KEY`. Railway redeploys automatically. The demo banner disappears.

## Testing checklist

- [ ] Faces still look like the real person (test 5+ staff)
- [ ] Hijab stays on and correct in every theme
- [ ] Groups of 1, 2, 3, 4 people
- [ ] Time per photo (shown on loading screen) – target under 60s
- [ ] Cost per photo (OpenRouter → Activity)
- [ ] QR download works on Android and iPhone
- [ ] Works on your own pocket Wi-Fi

## Not in v1 yet

Printing to the dye-sub printer, admin page for themes, per-event client branding, guest consent screen, event gallery.

## Run on a computer (optional)

```
npm install
npm start          # http://localhost:3000 (camera works on localhost)
```
