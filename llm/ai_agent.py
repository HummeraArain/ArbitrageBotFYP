import os
import json
import re
import logging
import asyncio
import time
from google import genai
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


class AIAgent:
    def __init__(self, api_key: str = None, groq_api_key: str = None):
        """
        Trading decision agent.
        Primary: Gemini
        Fallback: Groq
        """
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.client = None
        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)
        else:
            logger.warning("Gemini API key missing. AIAgent will use Groq fallback or failsafe decision.")

        self.model_id = "gemini-2.0-flash"
        self.groq_api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        self.groq_client = Groq(api_key=self.groq_api_key) if self.groq_api_key else None
        self._gemini_cooldown_until = 0.0

    def _clean_and_parse_json(self, raw_text: str) -> dict:
        fallback_schema = {
            "decision": "REJECT",
            "confidence": 0,
            "position_size": 0.0,
            "reasoning": "Failsafe triggered: LLM output was unparsable or API failed.",
        }

        if not raw_text:
            return fallback_schema

        try:
            cleaned_text = re.sub(
                r"```json\s*(.*?)\s*```",
                r"\1",
                raw_text,
                flags=re.DOTALL | re.IGNORECASE,
            ).strip()
            if "```" in cleaned_text:
                cleaned_text = cleaned_text.replace("```", "").strip()

            parsed_data = json.loads(cleaned_text)
            for key in ["decision", "confidence", "reasoning"]:
                if key not in parsed_data:
                    logger.warning(f"Missing key '{key}' in LLM response. Using fallback.")
                    return fallback_schema
            if "position_size" not in parsed_data:
                parsed_data["position_size"] = 0.0
            return parsed_data
        except Exception as e:
            logger.error(f"AIAgent JSON parsing error: {e}")
            return fallback_schema

    async def analyze_opportunity(self, binance_price: float, bybit_price: float, spread: float) -> dict:
        prompt = f"""
        Arbitrage Opportunity Detected!
        Binance Price: ${binance_price}
        Bybit Price: ${bybit_price}
        Spread: {spread}%

        Analyze this spread. Is it safe to trade?
        Consider fee/slippage overhead (~0.25%).

        Respond ONLY in valid JSON:
        {{
            "decision": "EXECUTE" or "REJECT",
            "reasoning": "Short explanation",
            "confidence": 0-100,
            "position_size": 0.0
        }}
        """

        now = time.time()
        gemini_allowed = self.client is not None and now >= self._gemini_cooldown_until
        if gemini_allowed:
            try:
                response = await asyncio.to_thread(
                    self.client.models.generate_content,
                    model=self.model_id,
                    contents=prompt,
                )
                return self._clean_and_parse_json(response.text)
            except Exception as e_gemini:
                logger.error(f"Gemini API Error: {e_gemini}")
                if "429" in str(e_gemini) or "RESOURCE_EXHAUSTED" in str(e_gemini).upper():
                    self._gemini_cooldown_until = time.time() + 60.0
                logger.info("Switching to Groq fallback.")

        if self.groq_client:
            try:
                completion = await asyncio.to_thread(
                    self.groq_client.chat.completions.create,
                    messages=[{"role": "user", "content": prompt}],
                    model="llama-3.1-8b-instant",
                    response_format={"type": "json_object"},
                )
                return self._clean_and_parse_json(completion.choices[0].message.content)
            except Exception as e_groq:
                logger.error(f"Groq fallback error: {e_groq}")
                # Retry without strict response_format to avoid provider-side json_validate_failed.
                try:
                    completion = await asyncio.to_thread(
                        self.groq_client.chat.completions.create,
                        messages=[
                            {
                                "role": "system",
                                "content": (
                                    "Return only valid JSON with keys: decision, reasoning, confidence, position_size. "
                                    "position_size must be a numeric literal."
                                ),
                            },
                            {"role": "user", "content": prompt},
                        ],
                        model="llama-3.1-8b-instant",
                    )
                    return self._clean_and_parse_json(completion.choices[0].message.content)
                except Exception as e_groq_retry:
                    logger.error(f"Groq retry error: {e_groq_retry}")

        return {
            "decision": "REJECT",
            "reasoning": "All trading LLM providers unreachable. Safety abort.",
            "confidence": 0,
            "position_size": 0.0,
        }

    async def chat(self, question: str, system_prompt: str = "You are a helpful assistant.") -> str:
        if not self.client:
            return "AI Agent is not configured. Please check Gemini/Groq keys."
        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model_id,
                contents=[{"role": "user", "parts": [{"text": f"System Instruction: {system_prompt}\n\nUser Question: {question}"}]}],
            )
            return response.text
        except Exception as e:
            logger.error(f"AIAgent chat error: {e}")
            return "I am having trouble connecting to the trading AI right now."
