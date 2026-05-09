import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

class GlpwAgent:
    MODEL = "llama-3.3-70b-versatile"

    SYSTEM_PROMPT = """You are Glow, an expert academic research assistant helping students at all levels conduct thorough and well-structured research. You summarize topics, generate outlines, draft sections, and find sources. Use clear markdown formatting."""

    def __init__(self):
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY is not set.")
        self.client = Groq(api_key=api_key)

    def _call(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=self.MODEL,
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            max_tokens=4096,
        )
        return response.choices[0].message.content

    def summarize(self, topic, level="undergraduate", **kwargs):
        return self._call(f"Student level: {level}\n\nSummarize this research topic:\n\n{topic}")

    def generate_outline(self, topic, level="undergraduate", paper_type="research paper", **kwargs):
        return self._call(f"Student level: {level}\nPaper type: {paper_type}\n\nGenerate a detailed research outline for:\n\n{topic}")

    def draft_section(self, topic, section, level="undergraduate", context="", **kwargs):
        return self._call(f"Student level: {level}\nTopic: {topic}\nSection: {section}\n{('Context: ' + context) if context else ''}\n\nDraft this section academically.")

    def find_sources(self, topic, level="undergraduate", citation_style="APA", **kwargs):
        return self._call(f"Student level: {level}\nCitation style: {citation_style}\n\nSuggest sources and example citations for:\n\n{topic}")

    def chat(self, messages: list) -> str:
        formatted = [{"role": "system", "content": self.SYSTEM_PROMPT}]
        formatted += [{"role": m["role"], "content": m["content"]} for m in messages]
        response = self.client.chat.completions.create(
            model=self.MODEL,
            messages=formatted,
            max_tokens=4096,
        )
        return response.choices[0].message.content