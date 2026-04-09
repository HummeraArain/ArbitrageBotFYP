import os
import json
import re
import logging
import sqlite3
import asyncio
from google import genai
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

class StrategyAdvisor:
    def __init__(self, db_path="arbitrage.db", api_key: str = None):
        """Tier 3 LLM: Weekly batch processor for portfolio and threshold optimization."""
        self.db_path = db_path
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self._profit_column = None
        self._has_spread_column = None
        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)
            self.model_id = 'gemini-2.0-flash'
        else:
            self.client = None
            logger.error("CRITICAL: StrategyAdvisor initialized without API Key!")

    def _resolve_trade_columns(self, conn):
        if self._profit_column is not None and self._has_spread_column is not None:
            return self._profit_column, self._has_spread_column
        cursor = conn.execute("PRAGMA table_info(trades)")
        cols = {row[1] for row in cursor.fetchall()}
        if "profit" in cols:
            self._profit_column = "profit"
        elif "profit_usdt" in cols:
            self._profit_column = "profit_usdt"
        else:
            self._profit_column = ""
        self._has_spread_column = "spread" in cols
        return self._profit_column, self._has_spread_column

    def fetch_recent_trades(self, limit=50):
        """Pulls the most recent trade outcomes from the database."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                profit_col, has_spread = self._resolve_trade_columns(conn)
                if not profit_col:
                    return []
                spread_select = "spread" if has_spread else "0.0"
                cursor = conn.execute(
                    f"SELECT {profit_col} as profit, {spread_select} as spread, timestamp FROM trades ORDER BY id DESC LIMIT ?",
                    (limit,)
                )
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"StrategyAdvisor DB Error: {e}")
            return []

    def _clean_and_parse_json(self, raw_text: str) -> dict:
        """Defensive JSON parsing using the exact logic from the core AI."""
        fallback = {
            "suggested_spread_threshold": 0.5, 
            "portfolio_health": "UNKNOWN", 
            "recommendation": "Failsafe triggered: Hold steady. Parsing failed or API offline."
        }
        if not raw_text: return fallback
        
        try:
            # Regex to aggressively strip ```json and ``` tags
            cleaned = re.sub(r'```json\s*(.*?)\s*```', r'\1', raw_text, flags=re.DOTALL | re.IGNORECASE).strip()
            
            # If no 'json' tag was found but backticks remain, simple strip
            if "```" in cleaned: 
                cleaned = cleaned.replace("```", "").strip()
            
            parsed_data = json.loads(cleaned)
            
            # Schema Validation: Ensure required keys exist
            for key in ["suggested_spread_threshold", "portfolio_health", "recommendation"]:
                if key not in parsed_data:
                    logger.warning(f"Missing key '{key}' in StrategyAdvisor response. Using fallback.")
                    return fallback
                    
            return parsed_data
        except json.JSONDecodeError as e:
            logger.error(f"StrategyAdvisor JSON Parsing Error: {str(e)}. Raw text: {raw_text}")
            return fallback
        except Exception as e:
            logger.error(f"StrategyAdvisor JSON Error: {e}")
            return fallback

    async def generate_weekly_report(self) -> dict:
        """Analyzes trade history and recommends system configuration changes."""
        trades = self.fetch_recent_trades()
        if not trades or not self.client:
            return self._clean_and_parse_json("")

        prompt = f"""
        You are ArbPro's Strategy Optimizer (Tier 3 AI). 
        Review the last {len(trades)} trades:
        {trades}
        
        Analyze our win rate, calculate an estimated Sharpe Ratio, and recommend a new minimum spread threshold.
        Respond ONLY in raw JSON matching this schema exactly:
        {{"suggested_spread_threshold": float, "portfolio_health": "POOR" or "GOOD" or "EXCELLENT", "recommendation": "detailed optimization strategy"}}
        """

        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model_id,
                contents=prompt
            )
            return self._clean_and_parse_json(response.text)
        except Exception as e:
            logger.error(f"StrategyAdvisor API Error: {e}")
            return self._clean_and_parse_json("")
