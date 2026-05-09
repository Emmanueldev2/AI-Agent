import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

class GlpwAgent:
    MODEL = "gemini-2.0-flash"

    SYSTEM_PROMPT = """You are Glow, an expert academic research assistant helping students at all levels conduct thorough and well-structured research. You summarize topics, generate outlines, draft sections, and find sources. Use clear markdown formatting."""

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set.")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(
            self.MODEL,
            system_instruction=self.SYSTEM_PROMPT
        )

    def _call(self, prompt: str) -> str:
        response = self.model.generate_content(prompt)
        return response.text

    def summarize(self, topic, level="undergraduate", **kwargs):
        return self._call(f"Student level: {level}\n\nSummarize this research topic:\n\n{topic}")

    def generate_outline(self, topic, level="undergraduate", paper_type="research paper", **kwargs):
        return self._call(f"Student level: {level}\nPaper type: {paper_type}\n\nGenerate a detailed research outline for:\n\n{topic}")

    def draft_section(self, topic, section, level="undergraduate", context="", **kwargs):
        return self._call(f"Student level: {level}\nTopic: {topic}\nSection: {section}\n{('Context: ' + context) if context else ''}\n\nDraft this section academically.")

    def find_sources(self, topic, level="undergraduate", citation_style="APA", **kwargs):
        return self._call(f"Student level: {level}\nCitation style: {citation_style}\n\nSuggest sources and example citations for:\n\n{topic}")

    def chat(self, messages: list) -> str:
        history = [
            {"role": "user" if m["role"] == "user" else "model", "parts": [m["content"]]}
            for m in messages[:-1]
        ]
        chat = self.model.start_chat(history=history)
        response = chat.send_message(messages[-1]["content"])
        return response.text