"""
glpw_agent.py
Core AI research agent powered by Claude (Anthropic).
Adapted from the magnus.ai MVPAIAgent pattern.
"""

import os
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()


class GlpwAgent:
    """
    Glpw.ai Research Agent.
    Helps students at all levels find, summarize, outline, draft,
    and cite academic research using Claude as the AI backbone.
    """

    MODEL = "claude-sonnet-4-20250514"
    MAX_TOKENS = 4096

    SYSTEM_PROMPT = """You are Glpw, an expert academic research assistant dedicated to helping students at all levels — high school, undergraduate, and postgraduate — conduct thorough, accurate, and well-structured research.

Your capabilities:
1. SUMMARIZE research topics and academic papers clearly and concisely.
2. GENERATE structured research outlines with sections, subsections, and key points.
3. DRAFT research content including introductions, literature reviews, methodology sections, discussions, and conclusions.
4. FIND and suggest relevant sources, journals, and databases for a given topic.
5. CITE sources in APA, MLA, Chicago, or Harvard format as requested.

Guiding principles:
- Always be academically rigorous and factually accurate.
- Tailor complexity to the student's level (high school / undergraduate / postgraduate).
- Never fabricate citations — if real sources cannot be confirmed, provide example citation structures and advise the student to verify.
- Encourage critical thinking rather than just providing answers.
- If a request is ambiguous, ask one clarifying question before proceeding.

Output format:
- Use clear markdown: headings (##), bullet points, numbered lists, bold for key terms.
- For outlines, use a numbered hierarchy (1. / 1.1 / 1.1.1).
- For citations, present each on its own line in a numbered reference list.
- Keep summaries under 300 words unless the student requests more detail.
"""

    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key or api_key == "your_anthropic_api_key_here":
            raise ValueError(
                "ANTHROPIC_API_KEY is not set. Please add it to your .env file."
            )
        self.client = Anthropic(api_key=api_key)

    # ── Public methods ────────────────────────────────────────────────────────

    def summarize(self, topic: str, level: str = "undergraduate") -> str:
        prompt = (
            f"Student level: {level}\n\n"
            f"Please summarize the following research topic clearly and concisely:\n\n{topic}"
        )
        return self._call(prompt)

    def generate_outline(self, topic: str, level: str = "undergraduate", paper_type: str = "research paper") -> str:
        prompt = (
            f"Student level: {level}\n"
            f"Paper type: {paper_type}\n\n"
            f"Generate a detailed, structured research outline for the following topic:\n\n{topic}"
        )
        return self._call(prompt)

    def draft_section(self, topic: str, section: str, level: str = "undergraduate", context: str = "") -> str:
        prompt = (
            f"Student level: {level}\n"
            f"Research topic: {topic}\n"
            f"Section to draft: {section}\n"
            + (f"Additional context: {context}\n" if context else "")
            + "\nPlease draft this section in an academically appropriate style."
        )
        return self._call(prompt)

    def find_sources(self, topic: str, level: str = "undergraduate", citation_style: str = "APA") -> str:
        prompt = (
            f"Student level: {level}\n"
            f"Citation style: {citation_style}\n\n"
            f"Suggest relevant academic sources, journals, and databases for the following research topic. "
            f"Provide example citations in {citation_style} format and advise where to verify them:\n\n{topic}"
        )
        return self._call(prompt)

    def chat(self, messages: list[dict]) -> str:
        """General multi-turn research conversation."""
        response = self.client.messages.create(
            model=self.MODEL,
            max_tokens=self.MAX_TOKENS,
            system=self.SYSTEM_PROMPT,
            messages=messages,
        )
        return response.content[0].text

    # ── Private helpers ───────────────────────────────────────────────────────

    def _call(self, user_message: str) -> str:
        response = self.client.messages.create(
            model=self.MODEL,
            max_tokens=self.MAX_TOKENS,
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text
