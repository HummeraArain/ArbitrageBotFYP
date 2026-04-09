import sqlite3
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

def save_trade(
    route,
    profit,
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
                conn.execute('''
                    INSERT INTO trades
                    (timestamp, symbol, pair, route, profit, buy_exchange, sell_exchange, buy_price, sell_price, spread_pct, quantity, execution_mode, status, error_reason, fee_pct, slippage_pct)
                    VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
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
        except Exception as e:
            logger.error(f"Failed to save trade: {e}")

    def get_trade_history(self, limit=100):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    """
                    SELECT
                        strftime('%H:%M:%S', timestamp) AS time,
                        route,
                        profit,
                        symbol,
                        COALESCE(pair, symbol, 'BTC/USDT') AS pair,
                        buy_exchange,
                        sell_exchange,
                        quantity,
                        COALESCE(execution_mode, 'LIVE') AS execution_mode,
                        COALESCE(status, 'SUCCESS') AS status,
                        error_reason
                    FROM trades
                    ORDER BY id DESC
                    LIMIT ?
                    """,
                    (int(limit),),
                ).fetchall()

                history = []
                for row in rows:
                    profit_val = float(row["profit"] or 0.0)
                    profit_text = f"+${profit_val:.2f}" if profit_val >= 0 else f"-${abs(profit_val):.2f}"
                    history.append(
                        {
                            "time": row["time"] or datetime.now().strftime("%H:%M:%S"),
                            "route": row["route"] or "UNKNOWN_ROUTE",
                            "profit": profit_text,
                            "profit_value": profit_val,
                            "symbol": row["symbol"] or "BTC/USDT",
                            "pair": row["pair"] or row["symbol"] or "BTC/USDT",
                            "buy_exchange": row["buy_exchange"],
                            "sell_exchange": row["sell_exchange"],
                            "quantity": row["quantity"],
                            "mode": row["execution_mode"] or "LIVE",
                            "status": row["status"] or "SUCCESS",
                            "error": row["error_reason"],
                        }
                    )
                return history
        except Exception as e:
            logger.error(f"Failed to fetch trade history: {e}")
            return []

    def get_total_profit(self):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cols = {r[1] for r in conn.execute("PRAGMA table_info(trades)").fetchall()}
                if "status" in cols:
                    row = conn.execute(
                        """
                        SELECT COALESCE(SUM(profit), 0) AS total_profit
                        FROM trades
                        WHERE COALESCE(status, 'SUCCESS') = 'SUCCESS'
                        """
                    ).fetchone()
                else:
                    row = conn.execute("SELECT COALESCE(SUM(profit), 0) AS total_profit FROM trades").fetchone()
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
