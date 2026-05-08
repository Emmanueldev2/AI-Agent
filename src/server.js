require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", hasKey: !!ANTHROPIC_API_KEY });
});

// ── Generate subject lines ────────────────────────────────────────────────────
app.post("/api/generate", async (req, res) => {
  const { campaign_brief, audience_demographics, tone } = req.body;

  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === "your_anthropic_api_key_here") {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY is not set. Please add it to your .env file.",
    });
  }

  if (!campaign_brief || !audience_demographics) {
    return res.status(400).json({
      error: "campaign_brief and audience_demographics are required.",
    });
  }

  const systemPrompt = `You are an expert email marketing copywriter specialising in high-converting subject lines.

Your task: given a campaign brief and audience demographics, generate exactly 5 email subject lines.

Rules (non-negotiable):
1. Every subject line must be under 50 characters.
2. Every subject line must include a clear call to action.
3. Tone: ${tone || "compelling and friendly"}.
4. Do NOT use sensational language or unsubstantiated claims.
5. If the brief or demographics are too vague to work with, respond with a JSON object: {"error": "brief explanation of what is missing"}.

Respond ONLY with a valid JSON array of 5 strings. No preamble, no markdown fences, no explanation.
Example: ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5"]`;

  const userMessage = JSON.stringify({ campaign_brief, audience_demographics });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Anthropic API error",
      });
    }

    const raw = data.content?.find((b) => b.type === "text")?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(500).json({ error: "Could not parse AI response as JSON." });
    }

    return res.json({ result: parsed });
  } catch (err) {
    console.error("Error calling Anthropic API:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Forward to Make.com webhook ───────────────────────────────────────────────
app.post("/api/send-to-make", async (req, res) => {
  const webhookUrl = req.body.webhook_url || process.env.MAKE_WEBHOOK_URL;

  if (!webhookUrl) {
    return res.status(400).json({ error: "No Make webhook URL provided." });
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...req.body,
        sent_at: new Date().toISOString(),
      }),
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀  Email Subject Line Agent running at http://localhost:${PORT}`);
  console.log(`    API key loaded: ${ANTHROPIC_API_KEY ? "✅" : "❌  (set ANTHROPIC_API_KEY in .env)"}\n`);
});
