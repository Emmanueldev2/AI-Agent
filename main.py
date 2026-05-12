"""
main.py — Glow.ai v2 FastAPI web service
New in v2: multi-file upload, document parsing, PDF export
"""

import os
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import List, Optional
from dotenv import load_dotenv

from glpw_agent import GlpwAgent
from document_parser import extract_text, combine_documents
from pdf_exporter import generate_pdf

load_dotenv()

# ── Lifespan ──────────────────────────────────────────────────────────────────
agent = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent
    try:
        agent = GlpwAgent()
        print("Glow.ai agent initialised successfully.")
    except ValueError as e:
        print(f"⚠️   {e}")
        agent = None
    yield

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Glow.ai — Student Research Agent",
    description="AI-powered academic research with document upload and PDF export.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ── Models ────────────────────────────────────────────────────────────────────
class ResearchRequest(BaseModel):
    topic: str = Field(..., min_length=1)
    level: str = Field("undergraduate")
    citation_style: str = Field("APA")
    doc_context: str = Field("", description="Pre-extracted document text")

class OutlineRequest(ResearchRequest):
    paper_type: str = Field("research paper")

class DraftRequest(ResearchRequest):
    section: str = Field("Introduction")
    context: str = Field("")

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class ExportRequest(BaseModel):
    markdown: str
    title: str = "Glow Research"

class AnalyzeRequest(BaseModel):
    doc_context: str
    question: str = ""

# ── Helpers ───────────────────────────────────────────────────────────────────
def require_agent():
    if agent is None:
        raise HTTPException(status_code=503, detail="Agent not available. Check GROQ_API_KEY in your .env file.")

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB per file
ALLOWED_TYPES = {
    "application/pdf", "image/jpeg", "image/png", "image/webp",
    "text/plain", "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")

@app.get("/api/health")
async def health():
    return {"status": "ok", "agent_ready": agent is not None, "version": "2.0.0", "model": GlpwAgent.MODEL}

# ── Document upload ───────────────────────────────────────────────────────────
@app.post("/api/upload")
async def upload_documents(files: List[UploadFile] = File(...)):
    """Upload one or more files and return extracted text."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    results = []
    errors  = []

    for file in files:
        raw = await file.read()
        if len(raw) > MAX_FILE_SIZE:
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

# ── Research endpoints (now accept optional doc_context) ──────────────────────
@app.post("/api/summarize")
async def summarize(req: ResearchRequest):
    require_agent()
    try:
        result = agent.summarize(req.topic, req.level, req.doc_context)
        return {"result": result, "mode": "summary"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/outline")
async def outline(req: OutlineRequest):
    require_agent()
    try:
        result = agent.generate_outline(req.topic, req.level, req.paper_type, req.doc_context)
        return {"result": result, "mode": "outline"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/draft")
async def draft(req: DraftRequest):
    require_agent()
    try:
        result = agent.draft_section(req.topic, req.section, req.level, req.context, req.doc_context)
        return {"result": result, "mode": "draft"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sources")
async def sources(req: ResearchRequest):
    require_agent()
    try:
        result = agent.find_sources(req.topic, req.level, req.citation_style, req.doc_context)
        return {"result": result, "mode": "sources"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    """Analyze uploaded documents directly."""
    require_agent()
    if not req.doc_context:
        raise HTTPException(status_code=400, detail="No document content provided.")
    try:
        result = agent.analyze_documents(req.doc_context, req.question)
        return {"result": result, "mode": "analysis"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat(req: ChatRequest):
    require_agent()
    try:
        messages = [m.model_dump() for m in req.messages]
        result   = agent.chat(messages)
        return {"result": result, "mode": "chat"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── PDF export ────────────────────────────────────────────────────────────────
@app.post("/api/export/pdf")
async def export_pdf(req: ExportRequest):
    """Convert research markdown to a downloadable PDF."""
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

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("APP_HOST", "0.0.0.0"),
        port=int(os.getenv("APP_PORT", 8000)),
        reload=os.getenv("DEBUG", "true").lower() == "true",
    )
