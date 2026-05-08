# Glow.ai — Student Research Agent

An MVP AI research assistant for students at all levels, powered by **Claude (Anthropic)**.  
Built with **FastAPI** (Python backend) + a custom dashboard frontend.

---

## Features

| Mode | What it does |
|------|-------------|
| **Summarize** | Clear topic overviews tailored to student level |
| **Outline** | Hierarchical research outlines with sections & subsections |
| **Draft** | Academically-styled drafts of any paper section |
| **Sources** | Relevant journals, databases, and example citations |
| **Chat** | Multi-turn follow-up conversation on any topic |

---

## Quick Start

### 1. Create a virtual environment
```bash
python -m venv venv

# macOS / Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Add your API key
Open `.env` and replace the placeholder:
```
ANTHROPIC_API_KEY=your_actual_key_here
```
Get your key at → https://console.anthropic.com

### 4. Run the server
```bash
python main.py
```

### 5. Open the dashboard
```
http://localhost:8000
```

### 6. Explore the auto-generated API docs
```
http://localhost:8000/docs
```

---

## Project Structure

```
glpw-ai/
├── main.py               # FastAPI app — routes, lifespan, middleware
├── glpw_agent.py         # Core AI agent class (GlpwAgent)
├── requirements.txt
├── .env                  # API keys (never commit this)
├── .gitignore
├── templates/
│   └── index.html        # Dashboard HTML (served by Jinja2)
└── static/
    ├── css/
    │   └── style.css     # Dashboard styles
    └── js/
        └── app.js        # Frontend logic
```

---

## API Endpoints

All endpoints accept and return JSON.

### `GET /api/health`
Returns server and agent status.

### `POST /api/summarize`
```json
{
  "topic": "The impact of microplastics on marine ecosystems",
  "level": "undergraduate",
  "citation_style": "APA"
}
```

### `POST /api/outline`
```json
{
  "topic": "Climate change and food security",
  "level": "postgraduate",
  "citation_style": "Harvard",
  "paper_type": "thesis"
}
```

### `POST /api/draft`
```json
{
  "topic": "CRISPR gene editing in medicine",
  "level": "undergraduate",
  "section": "Introduction",
  "citation_style": "APA",
  "context": "Focus on ethical considerations, 2018–2024 sources"
}
```

### `POST /api/sources`
```json
{
  "topic": "Artificial intelligence in mental health diagnosis",
  "level": "postgraduate",
  "citation_style": "APA"
}
```

### `POST /api/chat`
```json
{
  "messages": [
    { "role": "user", "content": "What databases should I use for psychology research?" },
    { "role": "assistant", "content": "For psychology research I recommend..." },
    { "role": "user", "content": "Which one has the most peer-reviewed journals?" }
  ]
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | ✅ Yes | — | Your Anthropic API key |
| `APP_HOST` | No | `0.0.0.0` | Server host |
| `APP_PORT` | No | `8000` | Server port |
| `DEBUG` | No | `true` | Hot-reload on file changes |
