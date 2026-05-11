"""
main.py
Glow.ai — FastAPI web service

"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from typing import List
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from glpw_agent import GlpwAgent
from document_parser import extract_text, combine_documents
from pdf_exporter import generate_pdf

load_dotenv()

# ── Lifespan (replaces deprecated @app.on_event) ─────────────────────────────
agent: GlpwAgent | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent
    try:
        agent = GlpwAgent()
        print("Glpw.ai agent initialised successfully.")
    except ValueError as e:
        print(f"⚠️   {e}")
        agent = None
    yield

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Glpw.ai — Student Research Agent",
    description="AI-powered academic research assistant for students at all levels.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ── Request / Response models ─────────────────────────────────────────────────
class ResearchRequest(BaseModel):
    topic: str = Field(..., min_length=3, description="Research topic or question")
    level: str = Field("undergraduate", description="high school | undergraduate | postgraduate")
    citation_style: str = Field("APA", description="APA | MLA | Chicago | Harvard")

class OutlineRequest(ResearchRequest):
    paper_type: str = Field("research paper", description="e.g. research paper, thesis, essay")

class DraftRequest(ResearchRequest):
    section: str = Field(..., description="Section to draft, e.g. 'Introduction'")
    context: str = Field("", description="Optional extra context or notes")

class ChatMessage(BaseModel):
    role: str = Field(..., description="user | assistant")
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]


# ── Helpers ───────────────────────────────────────────────────────────────────
def require_agent():
    if agent is None:
        raise HTTPException(
            status_code=503,
            detail="Agent not available. Check GEMINI_API_KEY in your .env file.",
        )


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/api/health")
async def health():
    """Check server and agent status."""
    return {
        "status": "ok",
        "agent_ready": agent is not None,
        "model": GlpwAgent.MODEL,
    }

@app.post("/api/upload")
async def upload_documents(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    results = []
    errors  = []

    for file in files:
        raw = await file.read()
        if len(raw) > 10 * 1024 * 1024:
            errors.append(f"{file.filename}: file too large (max 10 MB)")
            continue

        text = extract_text(file.filename, raw)
        results.append({"filename": file.filename, "text": text, "chars": len(text)})

    if not results and errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    combined = combine_documents(results)
    return {
        "documents": results,
        "combined_text": combined,
        "total_chars": len(combined),
        "errors": errors,
    }

@app.post("/api/summarize")
async def summarize(req: ResearchRequest):
    """Summarize a research topic."""
    require_agent()
    try:
        result = agent.summarize(req.topic, req.level)
        return {"result": result, "mode": "summary"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/outline")
async def outline(req: OutlineRequest):
    """Generate a structured research outline."""
    require_agent()
    try:
        result = agent.generate_outline(req.topic, req.level, req.paper_type)
        return {"result": result, "mode": "outline"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/draft")
async def draft(req: DraftRequest):
    """Draft a specific section of a research paper."""
    require_agent()
    try:
        result = agent.draft_section(req.topic, req.section, req.level, req.context)
        return {"result": result, "mode": "draft"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sources")
async def sources(req: ResearchRequest):
    """Find and cite relevant sources for a topic."""
    require_agent()
    try:
        result = agent.find_sources(req.topic, req.level, req.citation_style)
        return {"result": result, "mode": "sources"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """General multi-turn research conversation."""
    require_agent()
    try:
        messages = [m.model_dump() for m in req.messages]
        result = agent.chat(messages)
        return {"result": result, "mode": "chat"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("APP_HOST", "0.0.0.0"),
        port=int(os.getenv("APP_PORT", 8000)),
        reload=os.getenv("DEBUG", "true").lower() == "true",
    )
class ExportRequest(BaseModel):
    markdown: str
    title: str = "Glow Research"

@app.post("/api/export/pdf")
async def export_pdf(req: ExportRequest):
    if not req.markdown:
        raise HTTPException(status_code=400, detail="No content to export.")
    try:
        pdf_bytes = generate_pdf(req.markdown, req.title)
        safe_title = req.title.replace(" ", "-").lower()[:40]
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="glow-{safe_title}.pdf"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF export failed: {e}")