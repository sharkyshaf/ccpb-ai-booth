# CLAUDE.md – CCPB AI Portrait Booth

## Who / why
- Owner: Shaf, founder of Cetak Cetak Photobooth (CCPB), Selangor, Malaysia. Runs 60–80 events/month (weddings, corporate, government).
- She is learning to code; Claude does the coding. Explain steps plainly, be direct, no fluff.
- Goal: an AI portrait photobooth (like competitor @aiprismbooth / kotakphotobooth) running on a **PRISM+ Roam Ultra 32" (Android 13, 4K touch, 8MP magnetic camera, model 3252U Pro)**.

## Why this app exists (decisions already made)
- LumaBooth for Android has NO AI Portraits (only Windows/Apple). Roam does not pass touch to a PC over USB-C/HDMI (tested with a laptop whose USB-C is data-only; result inconclusive but mini-PC route abandoned).
- Chosen route: **web app in Chrome on the Roam** (touch + Roam camera work natively) + small Node server + **OpenRouter** for the image model.
- Shaf chose **ChatGPT's image model** via OpenRouter (default `openai/gpt-5.4-image-2`; `openai/gpt-5-image` broke in Nov 2026 – OpenAI retired gpt-image-1). Can compare with `google/gemini-2.5-flash-image`.
- Inspiration: Derek Cheung "I Built an AI Photobooth with OpenRouter + Claude Code" (YouTube). We skip his voice/video/TTS extras for v1.

## Current state (v1, built 16 Nov 2026)
- `server.js` – Express. `POST /api/generate` (photo + themeId + people → OpenRouter chat/completions with `modalities:["image","text"]`, `image_config.aspect_ratio:"2:3"` → saves 1200×1800 JPG, optional `public/frame.png` overlay → returns image URL + QR). `GET /p/:id` guest download page. Demo mode when `OPENROUTER_API_KEY` is unset (tints photo, no AI).
- `public/index.html` – booth UI: start → theme → people (1–4) → camera + 3-2-1 → loading → result + QR → idle auto-reset. Brand: bg #E7E6E7, Crimson Pro + DM Sans, light/luxury/minimal (never super-dark).
- `themes.json` – 3 looks: Lady – Glam Gown, Baju Melayu Raya, Corporate Headshot.
- `BASE_RULES` in server.js: keep faces identical, keep hijab on + modest clothing, same number of people, no text.
- Decision (16 Nov 2026): modest-clothing rule applies ONLY to hijab wearers, not everyone. Don't change without asking Shaf.
- Tested: demo mode end to end, simulated OpenRouter response, frame overlay, download page. **NOT yet tested against the real OpenRouter API** (no key yet).
- Env vars: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `PUBLIC_URL`, `DATA_DIR`, `OPENROUTER_BASE_URL` (testing only), `PORT`.

## Deployment (done 16 Nov 2026)
- GitHub: https://github.com/sharkyshaf/ccpb-ai-booth (private, branch `main`). Railway auto-deploys on push (Railway GitHub app was given repo access).
- Live: https://ccpb-ai-booth-production.up.railway.app – volume at /data, `DATA_DIR=/data`, `PUBLIC_URL` set. Photos survive restarts. AI is ON (OpenRouter key set in Railway).
- Gotcha: Railway holds variable changes until you click Deploy / Apply changes.

## Next steps
1. (done) Deploy to Railway.
2. (done) First real AI photo worked: gpt-5.4-image-2, Glam Gown, 74s. Response format OK. Errors now return a `detail` field; `/api/health` has a `version` number to check deploys for free (never poll /api/generate – it costs money).
3. Prompt tuning on staff photos: face likeness, hijab accuracy, groups of 1–4, time per photo (<60s), cost per photo.
4. Then: printing to dye-sub printer (hardest – Android browser), admin page for themes, per-event white-label branding/frame, PDPA consent screen, event gallery.
