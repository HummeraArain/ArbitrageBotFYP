import sqlite3
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
MAX_TRADE_HISTORY_RECORDS = 500

def save_trade(
    route,
    profit,
    username=None,
    symbol="BTC/USDT",
    pair=None,
    buy_exchange=None,
    sell_exchange=None,
    buy_price=None,
    sell_price=None,
    spread_pct=None,
    quantity=None,
    execution_mode="LIVE",
    status="SUCCESS",
    error_reason=None,
    fee_pct=None,
    slippage_pct=None,
):
    """Standalone helper to save a trade from any module."""
    try:
        db = DatabaseCore(db_path="arbitrage.db")
        db.save_trade_record(
            route=route,
            profit=profit,
            username=username,
            symbol=symbol,
            pair=pair,
            buy_exchange=buy_exchange,
            sell_exchange=sell_exchange,
            buy_price=buy_price,
            sell_price=sell_price,
            spread_pct=spread_pct,
            quantity=quantity,
            execution_mode=execution_mode,
            status=status,
            error_reason=error_reason,
            fee_pct=fee_pct,
            slippage_pct=slippage_pct,
        )
    except Exception as e:
        logger.error(f"Global save_trade failed: {e}")

class DatabaseCore:
    def __init__(self, db_path="arbitrage.db"):
        """Initializes SQLite with enterprise PRAGMA optimizations."""
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Creates tables and performs migrations if old schema exists."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA synchronous=NORMAL;")
                
                cursor = conn.cursor()
                
                # 1. TRADES TABLE MIGRATION/INIT
                cursor.execute("PRAGMA table_info(trades)")
                cols = [c[1] for c in cursor.fetchall()]
                
                if not cols:
                    conn.execute('''
                        CREATE TABLE trades (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                            username TEXT,
                            symbol TEXT DEFAULT 'BTC/USDT',
                            pair TEXT,
                            route TEXT,
                            profit REAL,
                            buy_exchange TEXT,
                            sell_exchange TEXT,
                            buy_price REAL,
                            sell_price REAL,
                            spread_pct REAL,
                            quantity REAL,
                            execution_mode TEXT DEFAULT 'LIVE',
                            status TEXT DEFAULT 'SUCCESS',
                            error_reason TEXT,
                            fee_pct REAL,
                            slippage_pct REAL
                        )
                    ''')
                else:
                    # Migrate 'time' -> 'timestamp' if old schema exists
                    if 'time' in cols and 'timestamp' not in cols:
                        conn.execute("ALTER TABLE trades RENAME COLUMN time TO timestamp")
                    # Ensure symbol exists
                    if 'symbol' not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN symbol TEXT DEFAULT 'BTC/USDT'")
                    if "username" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN username TEXT")
                    # Ensure route exists
                    if 'route' not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN route TEXT")
                    # Rename profit_usdt -> profit if it exists
                    if 'profit_usdt' in cols and 'profit' not in cols:
                        conn.execute("ALTER TABLE trades RENAME COLUMN profit_usdt TO profit")
                    if "buy_exchange" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN buy_exchange TEXT")
                    if "sell_exchange" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN sell_exchange TEXT")
                    if "buy_price" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN buy_price REAL")
                    if "sell_price" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN sell_price REAL")
                    if "spread_pct" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN spread_pct REAL")
                    if "pair" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN pair TEXT")
                    if "quantity" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN quantity REAL")
                    if "execution_mode" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN execution_mode TEXT DEFAULT 'LIVE'")
                    if "status" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN status TEXT DEFAULT 'SUCCESS'")
                    if "error_reason" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN error_reason TEXT")
                    if "fee_pct" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN fee_pct REAL")
                    if "slippage_pct" not in cols:
                        conn.execute("ALTER TABLE trades ADD COLUMN slippage_pct REAL")

                # 2. LLM Decisions
                conn.execute("CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_trades_username ON trades(username)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_trades_pair ON trades(pair)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status)")

                # 2. LLM Decisions
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS llm_decisions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        binance_price REAL,
                        bybit_price REAL,
                        spread REAL,
                        decision TEXT,
                        confidence INTEGER,
                        position_size REAL,
                        reasoning TEXT
                    )
                ''')

                # 3. Market Analysis
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS market_analysis (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        market_regime TEXT,
                        volatility_score REAL,
                        sentiment REAL,
                        support_level REAL,
                        resistance_level REAL
                    )
                ''')
            logger.info(f"Database {self.db_path} schema verified.")
        except Exception as e:
            logger.error(f"Migration/Init Error: {e}")

    def save_trade_record(
        self,
        route,
        profit,
        username=None,
        symbol="BTC/USDT",
        pair=None,
        buy_exchange=None,
        sell_exchange=None,
        buy_price=None,
        sell_price=None,
        spread_pct=None,
        quantity=None,
        execution_mode="LIVE",
        status="SUCCESS",
        error_reason=None,
        fee_pct=None,
        slippage_pct=None,
    ):
        """Saves a successful arbitrage trade."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                normalized_username = str(username).strip().lower() if username else None
                conn.execute('''
                    INSERT INTO trades
                    (timestamp, username, symbol, pair, route, profit, buy_exchange, sell_exchange, buy_price, sell_price, spread_pct, quantity, execution_mode, status, error_reason, fee_pct, slippage_pct)
                    VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    normalized_username,
                    symbol,
                    pair,
                    route,
                    profit,
                    buy_exchange,
                    sell_exchange,
                    buy_price,
                    sell_price,
                    spread_pct,
                    quantity,
                    execution_mode,
                    status,
                    error_reason,
                    fee_pct,
                    slippage_pct,
                ))
                if normalized_username:
                    conn.execute(
                        """
                        DELETE FROM trades
                        WHERE COALESCE(username, '') = ?
                          AND id NOT IN (
                              SELECT id
                              FROM trades
                              WHERE COALESCE(username, '') = ?
                              ORDER BY id DESC
                              LIMIT ?
                          )
                        """,
                        (normalized_username, normalized_username, MAX_TRADE_HISTORY_RECORDS),
                    )
        except Exception as e:
            logger.error(f"Failed to save trade: {e}")

    def _format_currency(self, amount):
        value = float(amount or 0.0)
        return f"{'+' if value >= 0 else '-'}${abs(value):.2f}"

    def _normalize_day_filter(self, day_of_week):
        if not day_of_week:
            return None
        normalized = str(day_of_week).strip().lower()
        day_map = {
            "sunday": "0",
            "monday": "1",
            "tuesday": "2",
            "wednesday": "3",
            "thursday": "4",
            "friday": "5",
            "saturday": "6",
        }
        return day_map.get(normalized)

    def get_trade_pairs(self, username=None):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                normalized_username = str(username or "").strip().lower()
                rows = conn.execute(
                    """
                    SELECT DISTINCT COALESCE(NULLIF(pair, ''), NULLIF(symbol, ''), 'BTC/USDT') AS pair_name
                    FROM trades
                    WHERE COALESCE(username, '') = ?
                      AND COALESCE(NULLIF(pair, ''), NULLIF(symbol, ''), '') <> ''
                    ORDER BY pair_name ASC
                    """,
                    (normalized_username,),
                ).fetchall()
                return [str(row["pair_name"]) for row in rows if row["pair_name"]]
        except Exception as e:
            logger.error(f"Failed to fetch trade pair options: {e}")
            return []

    def summarize_trade_history(self, history, filters=None):
        filters = filters or {}
        total_records = len(history)
        successful_trades = sum(1 for row in history if str(row.get("status") or "").upper() == "SUCCESSFUL")
        failed_trades = total_records - successful_trades
        success_rate = round((successful_trades / total_records) * 100.0, 2) if total_records else 0.0
        total_gross_profit = round(sum(float(row.get("gross_profit_value") or 0.0) for row in history), 2)
        total_fees = round(sum(float(row.get("fees_value") or 0.0) for row in history), 2)
        total_net_profit = round(sum(float(row.get("net_profit_value") or 0.0) for row in history), 2)

        pair_counts = {}
        route_counts = {}
        for row in history:
            pair_name = str(row.get("pair") or "BTC/USDT").strip()
            route_name = str(row.get("route") or "").strip()
            if pair_name:
                pair_counts[pair_name] = pair_counts.get(pair_name, 0) + 1
            if route_name:
                route_counts[route_name] = route_counts.get(route_name, 0) + 1

        top_pair = max(pair_counts, key=pair_counts.get) if pair_counts else "N/A"
        top_route = max(route_counts, key=route_counts.get) if route_counts else "N/A"

        applied_filters = {
            "date": str(filters.get("date") or ""),
            "day": str(filters.get("day") or "ALL"),
            "status": str(filters.get("status") or "ALL"),
            "pair": str(filters.get("pair") or "ALL"),
        }

        return {
            "total_records": total_records,
            "successful_trades": successful_trades,
            "failed_trades": failed_trades,
            "success_rate": success_rate,
            "total_gross_profit": total_gross_profit,
            "total_fees": total_fees,
            "total_net_profit": total_net_profit,
            "top_pair": top_pair,
            "top_route": top_route,
            "applied_filters": applied_filters,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

    def get_trade_history(self, limit=MAX_TRADE_HISTORY_RECORDS, username=None, trade_date=None, day_of_week=None, status_filter="ALL", pair=None):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                normalized_username = str(username or "").strip().lower()
                where_clauses = ["COALESCE(username, '') = ?"]
                params = [normalized_username]

                normalized_date = str(trade_date or "").strip()
                if normalized_date:
                    where_clauses.append("date(timestamp) = ?")
                    params.append(normalized_date)

                day_code = self._normalize_day_filter(day_of_week)
                if day_code is not None:
                    where_clauses.append("strftime('%w', timestamp) = ?")
                    params.append(day_code)

                normalized_pair = str(pair or "").strip()
                if normalized_pair and normalized_pair.upper() != "ALL":
                    where_clauses.append("COALESCE(NULLIF(pair, ''), NULLIF(symbol, ''), 'BTC/USDT') = ?")
                    params.append(normalized_pair)

                normalized_status = str(status_filter or "ALL").strip().upper()
                if normalized_status == "SUCCESSFUL":
                    where_clauses.append(
                        "(COALESCE(status, 'SUCCESS') = 'SUCCESS' AND COALESCE(profit, 0) > 0)"
                    )
                elif normalized_status == "FAILED":
                    where_clauses.append(
                        "("
                        "COALESCE(status, 'SUCCESS') NOT IN ('SUCCESS', 'BLOCKED') "
                        "OR (COALESCE(status, 'SUCCESS') = 'SUCCESS' AND COALESCE(profit, 0) <= 0)"
                        ")"
                    )
                elif normalized_status == "BLOCKED":
                    where_clauses.append("COALESCE(status, '') = 'BLOCKED'")

                where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
                rows = conn.execute(
                    f"""
                    SELECT
                        timestamp,
                        route,
                        COALESCE(profit, 0) AS net_profit,
                        symbol,
                        COALESCE(NULLIF(pair, ''), NULLIF(symbol, ''), 'BTC/USDT') AS pair,
                        buy_exchange,
                        sell_exchange,
                        buy_price,
                        sell_price,
                        COALESCE(spread_pct, 0) AS spread_pct,
                        quantity,
                        COALESCE(fee_pct, 0) AS fee_pct,
                        COALESCE(slippage_pct, 0) AS slippage_pct,
                        COALESCE(execution_mode, 'LIVE') AS execution_mode,
                        COALESCE(status, 'SUCCESS') AS status,
                        error_reason
                    FROM trades
                    {where_sql}
                    ORDER BY id DESC
                    LIMIT ?
                    """,
                    (*params, int(limit)),
                ).fetchall()

                history = []
                for row in rows:
                    timestamp_raw = str(row["timestamp"] or "").strip() or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    net_profit = round(float(row["net_profit"] or 0.0), 2)
                    buy_price = float(row["buy_price"] or 0.0)
                    quantity = float(row["quantity"] or 0.0)
                    fee_pct = float(row["fee_pct"] or 0.0)
                    slippage_pct = float(row["slippage_pct"] or 0.0)
                    raw_status = str(row["status"] or "SUCCESS").upper()
                    executed_trade = raw_status == "SUCCESS" or abs(net_profit) > 0
                    fees_value = 0.0
                    if executed_trade and buy_price > 0 and quantity > 0:
                        fees_value = round(((fee_pct + slippage_pct) / 100.0) * buy_price * quantity, 2)
                    gross_profit = round(net_profit + fees_value, 2) if executed_trade else 0.0
                    if raw_status == "BLOCKED":
                        display_status = "BLOCKED"
                    elif raw_status == "SUCCESS" and net_profit > 0:
                        display_status = "SUCCESSFUL"
                    else:
                        display_status = "FAILED"
                    history.append(
                        {
                            "timestamp": timestamp_raw,
                            "time": timestamp_raw,
                            "route": row["route"] or "UNKNOWN_ROUTE",
                            "profit": self._format_currency(net_profit),
                            "profit_value": net_profit,
                            "symbol": row["symbol"] or "BTC/USDT",
                            "pair": row["pair"] or row["symbol"] or "BTC/USDT",
                            "buy_exchange": row["buy_exchange"] or "-",
                            "sell_exchange": row["sell_exchange"] or "-",
                            "buy_price": round(float(row["buy_price"] or 0.0), 2),
                            "sell_price": round(float(row["sell_price"] or 0.0), 2),
                            "spread_pct": round(float(row["spread_pct"] or 0.0), 4),
                            "gross_profit": self._format_currency(gross_profit),
                            "gross_profit_value": gross_profit,
                            "fees": self._format_currency(-fees_value),
                            "fees_value": fees_value,
                            "net_profit": self._format_currency(net_profit),
                            "net_profit_value": net_profit,
                            "quantity": row["quantity"],
                            "mode": row["execution_mode"] or "LIVE",
                            "status": display_status,
                            "status_raw": raw_status,
                            "error": row["error_reason"],
                        }
                    )
                return history
        except Exception as e:
            logger.error(f"Failed to fetch trade history: {e}")
            return []

    def get_total_profit(self, username=None):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cols = {r[1] for r in conn.execute("PRAGMA table_info(trades)").fetchall()}
                normalized_username = str(username or "").strip().lower()
                if "status" in cols:
                    row = conn.execute(
                        """
                        SELECT COALESCE(SUM(profit), 0) AS total_profit
                        FROM trades
                        WHERE COALESCE(status, 'SUCCESS') = 'SUCCESS'
                          AND COALESCE(username, '') = ?
                        """,
                        (normalized_username,),
                    ).fetchone()
                else:
                    row = conn.execute(
                        "SELECT COALESCE(SUM(profit), 0) AS total_profit FROM trades WHERE COALESCE(username, '') = ?",
                        (normalized_username,),
                    ).fetchone()
                return float((row["total_profit"] if row else 0.0) or 0.0)
        except Exception as e:
            logger.error(f"Failed to calculate total profit: {e}")
            return 0.0

    def log_llm_decision(self, binance_price, bybit_price, spread, llm_output):
        """Saves the AI's exact reasoning for every trade."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    INSERT INTO llm_decisions 
                    (binance_price, bybit_price, spread, decision, confidence, position_size, reasoning)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    binance_price, bybit_price, spread,
                    llm_output.get("decision", "WAIT"),
                    llm_output.get("confidence", 0),
                    llm_output.get("position_size", 0.0),
                    llm_output.get("reasoning", "No reason provided")
                ))
        except Exception as e:
            logger.error(f"Failed to log LLM decision: {e}")

    def cache_market_analysis(self, analysis_data):
        """Saves market conditions for frontend display and caching."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    INSERT INTO market_analysis 
                    (market_regime, volatility_score, sentiment, support_level, resistance_level)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    analysis_data.get("regime", "UNKNOWN"),
                    float(analysis_data.get("volatility", 5.0)),
                    float(analysis_data.get("sentiment", 0.0)),
                    float(analysis_data.get("support", 0.0)),
                    float(analysis_data.get("resistance", 0.0))
                ))
        except Exception as e:
            logger.error(f"Failed to cache market analysis: {e}")
