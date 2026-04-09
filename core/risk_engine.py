import sqlite3
import logging
import os
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class RiskEngine:
    @staticmethod
    def _as_bool(value, default=False):
        if value is None:
            return default
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    def __init__(self, db_path="arbitrage.db", max_risk_per_trade=0.02, kelly_fraction=0.2, daily_loss_limit=50.0):
        """Tier 5 Safety Net: Kelly Criterion & Circuit Breakers"""
        self.db_path = db_path
        self.max_risk_per_trade = max_risk_per_trade
        self.kelly_fraction = kelly_fraction  # 0.2 means '20% of the optimal Kelly size'
        self.daily_loss_limit = daily_loss_limit
        self.enable_consecutive_loss_breaker = self._as_bool(
            os.getenv("RISK_ENABLE_CONSECUTIVE_LOSS_BREAKER"),
            default=True,
        )
        self.consecutive_loss_limit = max(
            2,
            int((os.getenv("RISK_CONSECUTIVE_LOSS_LIMIT") or "3").strip()),
        )
        self.consecutive_min_loss = float((os.getenv("RISK_CONSECUTIVE_MIN_LOSS") or "0.0").strip())
        self.consecutive_lookback_minutes = max(
            1,
            int((os.getenv("RISK_CONSECUTIVE_LOOKBACK_MINUTES") or "20").strip()),
        )
        self.exclude_paper_trades = self._as_bool(
            os.getenv("RISK_EXCLUDE_PAPER_TRADES"),
            default=True,
        )
        self._profit_column = None
        self._success_filter_sql = None
        self._mode_filter_sql = None

    def _get_profit_column(self, conn) -> str:
        if self._profit_column:
            return self._profit_column
        cursor = conn.execute("PRAGMA table_info(trades)")
        cols = {row[1] for row in cursor.fetchall()}
        if "profit" in cols:
            self._profit_column = "profit"
        elif "profit_usdt" in cols:
            self._profit_column = "profit_usdt"
        else:
            self._profit_column = ""
        return self._profit_column

    def _get_success_filter_sql(self, conn) -> str:
        if self._success_filter_sql is not None:
            return self._success_filter_sql
        cursor = conn.execute("PRAGMA table_info(trades)")
        cols = {row[1] for row in cursor.fetchall()}
        if "status" in cols:
            self._success_filter_sql = " AND COALESCE(status, 'SUCCESS') = 'SUCCESS'"
        else:
            self._success_filter_sql = ""
        return self._success_filter_sql

    def _get_mode_filter_sql(self, conn) -> str:
        if self._mode_filter_sql is not None:
            return self._mode_filter_sql
        if not self.exclude_paper_trades:
            self._mode_filter_sql = ""
            return self._mode_filter_sql

        cursor = conn.execute("PRAGMA table_info(trades)")
        cols = {row[1] for row in cursor.fetchall()}
        if "execution_mode" in cols:
            self._mode_filter_sql = " AND UPPER(COALESCE(execution_mode, 'LIVE')) NOT LIKE '%PAPER%'"
        else:
            self._mode_filter_sql = ""
        return self._mode_filter_sql

    def get_daily_pnl(self) -> float:
        """Calculates the cumulative profit/loss for the last 24 hours."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                profit_col = self._get_profit_column(conn)
                if not profit_col:
                    return 0.0
                success_filter = self._get_success_filter_sql(conn)
                mode_filter = self._get_mode_filter_sql(conn)
                cursor = conn.execute(
                    f"SELECT sum({profit_col}) as daily_pnl FROM trades WHERE timestamp >= datetime('now', '-1 day'){success_filter}{mode_filter}"
                )
                result = cursor.fetchone()
                return result["daily_pnl"] if result and result["daily_pnl"] else 0.0
        except Exception as e:
            logger.error(f"Risk Engine DB Error: {e}")
            return 0.0

    def get_recent_trades(self, limit=100):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                profit_col = self._get_profit_column(conn)
                if not profit_col:
                    return []
                success_filter = self._get_success_filter_sql(conn)
                mode_filter = self._get_mode_filter_sql(conn)
                cursor = conn.execute(
                    f"SELECT {profit_col} as profit_value FROM trades WHERE 1=1 {success_filter}{mode_filter} ORDER BY id DESC LIMIT ?",
                    (limit,),
                )
                return [row["profit_value"] for row in cursor.fetchall()]
        except Exception:
            return []

    def _get_recent_trade_rows(self, limit=10):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                profit_col = self._get_profit_column(conn)
                if not profit_col:
                    return []
                success_filter = self._get_success_filter_sql(conn)
                mode_filter = self._get_mode_filter_sql(conn)
                cursor = conn.execute(
                    f"""
                    SELECT
                        {profit_col} AS profit_value,
                        timestamp
                    FROM trades
                    WHERE 1=1 {success_filter}{mode_filter}
                    ORDER BY id DESC
                    LIMIT ?
                    """,
                    (int(limit),),
                )
                return [dict(row) for row in cursor.fetchall()]
        except Exception:
            return []

    @staticmethod
    def _parse_trade_timestamp(ts_value):
        ts_text = str(ts_value or "").strip()
        if not ts_text:
            return None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
            try:
                return datetime.strptime(ts_text, fmt)
            except Exception:
                continue
        return None

    def check_circuit_breaker(self) -> dict:
        """
        Veto System: Checks Daily Loss Limit and Consecutive Losses.
        Returns {"halted": bool, "reason": str}
        """
        # 1. Check Hard Daily Drawdown Limit
        daily_pnl = self.get_daily_pnl()
        if daily_pnl <= -abs(self.daily_loss_limit):
            logger.critical(f"CIRCUIT BREAKER: Daily loss limit (${self.daily_loss_limit}) exceeded.")
            return {"halted": True, "reason": "Daily Drawdown Exceeded"}

        # 2. Check Consecutive Loss Streak
        if self.enable_consecutive_loss_breaker:
            trades = self._get_recent_trade_rows(limit=self.consecutive_loss_limit)
            recent_cutoff = datetime.utcnow() - timedelta(minutes=self.consecutive_lookback_minutes)
            if len(trades) == self.consecutive_loss_limit:
                profits = [float((row or {}).get("profit_value") or 0.0) for row in trades]
                latest_ts = self._parse_trade_timestamp((trades[0] or {}).get("timestamp"))
                is_recent_streak = latest_ts is not None and latest_ts >= recent_cutoff
                is_loss_streak = all(p <= -abs(self.consecutive_min_loss) for p in profits)
            else:
                is_recent_streak = False
                is_loss_streak = False

            if is_recent_streak and is_loss_streak:
                logger.warning(
                    f"CIRCUIT BREAKER: {self.consecutive_loss_limit} consecutive losses detected "
                    f"(min loss threshold={self.consecutive_min_loss}, "
                    f"lookback={self.consecutive_lookback_minutes}m)."
                )
                return {"halted": True, "reason": "Consecutive Loss Streak"}

        return {"halted": False, "reason": "System Healthy"}

    def calculate_kelly_position(self, ai_confidence: int) -> float:
        """Calculates fractional Kelly based on historical win rate and current AI confidence."""
        trades = self.get_recent_trades(limit=100)
        
        # Base fallback if not enough history
        base_size = self.max_risk_per_trade * 0.10 
        
        if len(trades) < 10:
            return base_size
            
        wins = [t for t in trades if t > 0]
        losses = [t for t in trades if t <= 0]
        
        if not losses or not wins:
            return base_size
            
        historical_win_rate = len(wins) / len(trades)
        
        # Blend historical win rate with current AI confidence (e.g., 80% confidence = 0.8)
        blended_win_rate = (historical_win_rate * 0.5) + ((ai_confidence / 100.0) * 0.5)
        loss_rate = 1.0 - blended_win_rate
        
        avg_win = sum(wins) / len(wins)
        avg_loss = abs(sum(losses) / len(losses))
        
        if avg_loss == 0: return base_size
            
        # b = odds ratio
        b = avg_win / avg_loss
        
        # Standard Kelly Formula
        kelly_fraction = (b * blended_win_rate - loss_rate) / b
        
        # Apply fractional modifier (0.2) to prevent over-leveraging
        adjusted_kelly = max(0, kelly_fraction * self.kelly_fraction)
        
        # Never exceed absolute max risk (e.g., 2% of portfolio)
        return min(adjusted_kelly, self.max_risk_per_trade)

    def validate_and_size_trade(self, llm_decision: str, llm_confidence: int) -> dict:
        """The final gatekeeper called by api.py before execution."""
        breaker_status = self.check_circuit_breaker()
        if breaker_status["halted"]:
            return {"approved": False, "reason": breaker_status["reason"], "size": 0}
            
        if llm_decision in ["WAIT", "REJECT"]:
            return {"approved": False, "reason": "AI Veto", "size": 0}
            
        optimal_size = self.calculate_kelly_position(ai_confidence=llm_confidence)
        
        if optimal_size <= 0:
            return {"approved": False, "reason": "Kelly sizing <= 0 (EV is negative)", "size": 0}
            
        return {"approved": True, "reason": "Risk checks passed", "size": optimal_size}
