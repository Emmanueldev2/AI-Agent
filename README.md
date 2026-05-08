# Email Subject Line Agent

An MVP AI agent that generates high-converting email subject lines using the Claude API, with optional Make.com automation support.

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Add your API key
Open `.env` and replace the placeholder:
```
ANTHROPIC_API_KEY=your_actual_key_here
```
Get your key at → https://console.anthropic.com

### 3. Run the server
```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

### 4. Open in browser
```
http://localhost:3000
```

---

## Project Structure

```
email-agent/
├── public/
│   └── index.html        # Frontend UI
├── src/
│   └── server.js         # Express backend + Claude API calls
├── .env                  # Your API keys (never commit this)
├── .gitignore
├── package.json
└── README.md
```

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Check server + API key status |
| POST | `/api/generate` | Generate subject lines via Claude |
| POST | `/api/send-to-make` | Forward results to Make.com webhook |

### POST `/api/generate` — Request body
```json
{
  "campaign_brief": "Promote our new eco-friendly water bottle",
  "audience_demographics": "Age 18-30, environmentally conscious",
  "tone": "compelling and friendly"
}
```

### POST `/api/generate` — Response
```json
{
  "result": [
    "Go Green Today: Get Your Eco-Bottle!",
    "Hydrate Better. Act Now.",
    "Your Planet-Friendly Bottle Awaits",
    "Sip Sustainably: Shop Now",
    "Join the Eco Movement Today"
  ]
}
```

---

## Make.com Integration

1. Create a scenario in Make.com with a **Custom Webhook** trigger
2. Copy the webhook URL
3. Paste it into the webhook field in the UI (or set `MAKE_WEBHOOK_URL` in `.env`)
4. Click **Send to Make** after generating — results are forwarded automatically

The payload sent to Make includes:
- `campaign_brief`
- `audience`
- `tone`
- `subject_lines` (array of 5)
- `sent_at` (ISO timestamp)

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ Yes | Your Anthropic API key |
| `MAKE_WEBHOOK_URL` | Optional | Default Make.com webhook URL |
| `PORT` | Optional | Server port (default: 3000) |
