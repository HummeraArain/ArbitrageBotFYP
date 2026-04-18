import os
import logging
import asyncio
import re
import sqlite3
from typing import Any
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
logger = logging.getLogger(__name__)


class ChatBot:
    def __init__(self, api_key: str = None, groq_api_key: str = None, db_path: str = "arbitrage.db"):
        # Keep the same signature for backward compatibility.
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.db_path = db_path
        self.last_provider = "offline"
        self.model_id = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")

        if self.api_key:
            self.client = OpenAI(api_key=self.api_key)
        else:
            self.client = None
            logger.error("CRITICAL: ChatBot initialized without OPENAI_API_KEY!")

        self.system_prompt = (
            "You are ArbPro, a crypto market assistant. "
            "Only answer in the crypto domain: prices, exchanges, arbitrage, trends, market sentiment, risk, popular coins, and bot trade history. "
            "If the question is outside crypto, reply with one short line asking for a crypto-related question. "
            "Default style must be short and interactive: one short heading plus 2-5 bullet points. "
            "Keep answers concise and scannable, under 120 words unless user asks for detail."
        )

    def _is_greeting_query(self, query: str) -> bool:
        q = (query or "").strip().lower()
        greetings = {
            "hi",
            "hello",
            "hey",
            "salam",
            "assalamualaikum",
            "good morning",
            "good afternoon",
            "good evening",
        }
        return q in greetings or any(q.startswith(g + " ") for g in greetings)

    def _build_greeting_answer(self) -> str:
        return (
            "Welcome to Arbitrage Bot\n"
            "- Hello! I can help with prices, trends, spreads, and trade history.\n"
            "- Ask: 'my last trades', 'BTC trend today', or 'popular coins now'."
        )

    def _is_trade_history_query(self, query: str) -> bool:
        q = (query or "").lower()
        keywords = [
            "trade history",
            "previous trade",
            "previous trades",
            "past trade",
            "past trades",
            "last trade",
            "last trades",
            "my trades",
            "trades i",
            "which exchange my bot",
            "tell me my trade",
        ]
        return any(k in q for k in keywords)

    def _fetch_recent_trades_from_db(self, limit: int = 7):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT timestamp, symbol, route, profit FROM trades ORDER BY id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
                return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"Trade history query failed: {e}")
            return []

    def _build_trade_history_answer(self, limit: int = 7) -> str:
        rows = self._fetch_recent_trades_from_db(limit=limit)
        if not rows:
            return (
                "Trade History\n"
                "- No previous trades found in your local database yet.\n"
                "- Start the bot and approve trades to build history."
            )

        exchange_counts = {}
        total_profit = 0.0
        lines = ["Your Recent Trades"]

        for row in rows:
            route = str(row.get("route") or "UNKNOWN")
            route = re.sub(r"[\u2190-\u21FF\u2700-\u27FF]+", "->", route)
            route = re.sub(r"\s*->\s*", " -> ", route).strip()
            route = re.sub(r"\s{2,}", " ", route)
            profit = float(row.get("profit") or 0.0)
            ts = str(row.get("timestamp") or "N/A")
            symbol = str(row.get("symbol") or "BTC/USDT")
            total_profit += profit
            exchange_counts[route] = exchange_counts.get(route, 0) + 1
            lines.append(f"- {ts} | {symbol} | {route} | ${profit:.2f}")

        lines.append("Summary")
        lines.append(f"- Trades shown: {len(rows)}")
        lines.append(f"- Total profit (shown trades): ${total_profit:.2f}")
        top_routes = ", ".join([f"{k} ({v})" for k, v in exchange_counts.items()])
        lines.append(f"- Exchange routes used: {top_routes}")
        return "\n".join(lines)

    def _build_trade_history_context(self, limit: int = 7) -> str:
        rows = self._fetch_recent_trades_from_db(limit=limit)
        if not rows:
            return "No trades found in local database."

        lines = []
        for row in rows:
            route = str(row.get("route") or "UNKNOWN")
            route = re.sub(r"[\u2190-\u21FF\u2700-\u27FF]+", "->", route)
            route = re.sub(r"\s*->\s*", " -> ", route).strip()
            route = re.sub(r"\s{2,}", " ", route)
            profit = float(row.get("profit") or 0.0)
            ts = str(row.get("timestamp") or "N/A")
            symbol = str(row.get("symbol") or "BTC/USDT")
            lines.append(f"{ts} | {symbol} | {route} | ${profit:.2f}")
        return "; ".join(lines)

    def _force_bullet_style(self, text: str) -> str:
        lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
        if not lines:
            return "Crypto Update\n- No data available right now."

        if any(ln.startswith("- ") for ln in lines):
            return "\n".join(lines)

        heading = lines[0]
        body = " ".join(lines[1:]) if len(lines) > 1 else ""
        chunks = [c.strip() for c in re.split(r"(?<=[.!?])\s+", body) if c.strip()]
        if not chunks and body:
            chunks = [body]
        chunks = chunks[:4]

        out = [heading]
        for chunk in chunks:
            out.append(f"- {chunk}")
        return "\n".join(out)

    def _sanitize_response(self, text: str) -> str:
        if not text:
            return "Crypto Update\n- No crypto insight available right now."

        cleaned = text.replace("```", " ")
        cleaned = cleaned.replace("**", "")
        cleaned = cleaned.replace("__", "")
        cleaned = cleaned.replace("`", "")
        cleaned = re.sub(r"(?m)^\s{0,3}#{1,6}\s*", "", cleaned)
        cleaned = re.sub(r"(?m)^\s*[\*\u2022]\s+", "- ", cleaned)
        cleaned = re.sub(r"\s+\n", "\n", cleaned)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

        if len(cleaned) > 900:
            cleaned = cleaned[:897].rstrip() + "..."

        return self._force_bullet_style(cleaned)

    def _extract_openai_text(self, response) -> str:
        text = getattr(response, "output_text", None)
        if text:
            return str(text)

        try:
            output = getattr(response, "output", []) or []
            chunks = []
            for item in output:
                content = getattr(item, "content", []) or []
                for c in content:
                    c_text = getattr(c, "text", None)
                    if c_text:
                        chunks.append(str(c_text))
            if chunks:
                return "\n".join(chunks)
        except Exception:
            pass
        return ""

    def _extract_chat_completions_text(self, response: Any) -> str:
        try:
            choices = getattr(response, "choices", []) or []
            if not choices:
                return ""
            message = getattr(choices[0], "message", None)
            if not message:
                return ""
            content = getattr(message, "content", "")
            return str(content or "").strip()
        except Exception:
            return ""

    def _call_openai_chat(self, user_prompt: str) -> str:
        if not self.client:
            return ""

        # Primary path for newer OpenAI SDKs.
        if hasattr(self.client, "responses"):
            response = self.client.responses.create(
                model=self.model_id,
                input=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_output_tokens=350,
            )
            return self._extract_openai_text(response)

        # Compatibility path for older SDKs.
        completion = self.client.chat.completions.create(
            model=self.model_id,
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=350,
        )
        return self._extract_chat_completions_text(completion)

    async def process_chat_query(self, user_query: str, market_context: dict = None) -> str:
        is_greeting = self._is_greeting_query(user_query)
        is_trade_history = self._is_trade_history_query(user_query)

        if market_context:
            context_str = (
                "\nCurrent market snapshot: "
                f"Binance={market_context.get('binance')}, "
                f"Bybit={market_context.get('bybit')}, "
                f"Spread={market_context.get('spread')}, "
                f"Status={market_context.get('status')}."
            )
        else:
            context_str = "\nCurrent market snapshot: unavailable."

        format_instruction = (
            "\nResponse format:\n"
            "Line 1: short heading.\n"
            "Next lines: 2-5 bullet points beginning with '- '.\n"
            "Keep it concise unless user asks for detail."
        )

        extra_context = ""
        if is_greeting:
            extra_context += (
                "\nUser intent: greeting. "
                "Reply as welcome message for Arbitrage Bot in concise bullet format."
            )
        if is_trade_history:
            trades_ctx = self._build_trade_history_context(limit=7)
            extra_context += (
                "\nUser intent: trade history query. "
                f"Use this local DB trade context: {trades_ctx}"
            )

        user_prompt = f"{context_str}{extra_context}{format_instruction}\n\nUser Question: {user_query}"
        if self.client:
            try:
                response_text = await asyncio.to_thread(self._call_openai_chat, user_prompt)
                self.last_provider = "openai"
                return self._sanitize_response(response_text)
            except Exception as e:
                logger.error(f"ChatBot OpenAI Error: {str(e)}")

        # Graceful local fallback only when OpenAI is unavailable.
        if is_greeting:
            self.last_provider = "local"
            return self._build_greeting_answer()
        if is_trade_history:
            self.last_provider = "local"
            return self._build_trade_history_answer(limit=7)

        self.last_provider = "offline"
        return "Crypto Assistant Offline\n- I cannot reach AI right now.\n- Please try again in a moment."

    async def analyze_opportunity(self, binance_price: float, bybit_price: float, spread: float) -> dict:
        # Kept for backward compatibility with older imports/tests.
        return {
            "decision": "WAIT",
            "confidence": 0,
            "position_size": 0.0,
            "reasoning": "ChatBot now uses OpenAI for chat only. Execution analysis is handled by AIAgent.",
        }


analyst = ChatBot(api_key=os.getenv("OPENAI_API_KEY"), db_path="arbitrage.db")
