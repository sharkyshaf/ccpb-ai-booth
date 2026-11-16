// Cetak Cetak Photobooth – AI Portrait Booth (v1)
// Small server: receives the guest photo, asks the AI image model (via OpenRouter)
// to restyle it, saves the result, and gives back a QR code for download.

import express from "express";
import QRCode from "qrcode";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- Settings (set these in Railway "Variables", or a .env-style shell) ----------
const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ""; // empty = DEMO MODE
const OPENROUTER_BASE_URL = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-5.4-image-2";
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, ""); // e.g. https://ccpb-booth.up.railway.app
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PHOTO_DIR = path.join(DATA_DIR, "photos");
const FRAME_PATH = path.join(__dirname, "public", "frame.png"); // optional branding frame
const DEMO_MODE = !OPENROUTER_API_KEY;

fs.mkdirSync(PHOTO_DIR, { recursive: true });

// Rules added to EVERY theme prompt. This is where face/hijab accuracy is protected.
const BASE_RULES = `
STRICT RULES:
- Keep every person's face, skin tone, facial features, age and expression exactly as in the original photo. They must be clearly recognisable as the same people.
- If a person wears a hijab or any head covering, keep it fully on, covering the hair and neck exactly as worn. Never remove it, never show hair, and keep all clothing for that person modest (long sleeves, loose, nothing tight or revealing).
- Keep exactly the same number of people. Do not add or remove anyone.
- No text, logos, watermarks or signatures in the image.
- Output a single photorealistic image in portrait orientation.`;

function loadThemes() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "themes.json"), "utf8"));
}

const app = express();
app.set("trust proxy", true); // Railway sits in front of us; use its https address in QR links
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/photos", express.static(PHOTO_DIR, { maxAge: "7d" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: 5, demoMode: DEMO_MODE, model: DEMO_MODE ? null : OPENROUTER_MODEL });
});

app.get("/api/themes", (req, res) => {
  const themes = loadThemes().map(({ id, name, subtitle, maxPeople }) => ({ id, name, subtitle, maxPeople }));
  res.json({ themes, demoMode: DEMO_MODE });
});

app.post("/api/generate", async (req, res) => {
  const started = Date.now();
  try {
    const { image, themeId, people } = req.body || {};
    if (!image || !image.startsWith("data:image/")) {
      return res.status(400).json({ error: "No photo received." });
    }
    const theme = loadThemes().find((t) => t.id === themeId);
    if (!theme) return res.status(400).json({ error: "Unknown theme." });

    const peopleCount = Math.max(1, Math.min(Number(people) || 1, theme.maxPeople || 4));
    const prompt = `${theme.prompt}\nThere ${peopleCount === 1 ? "is 1 person" : `are ${peopleCount} people`} in the photo.\n${BASE_RULES}`;

    let resultBuffer;
    if (DEMO_MODE) {
      resultBuffer = await demoTransform(image);
    } else {
      resultBuffer = await callOpenRouter(image, prompt);
    }

    const finalBuffer = await applyFrame(resultBuffer);
    const id = crypto.randomBytes(6).toString("hex");
    fs.writeFileSync(path.join(PHOTO_DIR, `${id}.jpg`), finalBuffer);

    const base = PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
    const shareUrl = `${base}/p/${id}`;
    const qr = await QRCode.toDataURL(shareUrl, { margin: 1, width: 400 });

    console.log(`[generate] theme=${theme.id} people=${peopleCount} id=${id} ${((Date.now() - started) / 1000).toFixed(1)}s`);
    res.json({ id, imageUrl: `/photos/${id}.jpg`, shareUrl, qr, seconds: Math.round((Date.now() - started) / 1000) });
  } catch (err) {
    console.error("[generate] failed:", err.message);
    res.status(500).json({ error: friendlyError(err), detail: String(err.message).slice(0, 500) });
  }
});

