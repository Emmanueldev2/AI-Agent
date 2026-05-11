"""
document_parser.py — Glow.ai v2
Extracts text from uploaded files: PDF, images (JPG/PNG), plain text, DOCX.
"""

import os
import io
from pathlib import Path

# ── PDF parsing ────────────────────────────────────────────────────────────────
def extract_from_pdf(file_bytes: bytes) -> str:
    try:
        import fitz  # PyMuPDF
        doc  = fitz.open(stream=file_bytes, filetype="pdf")
        text = "\n\n".join(page.get_text() for page in doc)
        doc.close()
        return text.strip()
    except ImportError:
        return "[PDF parsing unavailable — install PyMuPDF: pip install pymupdf]"
    except Exception as e:
        return f"[PDF parse error: {e}]"


# ── Image OCR ──────────────────────────────────────────────────────────────────
def extract_from_image(file_bytes: bytes) -> str:
    try:
        from PIL import Image
        import pytesseract
        image = Image.open(io.BytesIO(file_bytes))
        text  = pytesseract.image_to_string(image)
        return text.strip() or "[No readable text found in image]"
    except ImportError:
        return "[Image OCR unavailable — install Pillow and pytesseract]"
    except Exception as e:
        return f"[Image OCR error: {e}]"


# ── Plain text / DOCX ──────────────────────────────────────────────────────────
def extract_from_text(file_bytes: bytes) -> str:
    try:
        return file_bytes.decode("utf-8", errors="replace").strip()
    except Exception as e:
        return f"[Text read error: {e}]"


def extract_from_docx(file_bytes: bytes) -> str:
    try:
        import docx
        from io import BytesIO
        doc   = docx.Document(BytesIO(file_bytes))
        paras = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paras)
    except ImportError:
        return "[DOCX parsing unavailable — install python-docx: pip install python-docx]"
    except Exception as e:
        return f"[DOCX parse error: {e}]"


# ── Router ─────────────────────────────────────────────────────────────────────
def extract_text(filename: str, file_bytes: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return extract_from_pdf(file_bytes)
    elif ext in (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"):
        return extract_from_image(file_bytes)
    elif ext == ".docx":
        return extract_from_docx(file_bytes)
    elif ext in (".txt", ".md", ".csv", ".rtf"):
        return extract_from_text(file_bytes)
    else:
        return f"[Unsupported file type: {ext}]"


def combine_documents(docs: list[dict]) -> str:
    """
    Combine multiple extracted documents into a single context string.
    Each doc dict: { "filename": str, "text": str }
    """
    if not docs:
        return ""
    if len(docs) == 1:
        return f"[Document: {docs[0]['filename']}]\n\n{docs[0]['text']}"
    parts = []
    for i, doc in enumerate(docs, 1):
        parts.append(f"[Document {i}: {doc['filename']}]\n\n{doc['text']}")
    return "\n\n" + ("─" * 40) + "\n\n".join(parts)
