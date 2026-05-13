"""
main.py — Glow.ai v2
User accounts, research history, document upload, PDF export.
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Depends, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from glpw_agent import GlpwAgent
from document_parser import extract_text, combine_documents
from pdf_exporter import generate_pdf
from database import create_tables, get_db, User, ResearchSession
from auth import (
    hash_password, verify_password, create_token,
    get_current_user, require_user,
)

load_dotenv()

# ── Lifespan ──────────────────────────────────────────────────────────────────
agent = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent
    create_tables()
    try:
        agent = GlpwAgent()
        print("✅  Glow.ai v2 agent initialised.")
    except ValueError as e:
        print(f"⚠️   {e}")
        agent = None
    yield

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Glow.ai v2", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ── Pydantic models ───────────────────────────────────────────────────────────
class ResearchRequest(BaseModel):
    topic: str = Field(..., min_length=1)
    level: str = Field("undergraduate")
    citation_style: str = Field("APA")
    doc_context: str = Field("")
    save: bool = Field(True)           # save to history?

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
    save: bool = True

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

# ── Helpers ───────────────────────────────────────────────────────────────────
def require_agent():
    if agent is None:
        raise HTTPException(status_code=503, detail="Agent not available. Check GROQ_API_KEY in your .env file.")

def save_session(db, user, mode, topic, result):
    if not user:
        return
    session = ResearchSession(
        user_id=user.id, mode=mode,
        topic=topic[:500], result=result,
    )
    db.add(session)
    db.commit()

# ── Pages ─────────────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def index(request: Request, user: Optional[User] = Depends(get_current_user)):
    if not user:
        return RedirectResponse("/login")
    return templates.TemplateResponse(request, "index.html", {"user": user})

@app.get("/login", include_in_schema=False)
async def login_page(request: Request, user: Optional[User] = Depends(get_current_user)):
    if user:
        return RedirectResponse("/")
    return templates.TemplateResponse(request, "login.html")

@app.get("/signup", include_in_schema=False)
async def signup_page(request: Request, user: Optional[User] = Depends(get_current_user)):
    if user:
        return RedirectResponse("/")
    return templates.TemplateResponse(request, "signup.html")

# ── Auth routes ───────────────────────────────────────────────────────────────
@app.post("/api/auth/signup")
async def signup(req: SignupRequest, response: Response, db: Session = Depends(get_db)):
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if db.query(User).filter(User.email == req.email.lower()).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    user = User(name=req.name, email=req.email.lower(), password=hash_password(req.password))
    db.add(user); db.commit(); db.refresh(user)
    token = create_token(user.id, user.email)
    response.set_cookie("glow_token", token, httponly=True, max_age=60*60*24*30, samesite="lax")
    return {"message": "Account created", "name": user.name}

@app.post("/api/auth/login")
async def login(req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or not verify_password(req.password, user.password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    token = create_token(user.id, user.email)
    response.set_cookie("glow_token", token, httponly=True, max_age=60*60*24*30, samesite="lax")
    return {"message": "Logged in", "name": user.name}

@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie("glow_token")
    return {"message": "Logged out"}

@app.get("/api/auth/me")
async def me(user: User = Depends(require_user)):
    return {"id": user.id, "name": user.name, "email": user.email,
            "joined": user.created_at.strftime("%B %Y")}

# ── Research history ──────────────────────────────────────────────────────────
@app.get("/api/history")
async def get_history(user: User = Depends(require_user), db: Session = Depends(get_db)):
    sessions = (
        db.query(ResearchSession)
        .filter(ResearchSession.user_id == user.id)
        .order_by(ResearchSession.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": s.id, "mode": s.mode, "topic": s.topic,
            "result": s.result,
            "created_at": s.created_at.strftime("%b %d, %Y · %H:%M"),
        }
        for s in sessions
    ]

@app.delete("/api/history/{session_id}")
async def delete_session(session_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    session = db.query(ResearchSession).filter(
        ResearchSession.id == session_id,
        ResearchSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    db.delete(session); db.commit()
    return {"message": "Deleted"}

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "agent_ready": agent is not None, "version": "2.0.0"}

# ── Document upload ───────────────────────────────────────────────────────────
@app.post("/api/upload")
async def upload_documents(
    files: List[UploadFile] = File(...),
    user: Optional[User] = Depends(get_current_user),
):
    results = []; errors = []
    for file in files:
        raw = await file.read()
        if len(raw) > 10 * 1024 * 1024:
            errors.append(f"{file.filename}: too large"); continue
        text = extract_text(file.filename, raw)
        results.append({"filename": file.filename, "text": text, "chars": len(text)})
    if not results and errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    combined = combine_documents(results)
    return {"documents": results, "combined_text": combined, "total_chars": len(combined), "errors": errors}

# ── Research endpoints ────────────────────────────────────────────────────────
@app.post("/api/summarize")
async def summarize(req: ResearchRequest, user: Optional[User] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_agent()
    try:
        result = agent.summarize(req.topic, req.level, req.doc_context)
        if req.save: save_session(db, user, "summarize", req.topic, result)
        return {"result": result, "mode": "summary"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/outline")
async def outline(req: OutlineRequest, user: Optional[User] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_agent()
    try:
        result = agent.generate_outline(req.topic, req.level, req.paper_type, req.doc_context)
        if req.save: save_session(db, user, "outline", req.topic, result)
        return {"result": result, "mode": "outline"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/draft")
async def draft(req: DraftRequest, user: Optional[User] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_agent()
    try:
        result = agent.draft_section(req.topic, req.section, req.level, req.context, req.doc_context)
        if req.save: save_session(db, user, "draft", req.topic, result)
        return {"result": result, "mode": "draft"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sources")
async def sources(req: ResearchRequest, user: Optional[User] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_agent()
    try:
        result = agent.find_sources(req.topic, req.level, req.citation_style, req.doc_context)
        if req.save: save_session(db, user, "sources", req.topic, result)
        return {"result": result, "mode": "sources"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest, user: Optional[User] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_agent()
    if not req.doc_context:
        raise HTTPException(status_code=400, detail="No document content provided.")
    try:
        result = agent.analyze_documents(req.doc_context, req.question)
        if req.save: save_session(db, user, "analyze", req.question or "Document analysis", result)
        return {"result": result, "mode": "analysis"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat(req: ChatRequest, user: Optional[User] = Depends(get_current_user), db: Session = Depends(get_db)):
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
    if not req.markdown:
        raise HTTPException(status_code=400, detail="No content to export.")
    try:
        pdf_bytes = generate_pdf(req.markdown, req.title)
        safe_title = req.title.replace(" ", "-").lower()[:40]
        from fastapi.responses import Response as FR
        return FR(content=pdf_bytes, media_type="application/pdf",
                  headers={"Content-Disposition": f'attachment; filename="glow-{safe_title}.pdf"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF export failed: {e}")

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app",
                host=os.getenv("APP_HOST", "0.0.0.0"),
                port=int(os.getenv("APP_PORT", 8000)),
                reload=os.getenv("DEBUG", "true").lower() == "true")