// Guest download page (what the QR code opens on their phone)
app.get("/p/:id", (req, res) => {
  const id = String(req.params.id).replace(/[^a-f0-9]/g, "");
  if (!fs.existsSync(path.join(PHOTO_DIR, `${id}.jpg`))) return res.status(404).send("Photo not found.");
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Cetak Cetak Photo</title>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@600&family=DM+Sans:wght@400;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#E7E6E7;color:#1d1b1c;font-family:"DM Sans",system-ui,sans-serif;text-align:center;padding:20px}
h2{font-family:"Crimson Pro",serif;font-size:30px;margin:8px 0 16px}
img{max-width:100%;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.15)}
a.btn{display:inline-block;margin:18px 0 8px;padding:14px 32px;background:#1d1b1c;color:#fff;border-radius:999px;text-decoration:none;font-weight:700}
p{color:#6d6a6c;font-size:14px}</style></head><body>
<h2>Your AI Portrait</h2><img src="/photos/${id}.jpg" alt="Your photo">
<br><a class="btn" href="/photos/${id}.jpg" download="cetakcetak-${id}.jpg">Download photo</a>
<p>iPhone: press and hold the photo, then tap "Save to Photos".</p>
<p>Cetak Cetak Photobooth · cetakcetakphotobooth.com</p></body></html>`);
});

// ---------- AI call ----------
async function callOpenRouter(imageDataUrl, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 170_000);
  try {
    const r = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Cetak Cetak AI Booth",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        modalities: ["image", "text"],
        image_config: { aspect_ratio: "2:3" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error?.message || `HTTP ${r.status}`;
      const e = new Error(msg);
      e.status = r.status;
      throw e;
    }
    const url = extractImageUrl(data);
    if (!url) {
      const choice = data?.choices?.[0];
      const text = choice?.message?.content;
      const why = [
        `finish=${choice?.finish_reason ?? choice?.native_finish_reason ?? "?"}`,
        choice?.error ? `error=${JSON.stringify(choice.error).slice(0, 300)}` : "",
        data?.provider ? `provider=${data.provider}` : "",
        choice?.message?.refusal ? `refusal=${String(choice.message.refusal).slice(0, 200)}` : "",
        typeof text === "string" && text ? `text=${text.slice(0, 300)}` : "",
        !choice ? `raw=${JSON.stringify(data).slice(0, 300)}` : "",
      ].filter(Boolean).join(" | ");
      throw new Error(`Model returned no image: ${why}`);
    }
    return await urlToBuffer(url);
  } finally {
    clearTimeout(timer);
  }
}

function extractImageUrl(data) {
  const msg = data?.choices?.[0]?.message;
  if (!msg) return null;
  const img = msg.images?.[0];
  if (img) return img.image_url?.url || img.url || null;
  if (Array.isArray(msg.content)) {
    const part = msg.content.find((p) => p.type === "image_url" || p.type === "output_image");
    if (part) return part.image_url?.url || part.image_url || part.url || null;
  }
  return null;
}

async function urlToBuffer(url) {
  if (url.startsWith("data:")) return Buffer.from(url.split(",")[1], "base64");
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not download generated image (HTTP ${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

// ---------- Image helpers ----------
async function applyFrame(buffer) {
  let img = sharp(buffer).rotate().resize({ width: 1200, height: 1800, fit: "cover" });
  if (fs.existsSync(FRAME_PATH)) {
    const frame = await sharp(FRAME_PATH).resize(1200, 1800, { fit: "fill" }).png().toBuffer();
    img = sharp(await img.png().toBuffer()).composite([{ input: frame }]);
  }
  return img.jpeg({ quality: 92 }).toBuffer();
}

// Demo mode: no API key yet, so we fake a "transformation" to test the whole flow.
async function demoTransform(imageDataUrl) {
  const input = Buffer.from(imageDataUrl.split(",")[1], "base64");
  const base = await sharp(input).rotate().resize(1200, 1800, { fit: "cover" }).modulate({ saturation: 0.6 }).tint({ r: 230, g: 190, b: 140 }).png().toBuffer();
  const label = Buffer.from(`<svg width="1200" height="1800"><rect x="0" y="1620" width="1200" height="180" fill="rgba(0,0,0,0.55)"/>
<text x="600" y="1730" font-family="sans-serif" font-size="64" font-weight="700" fill="#fff" text-anchor="middle">DEMO MODE – no AI key yet</text></svg>`);
  await new Promise((r) => setTimeout(r, 2500)); // pretend the AI is thinking
  return sharp(base).composite([{ input: label }]).jpeg().toBuffer();
}

function friendlyError(err) {
  if (err.name === "AbortError") return "The AI took too long. Please try again.";
  if (err.status === 401 || err.status === 403) return "AI key problem – check the OpenRouter API key.";
  if (err.status === 402) return "AI credits ran out – top up OpenRouter.";
  if (err.status === 429) return "Too many requests – wait a few seconds and try again.";
  if (/no image/i.test(err.message)) return "The AI refused or failed this photo. Please try again or pick another theme.";
  return "Something went wrong. Please try again.";
}

app.listen(PORT, () => {
  console.log(`CCPB AI Booth running on port ${PORT} ${DEMO_MODE ? "(DEMO MODE – no OPENROUTER_API_KEY set)" : `(model: ${OPENROUTER_MODEL})`}`);
});
