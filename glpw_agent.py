"""
glpw_agent.py — Glow.ai Core Research Agent (v2)
Supports typed topics AND uploaded documents (PDF, images, text)
"""

import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()


class GlpwAgent:
    MODEL      = "llama-3.3-70b-versatile"
    MAX_TOKENS = 4096

    SYSTEM_PROMPT = """You are Glow, an expert academic research assistant helping students at all levels conduct thorough and well-structured research.

Your capabilities:
1. SUMMARIZE research topics and academic papers clearly and concisely.
2. GENERATE structured research outlines with sections, subsections, and key points.
3. DRAFT research content including introductions, literature reviews, methodology, discussions, and conclusions.
4. FIND and suggest relevant sources, journals, and databases for a given topic.
5. ANALYZE uploaded documents and research from their content directly.

Guiding principles:
- Be academically rigorous and factually accurate.
- Never fabricate citations — provide example structures and advise the student to verify.
- Use clear markdown: headings (##), bullet points, numbered lists, bold for key terms.
- For outlines, use a numbered hierarchy (1. / 1.1 / 1.1.1).
- When analyzing uploaded documents, always reference specific content from them.
- Keep summaries under 300 words unless more detail is requested.
"""

    def __init__(self):
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY is not set.")
        self.client = Groq(api_key=api_key)

    def summarize(self, topic, level="undergraduate", doc_context="", **kwargs):
        base = f"Student level: {level}\n\n"
        if doc_context:
            base += f"Uploaded document content:\n\n{doc_context}\n\n---\n\n"
        base += f"Summarize this research topic (use the document above if provided):\n\n{topic}"
        return self._call(base)

    def generate_outline(self, topic, level="undergraduate", paper_type="research paper", doc_context="", **kwargs):
        base = f"Student level: {level}\nPaper type: {paper_type}\n\n"
        if doc_context:
            base += f"Uploaded document content:\n\n{doc_context}\n\n---\n\n"
        base += f"Generate a detailed research outline for:\n\n{topic}"
        return self._call(base)

    def draft_section(self, topic, section, level="undergraduate", context="", doc_context="", **kwargs):
        base = f"Student level: {level}\nTopic: {topic}\nSection: {section}\n"
        if context:
            base += f"Additional context: {context}\n"
        if doc_context:
            base += f"\nUploaded document content:\n\n{doc_context}\n\n---\n\n"
        base += "\nDraft this section academically."
        return self._call(base)

    def find_sources(self, topic, level="undergraduate", citation_style="APA", doc_context="", **kwargs):
        base = f"Student level: {level}\nCitation style: {citation_style}\n\n"
        if doc_context:
            base += f"Uploaded document content:\n\n{doc_context}\n\n---\n\n"
        base += f"Suggest relevant sources and {citation_style} citations for:\n\n{topic}"
        return self._call(base)

    def analyze_documents(self, doc_context, question=""):
        prompt = f"The student has uploaded the following document(s):\n\n{doc_context}\n\n---\n\n"
        prompt += question if question else "Provide a comprehensive academic analysis: main arguments, key findings, methodology, strengths, limitations, and further research suggestions."
        return self._call(prompt)

    def chat(self, messages):
        formatted = [{"role": "system", "content": self.SYSTEM_PROMPT}]
        formatted += [{"role": m["role"], "content": m["content"]} for m in messages]
        response = self.client.chat.completions.create(
            model=self.MODEL, messages=formatted, max_tokens=self.MAX_TOKENS)
        return response.choices[0].message.content

    def _call(self, user_message):
        response = self.client.chat.completions.create(
            model=self.MODEL,
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user",   "content": user_message},
            ],
            max_tokens=self.MAX_TOKENS,
        )
        return response.choices[0].message.content
