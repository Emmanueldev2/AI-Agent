"""
glpw_agent.py — Glow.ai Core Research Agent
"""

import os
import anthropic
from dotenv import load_dotenv

load_dotenv()


class GlpwAgent:
    MODEL      = "claude-sonnet-4-20250514"
    MAX_TOKENS = 4096

    SYSTEM_PROMPT = """You are Glow, an expert academic research assistant helping students at all levels — high school, undergraduate, and postgraduate — conduct thorough and well-structured research.

Your capabilities:
1. SUMMARIZE research topics and academic papers clearly and concisely.
2. GENERATE structured research outlines with sections, subsections, and key points.
3. DRAFT research content including introductions, literature reviews, methodology, discussions, and conclusions.
4. FIND and suggest relevant sources, journals, and databases for a given topic.
5. CITE sources in APA, MLA, Chicago, or Harvard format as requested.

Guiding principles:
- Be academically rigorous and factually accurate.
- Never fabricate citations — provide example structures and advise the student to verify.
- Encourage critical thinking.
- Use clear markdown: headings (##), bullet points, numbered lists, bold for key terms.
- For outlines, use a numbered hierarchy (1. / 1.1 / 1.1.1).
- Keep summaries under 300 words unless more detail is requested.
"""

    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key or api_key == "your_anthropic_api_key_here":
            raise ValueError("ANTHROPIC_API_KEY is not set.")
        self.client = anthropic.Anthropic(api_key=api_key)

    def summarize(self, topic: str, level: str = "undergraduate") -> str:
        return self._call(f"Student level: {level}\n\nSummarize this research topic:\n\n{topic}")

    def generate_outline(self, topic: str, level: str = "undergraduate", paper_type: str = "research paper") -> str:
        return self._call(f"Student level: {level}\nPaper type: {paper_type}\n\nGenerate a detailed research outline for:\n\n{topic}")

    def draft_section(self, topic: str, section: str, level: str = "undergraduate", context: str = "") -> str:
        return self._call(f"Student level: {level}\nTopic: {topic}\nSection: {section}\n{('Context: ' + context) if context else ''}\n\nDraft this section academically.")

    def find_sources(self, topic: str, level: str = "undergraduate", citation_style: str = "APA") -> str:
        return self._call(f"Student level: {level}\nCitation style: {citation_style}\n\nSuggest sources and example citations for:\n\n{topic}")

    def chat(self, messages: list) -> str:
        response = self.client.messages.create(
            model=self.MODEL,
            max_tokens=self.MAX_TOKENS,
            system=self.SYSTEM_PROMPT,
            messages=messages,
        )
        return response.content[0].text

    def _call(self, user_message: str) -> str:
        response = self.client.messages.create(
            model=self.MODEL,
            max_tokens=self.MAX_TOKENS,
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text
