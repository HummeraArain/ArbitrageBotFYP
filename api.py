import asyncio
import os
import sqlite3
import secrets
import logging
import time
import math
import re
from urllib.parse import parse_qs
from datetime import datetime
from contextlib import asynccontextmanager
from itertools import combinations

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
import bcrypt as bcrypt_lib

from predictor import Predictor
from llm.ai_agent import AIAgent
from llm.chatbot import ChatBot
from llm.market_analyst import MarketAnalyst
from llm.strategy_advisor import StrategyAdvisor
from execution.trader import TradeExecutor
from core.database import DatabaseCore, save_trade
from core.risk_engine import RiskEngine
from core.online_trainer import retrain_gru_from_db

# 0. CONFIGURATION & LOGGING
load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def _as_bool(value: str | None, default: bool = True) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


EXCHANGE_TESTNET = _as_bool(os.getenv("EXCHANGE_TESTNET"), default=True)


def _pick_env(primary: str, secondary: str) -> str:
    return (os.getenv(primary) or os.getenv(secondary) or "").strip()


OPENAI_CHAT_KEY = _pick_env("OPENAI_API_KEY", "OPEN_AI_API_KEY")


SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_secret_key_change_in_production")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")

TRADES_DB = "arbitrage.db"
VAULT_DB = "operator_vault.db"

# 1. GLOBAL STATE
bot_active = False
bot_operator = None
current_threshold = 0.08
spread_buffer = []
trade_history = []
total_profit = 0.0
current_market_state = {}
active_connections = {}
EXCHANGE_KEYS = ("binance", "bybit", "coinbase")
last_known_balances = {k: None for k in EXCHANGE_KEYS}
last_known_btc_balances = {k: None for k in EXCHANGE_KEYS}
last_known_prices = {k: None for k in EXCHANGE_KEYS}
last_known_symbols = {k: None for k in EXCHANGE_KEYS}

# Manual approval state
pending_trade = None
pending_approved = None
_approval_event = asyncio.Event()

# Trading constants
FEE_RATE = float((os.getenv("TRADING_FEE_RATE") or "0.001").strip())
SLIPPAGE_RATE = float((os.getenv("TRADING_SLIPPAGE_RATE") or "0.0003").strip())

# Auto-training constants/state
AUTO_TRAIN_EVERY_TRADES = 5
AUTO_TRAIN_MIN_INTERVAL_SEC = 300
_train_lock = asyncio.Lock()
_trades_since_train = 0
_last_train_ts = 0.0
_last_gate_block_msg_ts = 0.0
_last_no_trade_feedback_ts = 0.0
_last_blocked_trade_sig = ""
_last_blocked_trade_ts = 0.0

# Execution control
AUTO_EXECUTION = _as_bool(os.getenv("AUTO_EXECUTION"), default=True)
MANUAL_APPROVAL_TIMEOUT_SEC = float((os.getenv("MANUAL_APPROVAL_TIMEOUT_SEC") or "30").strip())
MIN_LIVE_EXCHANGES = max(2, int((os.getenv("MIN_LIVE_EXCHANGES") or "2").strip()))
MAX_EXECUTION_SIZE = float((os.getenv("MAX_EXECUTION_SIZE") or "1.0").strip())
ROUTE_FAIL_COOLDOWN_SEC = float((os.getenv("ROUTE_FAIL_COOLDOWN_SEC") or "60").strip())
MAX_ROUTE_STREAK = max(1, int((os.getenv("MAX_ROUTE_STREAK") or "4").strip()))
DIVERSIFY_MIN_SPREAD_RATIO = float((os.getenv("DIVERSIFY_MIN_SPREAD_RATIO") or "0.85").strip())
REQUIRE_POSITIVE_NET = _as_bool(os.getenv("REQUIRE_POSITIVE_NET"), default=False)
MIN_NET_SPREAD = float((os.getenv("MIN_NET_SPREAD") or "0.0").strip())
NO_TRADE_FEEDBACK_INTERVAL_SEC = float((os.getenv("NO_TRADE_FEEDBACK_INTERVAL_SEC") or "15").strip())
SELL_INVENTORY_BLOCK_SEC = float((os.getenv("SELL_INVENTORY_BLOCK_SEC") or "300").strip())
ENGINE_LOOP_INTERVAL_SEC = max(0.5, float((os.getenv("ENGINE_LOOP_INTERVAL_SEC") or "1.0").strip()))
ALLOW_NEGATIVE_EST_PROFIT = _as_bool(os.getenv("ALLOW_NEGATIVE_EST_PROFIT"), default=False)
PROFIT_ONLY_EXECUTION = _as_bool(os.getenv("PROFIT_ONLY_EXECUTION"), default=True)
MIN_EST_PROFIT_USD = max(0.0, float((os.getenv("MIN_EST_PROFIT_USD") or "0.0").strip()))
ENFORCE_AI_SPREAD_GATE = _as_bool(os.getenv("ENFORCE_AI_SPREAD_GATE"), default=False)

# 2. SHARED INSTANCES
db_core = DatabaseCore(db_path=TRADES_DB)
ai_brain = Predictor()
ai_brain.load(model_path="gru_model.pth", scaler_path="scaler_params.npy")
ai_agent = AIAgent(api_key=os.getenv("GEMINI_API_KEY"), groq_api_key=os.getenv("GROQ_API_KEY"))
chatbot = ChatBot(api_key=OPENAI_CHAT_KEY, db_path=TRADES_DB)
market_analyst = MarketAnalyst(api_key=os.getenv("GEMINI_API_KEY"))
strategy_advisor = StrategyAdvisor(db_path=TRADES_DB, api_key=os.getenv("GEMINI_API_KEY"))
risk_engine = RiskEngine(db_path=TRADES_DB)

binance_api_key = _pick_env(
    "BINANCE_TESTNET_API_KEY" if EXCHANGE_TESTNET else "BINANCE_API_KEY",
    "BINANCE_API_KEY" if EXCHANGE_TESTNET else "BINANCE_TESTNET_API_KEY",
)
binance_secret = _pick_env(
    "BINANCE_TESTNET_SECRET" if EXCHANGE_TESTNET else "BINANCE_SECRET",
    "BINANCE_SECRET" if EXCHANGE_TESTNET else "BINANCE_TESTNET_SECRET",
)
bybit_api_key = _pick_env(
    "BYBIT_TESTNET_API_KEY" if EXCHANGE_TESTNET else "BYBIT_API_KEY",
    "BYBIT_API_KEY" if EXCHANGE_TESTNET else "BYBIT_TESTNET_API_KEY",
)
bybit_secret = _pick_env(
    "BYBIT_TESTNET_SECRET" if EXCHANGE_TESTNET else "BYBIT_SECRET",
    "BYBIT_SECRET" if EXCHANGE_TESTNET else "BYBIT_TESTNET_SECRET",
)
coinbase_api_key = _pick_env(
    "COINBASE_TESTNET_API_KEY" if EXCHANGE_TESTNET else "COINBASE_API_KEY",
    "COINBASE_API_KEY" if EXCHANGE_TESTNET else "COINBASE_TESTNET_API_KEY",
)
coinbase_secret = _pick_env(
    "COINBASE_TESTNET_SECRET" if EXCHANGE_TESTNET else "COINBASE_SECRET",
    "COINBASE_SECRET" if EXCHANGE_TESTNET else "COINBASE_TESTNET_SECRET",
)
coinbase_passphrase = _pick_env(
    "COINBASE_TESTNET_PASSPHRASE" if EXCHANGE_TESTNET else "COINBASE_PASSPHRASE",
    "COINBASE_PASSPHRASE" if EXCHANGE_TESTNET else "COINBASE_TESTNET_PASSPHRASE",
)

logger.info(
    f"Exchange mode: {'TESTNET' if EXCHANGE_TESTNET else 'LIVE'} | "
    f"Binance key loaded: {'yes' if bool(binance_api_key) else 'no'} | "
    f"Bybit key loaded: {'yes' if bool(bybit_api_key) else 'no'} | "
    f"Bybit hostname: {(os.getenv('BYBIT_HOSTNAME') or 'bybit.com').strip()} | "
    f"Bybit proxy: {'configured' if bool((os.getenv('BYBIT_PROXY_URL') or os.getenv('HTTPS_PROXY') or os.getenv('HTTP_PROXY') or '').strip()) else 'none'} | "
    f"Coinbase key loaded: {'yes' if bool(coinbase_api_key) else 'no'} | "
    f"OpenAI chat key loaded: {'yes' if bool(OPENAI_CHAT_KEY) else 'no'} | "
    f"Coinbase paper mode: {'enabled' if _as_bool(os.getenv('COINBASE_PAPER_MODE'), False) else 'disabled'} | "
    f"Auto execution: {'enabled' if AUTO_EXECUTION else 'disabled'} | "
    f"AI spread gate: {'strict' if ENFORCE_AI_SPREAD_GATE else 'advisory'}"
)

trader = TradeExecutor(
    binance_api=binance_api_key,
    binance_secret=binance_secret,
    bybit_api=bybit_api_key,
    bybit_secret=bybit_secret,
    coinbase_api=coinbase_api_key,
    coinbase_secret=coinbase_secret,
    coinbase_passphrase=coinbase_passphrase,
    testnet=EXCHANGE_TESTNET,
)


# 3. HELPER FUNCTIONS
async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(401, "Invalid token")
        return username
    except JWTError:
        raise HTTPException(401, "Could not validate credentials")


def init_vault_db():
    try:
        with sqlite3.connect(VAULT_DB) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
    except Exception as e:
        logger.error(f"Failed to initialize vault DB: {e}")


def _issue_access_token(username: str) -> str:
    return jwt.encode({"sub": username}, SECRET_KEY, ALGORITHM)


def _normalize_username(username: str | None) -> str:
    return str(username or "").strip().lower()


def _estimate_net_profit_usd(net_spread_pct: float, buy_price: float, quantity: float) -> float:
    try:
        spread_f = float(net_spread_pct or 0.0)
        buy_f = float(buy_price or 0.0)
        qty_f = float(quantity or 0.0)
        if buy_f <= 0 or qty_f <= 0:
            return 0.0
        return round((spread_f / 100.0) * buy_f * qty_f, 2)
    except Exception:
        return 0.0


def _verify_credentials(username: str, password: str) -> bool:
    conn = sqlite3.connect(VAULT_DB)
    conn.row_factory = sqlite3.Row
    try:
        res = conn.execute("SELECT password_hash FROM users WHERE username = ?", (username,)).fetchone()
        if not res:
            return False
        stored_hash = str(res["password_hash"] or "")

        # Backward compatibility for legacy bcrypt rows.
        if stored_hash.startswith("$2"):
            try:
                ok = bcrypt_lib.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
                if ok:
                    upgraded = pwd_context.hash(password)
                    conn.execute("UPDATE users SET password_hash = ? WHERE username = ?", (upgraded, username))
                    conn.commit()
                return ok
            except Exception as verify_err:
                logger.error(f"Legacy bcrypt verification failed for '{username}': {verify_err}")
                return False

        try:
            return bool(pwd_context.verify(password, stored_hash))
        except Exception as verify_err:
            logger.error(f"Password verification failed for '{username}': {verify_err}")
            return False
    finally:
        conn.close()


def load_initial_state():
    global trade_history, total_profit
    try:
        trade_history = db_core.get_trade_history(limit=500)
        total_profit = db_core.get_total_profit()
    except Exception as e:
        logger.error(f"Failed to load initial state: {e}")


def _init_runtime_state():
    try:
        with sqlite3.connect(TRADES_DB) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS runtime_state (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                INSERT OR IGNORE INTO runtime_state (key, value) VALUES
                ('bot_active', '0'),
                ('current_threshold', '0.08'),
                ('bot_operator', '')
                """
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to initialize runtime state: {e}")


def _save_runtime_state(key: str, value: str):
    try:
        with sqlite3.connect(TRADES_DB) as conn:
            conn.execute(
                """
                INSERT INTO runtime_state (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (str(key), str(value)),
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to save runtime state ({key}): {e}")


def _load_runtime_state():
    global bot_active, bot_operator, current_threshold
    try:
        with sqlite3.connect(TRADES_DB) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT key, value FROM runtime_state").fetchall()
            lookup = {str(r["key"]): str(r["value"]) for r in rows}

        bot_active = _as_bool(lookup.get("bot_active"), default=False)
        bot_operator = _normalize_username(lookup.get("bot_operator"))
        try:
            current_threshold = float(lookup.get("current_threshold", str(current_threshold)))
        except Exception:
            pass
        if bot_active and not bot_operator:
            bot_active = False
            _save_runtime_state("bot_active", "0")
            logger.warning("Runtime state requested active bot without an owner; bot was reset to inactive.")
    except Exception as e:
        logger.error(f"Failed to load runtime state: {e}")


async def broadcast_state(data, username: str | None = None):
    if not active_connections:
        return
    target_user = _normalize_username(username)
    disconnected = []
    for ws, connected_user in list(active_connections.items()):
        if target_user and connected_user != target_user:
            continue
        try:
            await ws.send_json(data)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        active_connections.pop(ws, None)


async def maybe_auto_train():
    global _trades_since_train, _last_train_ts

    if _trades_since_train < AUTO_TRAIN_EVERY_TRADES:
        return
    if (time.time() - _last_train_ts) < AUTO_TRAIN_MIN_INTERVAL_SEC:
        return
    if _train_lock.locked():
        return

    async with _train_lock:
        try:
            trained, details = await asyncio.to_thread(
                retrain_gru_from_db,
                db_path=TRADES_DB,
                model_path="gru_model.pth",
                scaler_path="scaler_params.npy",
                sequence_length=10,
                min_points=80,
                epochs=2,
                batch_size=32,
            )
            if trained:
                ai_brain.load(model_path="gru_model.pth", scaler_path="scaler_params.npy")
                _trades_since_train = 0
                _last_train_ts = time.time()
                logger.info(f"Auto-training completed: {details}")
                await broadcast_state(
                    {"type": "ai_msg", "text": "Model auto-training completed from recent trade data."},
                    username=bot_operator,
                )
            else:
                logger.info(f"Auto-training skipped: {details}")
        except Exception as e:
            logger.error(f"Auto-training failed: {e}")


# 4. BACKGROUND ENGINE LOOP
async def continuous_arbitrage_loop():
    global bot_active, current_threshold, spread_buffer, trade_history, total_profit, current_market_state
    global pending_trade, pending_approved, _approval_event, _trades_since_train
    global last_known_balances, last_known_btc_balances, last_known_prices, last_known_symbols
    global _last_gate_block_msg_ts, _last_no_trade_feedback_ts, _last_blocked_trade_sig, _last_blocked_trade_ts

    def _build_pair_rows(price_map: dict, candidate_keys: list[str]):
        rows = []
        for ex_a, ex_b in combinations(candidate_keys, 2):
            p_a = float(price_map.get(ex_a) or 0.0)
            p_b = float(price_map.get(ex_b) or 0.0)
            if p_a <= 0 or p_b <= 0:
                continue

            if p_a <= p_b:
                buy_ex, sell_ex = ex_a, ex_b
                buy_price, sell_price = p_a, p_b
            else:
                buy_ex, sell_ex = ex_b, ex_a
                buy_price, sell_price = p_b, p_a

            spread = ((sell_price - buy_price) / buy_price) * 100
            signed_spread = ((p_b - p_a) / p_a) * 100
            rows.append(
                {
                    "pair": f"{ex_a.upper()}-{ex_b.upper()}",
                    "exchange_a": ex_a.upper(),
                    "exchange_b": ex_b.upper(),
                    "buy_exchange_key": buy_ex,
                    "sell_exchange_key": sell_ex,
                    "buy_exchange": buy_ex.upper(),
                    "sell_exchange": sell_ex.upper(),
                    "buy_price": buy_price,
                    "sell_price": sell_price,
                    "spread": spread,
                    "signed_spread": signed_spread,
                }
            )
        return rows

    logger.info("Background Arbitrage Engine is IDLING. waiting for operator...")
    route_fail_until = {}
    sell_inventory_block_until = {}
    last_executed_route_key = None
    same_route_streak = 0

    while True:
        try:
            current_bot_user = _normalize_username(bot_operator)
            # A. Fetch market prices with status per exchange
            prices = {k: 0.0 for k in EXCHANGE_KEYS}
            price_statuses = {k: "OFFLINE" for k in EXCHANGE_KEYS}
            price_errors = {k: None for k in EXCHANGE_KEYS}
            price_symbols = {k: None for k in EXCHANGE_KEYS}
            try:
                price_snapshot = await trader.fetch_prices_with_status()
            except Exception as e:
                logger.warning(f"Price refresh warning: {e}")
                price_snapshot = {}

            for ex in EXCHANGE_KEYS:
                payload = price_snapshot.get(ex, {})
                if payload.get("ok"):
                    px = float(payload.get("price") or 0.0)
                    used_symbol = payload.get("symbol")
                    prices[ex] = px
                    price_statuses[ex] = "LIVE"
                    price_symbols[ex] = used_symbol
                    last_known_prices[ex] = px
                    if used_symbol:
                        last_known_symbols[ex] = used_symbol
                else:
                    price_errors[ex] = payload.get("error")
                    err_text = str(payload.get("error") or "")
                    is_outlier = "OUTLIER:" in err_text
                    if is_outlier:
                        # Never reuse poisoned stale price if source was flagged as outlier.
                        last_known_prices[ex] = None
                        last_known_symbols[ex] = None
                    elif last_known_prices[ex] is not None:
                        prices[ex] = float(last_known_prices[ex])
                        price_statuses[ex] = "STALE"
                        price_symbols[ex] = last_known_symbols[ex]

            # B. Fetch wallet balances with explicit status
            balances = {k: 0.0 for k in EXCHANGE_KEYS}
            balance_statuses = {k: "OFFLINE" for k in EXCHANGE_KEYS}
            balance_errors = {k: None for k in EXCHANGE_KEYS}
            balance_warnings = {k: None for k in EXCHANGE_KEYS}
            balance_assets = {k: "USDT" for k in EXCHANGE_KEYS}
            try:
                balance_snapshot = await trader.fetch_usdt_balances_with_status()
            except Exception as e:
                logger.warning(f"Balance refresh warning: {e}")
                balance_snapshot = {}

            for ex in EXCHANGE_KEYS:
                payload = balance_snapshot.get(ex, {})
                if payload.get("ok"):
                    bal = float(payload.get("balance") or 0.0)
                    balances[ex] = bal
                    balance_statuses[ex] = "LIVE"
                    balance_warnings[ex] = payload.get("warning")
                    balance_assets[ex] = str(payload.get("asset") or "USDT")
                    last_known_balances[ex] = bal
                else:
                    balance_errors[ex] = payload.get("error")
                    if last_known_balances[ex] is not None:
                        balances[ex] = float(last_known_balances[ex])
                        balance_statuses[ex] = "STALE"

            btc_balances = {k: 0.0 for k in EXCHANGE_KEYS}
            btc_statuses = {k: "OFFLINE" for k in EXCHANGE_KEYS}
            btc_errors = {k: None for k in EXCHANGE_KEYS}
            try:
                btc_snapshot = await trader.fetch_btc_balances_with_status()
            except Exception as e:
                logger.warning(f"BTC balance refresh warning: {e}")
                btc_snapshot = {}

            for ex in EXCHANGE_KEYS:
                payload = btc_snapshot.get(ex, {})
                if payload.get("ok"):
                    btc = float(payload.get("balance") or 0.0)
                    btc_balances[ex] = btc
                    btc_statuses[ex] = "LIVE"
                    last_known_btc_balances[ex] = btc
                else:
                    btc_errors[ex] = payload.get("error")
                    if last_known_btc_balances[ex] is not None:
                        btc_balances[ex] = float(last_known_btc_balances[ex])
                        btc_statuses[ex] = "STALE"

            # C. Build all arbitrage pairs and select best route
            display_candidates = [
                ex for ex in EXCHANGE_KEYS if prices[ex] > 0 and price_statuses[ex] in {"LIVE", "STALE"}
            ]
            tradeable_candidates = [ex for ex in EXCHANGE_KEYS if prices[ex] > 0 and price_statuses[ex] == "LIVE"]

            pair_spreads_display = _build_pair_rows(prices, display_candidates)
            pair_spreads_tradeable = _build_pair_rows(prices, tradeable_candidates)

            best_pair_display = max(pair_spreads_display, key=lambda r: r["spread"]) if pair_spreads_display else None
            now_ts = time.time()

            def _route_key(row):
                return f"{row['buy_exchange_key']}->{row['sell_exchange_key']}"

            pair_spreads_tradeable_sorted = sorted(
                pair_spreads_tradeable,
                key=lambda r: float(r.get("spread") or 0.0),
                reverse=True,
            )
            total_tradeable_rows = len(pair_spreads_tradeable_sorted)
            cooldown_filtered = 0
            sell_inventory_filtered = 0
            eligible_trade_rows = []
            for row in pair_spreads_tradeable_sorted:
                if float(route_fail_until.get(_route_key(row), 0.0)) > now_ts:
                    cooldown_filtered += 1
                    continue
                sell_key = str(row.get("sell_exchange_key") or "").lower()
                if float(sell_inventory_block_until.get(sell_key, 0.0)) > now_ts:
                    sell_inventory_filtered += 1
                    continue
                eligible_trade_rows.append(row)

            all_routes_in_cooldown = bool(total_tradeable_rows) and cooldown_filtered == total_tradeable_rows
            all_routes_sell_inventory_blocked = bool(total_tradeable_rows) and sell_inventory_filtered == total_tradeable_rows

            best_pair_tradeable = eligible_trade_rows[0] if eligible_trade_rows else None
            if (
                best_pair_tradeable
                and last_executed_route_key
                and same_route_streak >= MAX_ROUTE_STREAK
                and len(eligible_trade_rows) > 1
            ):
                top_spread = float(best_pair_tradeable.get("spread") or 0.0)
                alt = None
                min_alt_spread = max(current_threshold, top_spread * DIVERSIFY_MIN_SPREAD_RATIO)
                for row in eligible_trade_rows:
                    if _route_key(row) == last_executed_route_key:
                        continue
                    spread_val = float(row.get("spread") or 0.0)
                    if spread_val >= min_alt_spread:
                        alt = row
                        break
                if alt is None:
                    for row in eligible_trade_rows:
                        if _route_key(row) == last_executed_route_key:
                            continue
                        spread_val = float(row.get("spread") or 0.0)
                        if spread_val >= current_threshold:
                            alt = row
                            break
                if alt is not None:
                    best_pair_tradeable = alt

            spread_display = float(best_pair_display["spread"]) if best_pair_display else 0.0
            signed_spread_display = float(best_pair_display["signed_spread"]) if best_pair_display else 0.0
            tradeable_spread = float(best_pair_tradeable["spread"]) if best_pair_tradeable else 0.0

            total_costs = (FEE_RATE + SLIPPAGE_RATE) * 100
            net_spread = tradeable_spread - total_costs

            spread_buffer.append(tradeable_spread)
            if len(spread_buffer) > 10:
                spread_buffer.pop(0)
            ai_pred = None
            ai_pred_valid = False
            ai_pred_error = None
            if len(spread_buffer) == 10:
                try:
                    raw_pred = ai_brain.predict(spread_buffer)
                    pred_val = float(raw_pred)
                    if math.isfinite(pred_val):
                        ai_pred = pred_val
                        ai_pred_valid = True
                    else:
                        ai_pred_error = "non-finite predictor value"
                except Exception as e:
                    ai_pred_error = str(e)

            ai_gate_pass = True
            if ENFORCE_AI_SPREAD_GATE and ai_pred_valid and ai_pred is not None:
                ai_gate_pass = abs(ai_pred) >= current_threshold

            live_count = len(tradeable_candidates)
            degraded_mode = live_count < MIN_LIVE_EXCHANGES

            buy_exchange_key = None
            sell_exchange_key = None
            buy_price = 0.0
            sell_price = 0.0
            buy_symbol = None
            sell_symbol = None
            route = "NO_ROUTE"

            if best_pair_tradeable:
                buy_exchange_key = best_pair_tradeable["buy_exchange_key"]
                sell_exchange_key = best_pair_tradeable["sell_exchange_key"]
                buy_price = float(best_pair_tradeable["buy_price"])
                sell_price = float(best_pair_tradeable["sell_price"])
                buy_symbol = price_symbols.get(buy_exchange_key)
                sell_symbol = price_symbols.get(sell_exchange_key)
                route = f"{buy_exchange_key.upper()} -> {sell_exchange_key.upper()}"

            # D. Execution Logic
            spread_gate_pass = tradeable_spread >= current_threshold
            net_gate_pass = True
            if REQUIRE_POSITIVE_NET:
                net_gate_pass = net_spread >= MIN_NET_SPREAD
            breaker_status = {"halted": False, "reason": "System Healthy"}
            if bot_active:
                breaker_status = risk_engine.check_circuit_breaker()
            risk_gate_pass = not bool(breaker_status.get("halted"))

            opportunity = bool(best_pair_tradeable) and spread_gate_pass and net_gate_pass and ai_gate_pass and risk_gate_pass
            opportunity_block_reason = None
            if not best_pair_tradeable:
                if all_routes_sell_inventory_blocked:
                    opportunity_block_reason = "SELL_SIDE_INVENTORY_UNAVAILABLE"
                else:
                    opportunity_block_reason = "ROUTES_IN_COOLDOWN" if all_routes_in_cooldown else "NO_LIVE_ROUTE"
            elif not spread_gate_pass:
                opportunity_block_reason = "SPREAD_BELOW_THRESHOLD"
            elif not net_gate_pass:
                opportunity_block_reason = "NET_SPREAD_BELOW_MIN"
            elif not ai_gate_pass:
                opportunity_block_reason = "AI_PREDICTION_BELOW_THRESHOLD"
            elif not risk_gate_pass:
                opportunity_block_reason = "RISK_BREAKER_ACTIVE"

            if (
                bot_active
                and best_pair_tradeable
                and spread_gate_pass
                and net_gate_pass
                and not ai_gate_pass
                and ai_pred_valid
            ):
                now_ts = time.time()
                if (now_ts - _last_gate_block_msg_ts) >= 15:
                    _last_gate_block_msg_ts = now_ts
                    await broadcast_state(
                        {
                            "type": "ai_msg",
                            "text": (
                                f"Trade blocked by AI prediction gate. spread={tradeable_spread:.4f}% "
                                f"prediction={float(ai_pred):.4f}% threshold={current_threshold:.4f}%"
                            ),
                        },
                        username=current_bot_user,
                    )

            if bot_active and not opportunity:
                now_ts = time.time()
                if (now_ts - _last_no_trade_feedback_ts) >= NO_TRADE_FEEDBACK_INTERVAL_SEC:
                    _last_no_trade_feedback_ts = now_ts
                    feedback_text = None
                    if opportunity_block_reason == "NO_LIVE_ROUTE":
                        feedback_text = (
                            "Trade Status: BLOCKED\n"
                            f"- Reason: No live route\n"
                            f"- Live exchanges: {live_count}/{len(EXCHANGE_KEYS)}"
                        )
                    elif opportunity_block_reason == "ROUTES_IN_COOLDOWN":
                        feedback_text = (
                            "Trade Status: BLOCKED\n"
                            "- Reason: Route cooldown active after recent failed executions."
                        )
                    elif opportunity_block_reason == "SELL_SIDE_INVENTORY_UNAVAILABLE":
                        feedback_text = (
                            "Trade Status: BLOCKED\n"
                            "- Reason: Sell-side BTC inventory unavailable.\n"
                            "- Action: Fund BTC on target sell exchange."
                        )
                    elif opportunity_block_reason == "SPREAD_BELOW_THRESHOLD":
                        feedback_text = (
                            "Trade Status: BLOCKED\n"
                            "- Reason: Spread below threshold\n"
                            f"- Gross spread: {tradeable_spread:.4f}%\n"
                            f"- Threshold: {current_threshold:.4f}%"
                        )
                    elif opportunity_block_reason == "NET_SPREAD_BELOW_MIN":
                        feedback_text = (
                            "Trade Status: BLOCKED\n"
                            "- Reason: Net spread guard\n"
                            f"- Gross spread: {tradeable_spread:.4f}%\n"
                            f"- Estimated costs: {total_costs:.4f}%\n"
                            f"- Net spread: {net_spread:.4f}%\n"
                            f"- Minimum net: {MIN_NET_SPREAD:.4f}%"
                        )
                    elif opportunity_block_reason == "AI_PREDICTION_BELOW_THRESHOLD" and ai_pred_valid:
                        feedback_text = (
                            "Trade Status: BLOCKED\n"
                            "- Reason: AI prediction gate\n"
                            f"- Prediction: {float(ai_pred):.4f}%\n"
                            f"- Threshold: {current_threshold:.4f}%"
                        )
                    elif opportunity_block_reason == "RISK_BREAKER_ACTIVE":
                        feedback_text = (
                            "Trade Status: BLOCKED\n"
                            f"- Reason: Risk breaker\n"
                            f"- Detail: {breaker_status.get('reason', 'unknown')}"
                        )
                    if feedback_text:
                        await broadcast_state({"type": "ai_msg", "text": feedback_text}, username=current_bot_user)
                        if current_bot_user:
                            blocked_pair = (
                                (buy_symbol or "BTC/USDT")
                                if buy_symbol == sell_symbol
                                else f"{buy_symbol or 'BTC/USDT'} -> {sell_symbol or 'BTC/USDT'}"
                            )
                            blocked_reason = feedback_text.replace("Trade Status: BLOCKED\n", "").strip().replace("\n", " | ")
                            blocked_signature = "|".join(
                                [
                                    current_bot_user,
                                    str(opportunity_block_reason or "UNKNOWN"),
                                    str(route or "NO_ROUTE"),
                                    str(blocked_pair),
                                ]
                            )
                            if (
                                blocked_signature != _last_blocked_trade_sig
                                or (now_ts - _last_blocked_trade_ts) >= max(60.0, NO_TRADE_FEEDBACK_INTERVAL_SEC * 4)
                            ):
                                blocked_rec = {
                                    "time": datetime.now().strftime("%H:%M:%S"),
                                    "route": route,
                                    "pair": blocked_pair,
                                    "mode": "LIVE",
                                    "status": "BLOCKED",
                                    "profit": "$0.00",
                                    "net_profit": "$0.00",
                                    "error": blocked_reason,
                                }
                                save_trade(
                                    route=route,
                                    profit=0.0,
                                    username=current_bot_user,
                                    symbol=buy_symbol or sell_symbol or "BTC/USDT",
                                    pair=blocked_pair,
                                    buy_exchange=buy_exchange_key.upper() if buy_exchange_key else None,
                                    sell_exchange=sell_exchange_key.upper() if sell_exchange_key else None,
                                    buy_price=buy_price,
                                    sell_price=sell_price,
                                    spread_pct=tradeable_spread,
                                    quantity=0.0,
                                    execution_mode="LIVE",
                                    status="BLOCKED",
                                    error_reason=blocked_reason,
                                    fee_pct=0.0,
                                    slippage_pct=0.0,
                                )
                                trade_history.insert(0, blocked_rec)
                                _last_blocked_trade_sig = blocked_signature
                                _last_blocked_trade_ts = now_ts
                                await broadcast_state(
                                    {"type": "trade_blocked", "trade": blocked_rec, "error": blocked_reason},
                                    username=current_bot_user,
                                )

            if bot_active and opportunity:
                await broadcast_state(
                    {"type": "ai_msg", "text": f"Opportunity detected on route {route}. Consulting AI Agent..."},
                    username=current_bot_user,
                )
                try:
                    ai_analysis = await ai_agent.analyze_opportunity(buy_price, sell_price, tradeable_spread)
                    db_core.log_llm_decision(buy_price, sell_price, tradeable_spread, ai_analysis)

                    decision = ai_analysis.get("decision", "REJECT")
                    conf = ai_analysis.get("confidence", 0)
                    reason = ai_analysis.get("reasoning", "No context provided.")
                    await broadcast_state(
                        {"type": "ai_msg", "text": f"AI Analysis ({conf}% conf): {decision}. Rationale: {reason}"},
                        username=current_bot_user,
                    )

                    risk = risk_engine.validate_and_size_trade(decision, conf)
                    if not risk["approved"]:
                        await broadcast_state({"type": "ai_msg", "text": f"RISK VETO: {risk['reason']}"}, username=current_bot_user)
                    elif decision == "EXECUTE":
                        raw_size = float(risk.get("size") or 0.0)
                        trade_size = min(raw_size, MAX_EXECUTION_SIZE)
                        if trade_size <= 0:
                            await broadcast_state(
                                {"type": "ai_msg", "text": "Risk sizing produced non-positive trade size. Skipping."},
                                username=current_bot_user,
                            )
                            continue

                        est_profit = _estimate_net_profit_usd(
                            net_spread_pct=net_spread,
                            buy_price=buy_price,
                            quantity=trade_size,
                        )
                        profit_gate_pass = est_profit > 0
                        if MIN_EST_PROFIT_USD > 0:
                            profit_gate_pass = profit_gate_pass and est_profit >= MIN_EST_PROFIT_USD

                        if PROFIT_ONLY_EXECUTION and not profit_gate_pass:
                            await broadcast_state(
                                {
                                    "type": "ai_msg",
                                    "text": (
                                        f"Execution skipped: estimated net profit {est_profit:.2f} USD is below "
                                        f"minimum {MIN_EST_PROFIT_USD:.2f} USD."
                                    ),
                                },
                                username=current_bot_user,
                            )
                            continue
                        if (not PROFIT_ONLY_EXECUTION) and (not ALLOW_NEGATIVE_EST_PROFIT) and est_profit <= 0:
                            await broadcast_state(
                                {
                                    "type": "ai_msg",
                                    "text": (
                                        f"Execution skipped: estimated net profit is {est_profit:.2f} USD "
                                        "(non-positive after costs)."
                                    ),
                                },
                                username=current_bot_user,
                            )
                            continue
                        trade_symbol = (buy_symbol or "BTC/USDT") if buy_symbol == sell_symbol else f"{buy_symbol or 'BTC/USDT'} -> {sell_symbol or 'BTC/USDT'}"
                        pending_trade = {
                            "buyExchange": buy_exchange_key.upper(),
                            "sellExchange": sell_exchange_key.upper(),
                            "buyPrice": round(buy_price, 2),
                            "sellPrice": round(sell_price, 2),
                            "spread": tradeable_spread,
                            "predictedProfit": est_profit,
                        }
                        should_execute = False
                        if AUTO_EXECUTION:
                            should_execute = True
                            await broadcast_state(
                                {
                                    "type": "ai_msg",
                                    "text": f"Auto execution active. Executing {trade_symbol} on route {route}.",
                                },
                                username=current_bot_user,
                            )
                        else:
                            pending_approved = None
                            _approval_event.clear()
                            await broadcast_state({"type": "pending_trade", "trade": pending_trade}, username=current_bot_user)
                            try:
                                await asyncio.wait_for(_approval_event.wait(), timeout=MANUAL_APPROVAL_TIMEOUT_SEC)
                                if pending_approved:
                                    should_execute = True
                                    await broadcast_state({"type": "ai_msg", "text": "Executing approved trade..."}, username=current_bot_user)
                                else:
                                    await broadcast_state({"type": "ai_msg", "text": "Trade rejected by operator."}, username=current_bot_user)
                            except asyncio.TimeoutError:
                                await broadcast_state({"type": "ai_msg", "text": "Approval timeout. Trade cancelled."}, username=current_bot_user)

                        if should_execute:
                            execution_result = await trader.execute_arbitrage(
                                symbol=buy_symbol or sell_symbol or "BTC/USDT",
                                amount=trade_size,
                                buy_exchange=buy_exchange_key,
                                sell_exchange=sell_exchange_key,
                                buy_symbol=buy_symbol,
                                sell_symbol=sell_symbol,
                            )
                            execution_mode = str((execution_result or {}).get("mode") or "LIVE")

                            if not execution_result or not execution_result.get("ok"):
                                fail_reason = str((execution_result or {}).get("error") or "unknown execution failure")
                                route_key = f"{buy_exchange_key}->{sell_exchange_key}"
                                if "insufficient" in fail_reason.lower() or "precheck" in execution_mode.lower():
                                    route_fail_until[route_key] = time.time() + ROUTE_FAIL_COOLDOWN_SEC
                                fail_reason_lower = fail_reason.lower()
                                m = re.search(r"insufficient\s+btc\s+on\s+([a-z0-9_]+)\s+for\s+sell", fail_reason_lower)
                                if m:
                                    blocked_sell_exchange = str(m.group(1) or "").strip().lower()
                                    if blocked_sell_exchange:
                                        sell_inventory_block_until[blocked_sell_exchange] = (
                                            time.time() + SELL_INVENTORY_BLOCK_SEC
                                        )
                                        await broadcast_state(
                                            {
                                                "type": "ai_msg",
                                                "text": (
                                                    f"Route guard: {blocked_sell_exchange.upper()} sell-side BTC is low. "
                                                    f"Routes selling on {blocked_sell_exchange.upper()} paused for "
                                                    f"{int(SELL_INVENTORY_BLOCK_SEC)}s."
                                                ),
                                            },
                                            username=current_bot_user,
                                        )
                                fail_rec = {
                                    "time": datetime.now().strftime("%H:%M:%S"),
                                    "route": route,
                                    "pair": trade_symbol,
                                    "mode": execution_mode,
                                    "status": "FAILED",
                                    "profit": "$0.00",
                                    "error": fail_reason,
                                }
                                save_trade(
                                    route=route,
                                    profit=0.0,
                                    username=current_bot_user,
                                    symbol=buy_symbol or sell_symbol or "BTC/USDT",
                                    pair=trade_symbol,
                                    buy_exchange=buy_exchange_key.upper() if buy_exchange_key else None,
                                    sell_exchange=sell_exchange_key.upper() if sell_exchange_key else None,
                                    buy_price=buy_price,
                                    sell_price=sell_price,
                                    spread_pct=tradeable_spread,
                                    quantity=trade_size,
                                    execution_mode=execution_mode,
                                    status="FAILED",
                                    error_reason=fail_reason,
                                    fee_pct=FEE_RATE * 100.0,
                                    slippage_pct=SLIPPAGE_RATE * 100.0,
                                )
                                trade_history.insert(0, fail_rec)
                                await broadcast_state(
                                    {"type": "trade_failed", "trade": fail_rec, "error": fail_reason},
                                    username=current_bot_user,
                                )
                            else:
                                route_key = f"{buy_exchange_key}->{sell_exchange_key}"
                                route_fail_until[route_key] = 0.0
                                if last_executed_route_key == route_key:
                                    same_route_streak += 1
                                else:
                                    last_executed_route_key = route_key
                                    same_route_streak = 1
                                if execution_mode == "COINBASE_PAPER":
                                    await broadcast_state(
                                        {
                                            "type": "ai_msg",
                                            "text": "Coinbase route executed in simulated-funds mode with live market prices.",
                                        },
                                        username=current_bot_user,
                                    )

                                save_trade(
                                    route=route,
                                    profit=est_profit,
                                    username=current_bot_user,
                                    symbol=buy_symbol or sell_symbol or "BTC/USDT",
                                    pair=trade_symbol,
                                    buy_exchange=buy_exchange_key.upper() if buy_exchange_key else None,
                                    sell_exchange=sell_exchange_key.upper() if sell_exchange_key else None,
                                    buy_price=buy_price,
                                    sell_price=sell_price,
                                    spread_pct=tradeable_spread,
                                    quantity=trade_size,
                                    execution_mode=execution_mode,
                                    status="SUCCESS",
                                    error_reason=None,
                                    fee_pct=FEE_RATE * 100.0,
                                    slippage_pct=SLIPPAGE_RATE * 100.0,
                                )

                                total_profit += est_profit
                                trade_rec = {
                                    "time": datetime.now().strftime("%H:%M:%S"),
                                    "route": route,
                                    "pair": trade_symbol,
                                    "mode": execution_mode,
                                    "status": "SUCCESS",
                                    "profit": f"{'+' if est_profit >= 0 else '-'}${abs(est_profit):.2f}",
                                }
                                trade_history.insert(0, trade_rec)
                                await broadcast_state(
                                    {"type": "trade", "trade": trade_rec, "raw_profit": est_profit},
                                    username=current_bot_user,
                                )
                                _trades_since_train += 1
                                await maybe_auto_train()

                        pending_trade = None
                except Exception as e:
                    logger.error(f"Engine Opportunity Failure: {e}")

            if bot_active:
                if degraded_mode:
                    status_msg = "DEGRADED_NEEDS_2_EXCHANGES"
                else:
                    status_msg = "MONITORING_OPPORTUNITY" if opportunity else "SCANNING_MARKETS"
            else:
                status_msg = "DEGRADED_IDLE" if degraded_mode else "SYSTEM_IDLE"

            pair_spreads_payload = [
                {
                    **row,
                    "buy_price": round(float(row["buy_price"]), 2),
                    "sell_price": round(float(row["sell_price"]), 2),
                    "spread": round(float(row["spread"]), 6),
                    "signed_spread": round(float(row["signed_spread"]), 6),
                }
                for row in pair_spreads_display
            ]

            # E. Broadcast State
            current_market_state = {
                "type": "market",
                "binance": round(float(prices["binance"]), 2),
                "bybit": round(float(prices["bybit"]), 2),
                "coinbase": round(float(prices["coinbase"]), 2),
                "spread": spread_display,
                "spread_signed": signed_spread_display,
                "net_spread": net_spread,
                "fees": total_costs,
                "ai_prediction": float(ai_pred) if ai_pred_valid and ai_pred is not None else 0.0,
                "ai_prediction_valid": ai_pred_valid,
                "ai_prediction_error": ai_pred_error,
                "ai_gate_pass": ai_gate_pass,
                "opportunity_block_reason": opportunity_block_reason,
                "risk_halted": bool(breaker_status.get("halted")),
                "risk_reason": str(breaker_status.get("reason") or "System Healthy"),
                "latency": secrets.randbelow(15) + 35,
                "bot_active": bool(bot_active),
                "status": status_msg,
                "opportunity": opportunity,
                "direction": (
                    f"{best_pair_display['buy_exchange']} -> {best_pair_display['sell_exchange']}"
                    if best_pair_display
                    else "NO_ROUTE"
                ),
                "binance_bal": round(float(balances["binance"]), 2),
                "bybit_bal": round(float(balances["bybit"]), 2),
                "coinbase_bal": round(float(balances["coinbase"]), 2),
                "binance_btc": round(float(btc_balances["binance"]), 8),
                "bybit_btc": round(float(btc_balances["bybit"]), 8),
                "coinbase_btc": round(float(btc_balances["coinbase"]), 8),
                "total_btc": round(float(sum(btc_balances.values())), 8),
                "binance_bal_status": balance_statuses["binance"],
                "bybit_bal_status": balance_statuses["bybit"],
                "coinbase_bal_status": balance_statuses["coinbase"],
                "binance_bal_error": balance_errors["binance"],
                "bybit_bal_error": balance_errors["bybit"],
                "coinbase_bal_error": balance_errors["coinbase"],
                "binance_bal_warning": balance_warnings["binance"],
                "bybit_bal_warning": balance_warnings["bybit"],
                "coinbase_bal_warning": balance_warnings["coinbase"],
                "binance_bal_asset": balance_assets["binance"],
                "bybit_bal_asset": balance_assets["bybit"],
                "coinbase_bal_asset": balance_assets["coinbase"],
                "prices": {k: round(float(prices[k]), 2) for k in EXCHANGE_KEYS},
                "price_statuses": price_statuses,
                "price_symbols": price_symbols,
                "price_errors": price_errors,
                "balances": {k: round(float(balances[k]), 2) for k in EXCHANGE_KEYS},
                "btc_balances": {k: round(float(btc_balances[k]), 8) for k in EXCHANGE_KEYS},
                "btc_statuses": btc_statuses,
                "btc_errors": btc_errors,
                "balance_statuses": balance_statuses,
                "balance_errors": balance_errors,
                "balance_warnings": balance_warnings,
                "balance_assets": balance_assets,
                "pair_spreads": pair_spreads_payload,
                "best_pair": (
                    {
                        **best_pair_display,
                        "buy_price": round(float(best_pair_display["buy_price"]), 2),
                        "sell_price": round(float(best_pair_display["sell_price"]), 2),
                        "spread": round(float(best_pair_display["spread"]), 6),
                        "signed_spread": round(float(best_pair_display["signed_spread"]), 6),
                    }
                    if best_pair_display
                    else None
                ),
                "live_exchange_count": live_count,
            }
            await broadcast_state(current_market_state)

        except Exception as e:
            logger.error(f"Engine Loop Warning: {e}")

        await asyncio.sleep(ENGINE_LOOP_INTERVAL_SEC)


# 5. FASTAPI APP SETUP
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_vault_db()
    _init_runtime_state()
    _load_runtime_state()
    load_initial_state()
    loop_task = asyncio.create_task(continuous_arbitrage_loop())
    yield
    loop_task.cancel()
    await trader.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 6. REST ENDPOINTS
@app.post("/api/register")
async def register(user: dict):
    if "username" not in user or "password" not in user:
        raise HTTPException(400, "Missing username or password")
    if len(user["password"].encode("utf-8")) > 256:
        raise HTTPException(400, "Password too long. Maximum is 256 bytes.")

    conn = sqlite3.connect(VAULT_DB)
    try:
        hashed = pwd_context.hash(user["password"])
        conn.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (user["username"], hashed))
        conn.commit()
        return {"status": "success"}
    except sqlite3.IntegrityError:
        return JSONResponse(status_code=400, content={"detail": "User already exists"})
    except Exception as e:
        logger.error(f"Registration failed: {e}")
        return JSONResponse(status_code=500, content={"detail": "Registration failed due to password hashing backend."})
    finally:
        conn.close()


@app.post("/api/token")
async def login_token(request: Request):
    body = (await request.body()).decode("utf-8")
    form = parse_qs(body)
    username = (form.get("username") or [""])[0]
    password = (form.get("password") or [""])[0]
    if not username or not password:
        raise HTTPException(400, "Missing username or password")
    if not _verify_credentials(username, password):
        raise HTTPException(401, "Invalid credentials")
    token = _issue_access_token(username)
    return {"access_token": token, "token_type": "bearer", "username": username}


@app.post("/api/login")
async def login(user: dict):
    if "username" not in user or "password" not in user:
        raise HTTPException(400, "Missing username or password")
    if _verify_credentials(user["username"], user["password"]):
        token = _issue_access_token(user["username"])
        return {"token": token, "access_token": token, "token_type": "bearer", "username": user["username"]}
    raise HTTPException(401, "Invalid credentials")


@app.post("/toggle_bot")
async def toggle_bot(payload: dict, user: str = Depends(get_current_user)):
    global bot_active, bot_operator, pending_trade, pending_approved
    normalized_user = _normalize_username(user)
    requested_state = bool(payload.get("active", False))

    if requested_state:
        if bot_active and bot_operator and bot_operator != normalized_user:
            raise HTTPException(403, "Bot is already controlled by another user.")
        bot_active = True
        bot_operator = normalized_user
    else:
        if bot_active and bot_operator and bot_operator != normalized_user:
            raise HTTPException(403, "Only the active bot owner can stop the bot.")
        bot_active = False
        bot_operator = None
        pending_trade = None
        pending_approved = None
        _approval_event.clear()

    _save_runtime_state("bot_active", "1" if bot_active else "0")
    _save_runtime_state("bot_operator", bot_operator or "")
    logger.info(f"Bot state changed to {bot_active} by {normalized_user}")
    return {"status": "success", "bot_active": bot_active, "bot_operator": bot_operator}


@app.post("/api/threshold")
async def update_threshold(payload: dict, user: str = Depends(get_current_user)):
    global current_threshold
    current_threshold = float(payload.get("threshold", 0.08))
    _save_runtime_state("current_threshold", str(current_threshold))
    return {"status": "success", "threshold": current_threshold}


@app.get("/api/history")
async def get_history(
    date: str | None = None,
    day: str | None = None,
    status: str = "ALL",
    pair: str | None = None,
    limit: int = 500,
    user: str = Depends(get_current_user),
):
    global trade_history, total_profit
    history = db_core.get_trade_history(
        limit=max(1, min(int(limit), 500)),
        username=user,
        trade_date=date,
        day_of_week=day,
        status_filter=status,
        pair=pair,
    )
    total_profit = db_core.get_total_profit(username=user)
    if not date and not day and (status or "ALL").upper() == "ALL" and not pair and int(limit) >= 500:
        trade_history = history
    return {
        "history": history,
        "total_profit": total_profit,
        "pair_options": db_core.get_trade_pairs(username=user),
        "summary": db_core.summarize_trade_history(
            history,
            {
                "date": date or "",
                "day": day or "ALL",
                "status": status or "ALL",
                "pair": pair or "ALL",
            },
        ),
        "applied_filters": {
            "date": date or "",
            "day": day or "ALL",
            "status": status or "ALL",
            "pair": pair or "ALL",
        },
    }


@app.get("/api/market-snapshot")
async def get_market_snapshot(user: str = Depends(get_current_user)):
    if current_market_state:
        return current_market_state

    def _snapshot_pair_rows(price_map: dict, candidate_keys: list[str]):
        rows = []
        for ex_a, ex_b in combinations(candidate_keys, 2):
            a = float(price_map.get(ex_a) or 0.0)
            b = float(price_map.get(ex_b) or 0.0)
            if a <= 0 or b <= 0:
                continue
            signed = ((a - b) / b) * 100.0
            if signed >= 0:
                buy_key, sell_key = ex_b, ex_a
                buy_px, sell_px = b, a
            else:
                buy_key, sell_key = ex_a, ex_b
                buy_px, sell_px = a, b
            rows.append({
                "pair": f"{ex_a.upper()}-{ex_b.upper()}",
                "buy_exchange": buy_key.upper(),
                "sell_exchange": sell_key.upper(),
                "buy_exchange_key": buy_key,
                "sell_exchange_key": sell_key,
                "buy_price": buy_px,
                "sell_price": sell_px,
                "signed_spread": signed,
                "spread": abs(signed),
            })
        return rows

    # Startup-safe snapshot: fetch directly so refresh/login doesn't show stale zeros.
    prices = {k: float(last_known_prices.get(k) or 0.0) for k in EXCHANGE_KEYS}
    balances = {k: float(last_known_balances.get(k) or 0.0) for k in EXCHANGE_KEYS}
    btc_balances = {k: float(last_known_btc_balances.get(k) or 0.0) for k in EXCHANGE_KEYS}
    price_statuses = {k: "OFFLINE" for k in EXCHANGE_KEYS}
    price_symbols = {k: None for k in EXCHANGE_KEYS}
    price_errors = {k: None for k in EXCHANGE_KEYS}
    balance_statuses = {k: "OFFLINE" for k in EXCHANGE_KEYS}
    balance_errors = {k: None for k in EXCHANGE_KEYS}
    balance_warnings = {k: None for k in EXCHANGE_KEYS}
    balance_assets = {k: "USDT" for k in EXCHANGE_KEYS}
    btc_statuses = {k: "OFFLINE" for k in EXCHANGE_KEYS}
    btc_errors = {k: None for k in EXCHANGE_KEYS}

    try:
        price_snapshot = await trader.fetch_prices_with_status()
    except Exception as e:
        logger.warning(f"Snapshot price refresh warning: {e}")
        price_snapshot = {}

    for ex in EXCHANGE_KEYS:
        payload = price_snapshot.get(ex, {})
        if payload.get("ok"):
            px = float(payload.get("price") or 0.0)
            used_symbol = payload.get("symbol")
            if px > 0:
                prices[ex] = px
                price_statuses[ex] = "LIVE"
                price_symbols[ex] = used_symbol
                last_known_prices[ex] = px
                if used_symbol:
                    last_known_symbols[ex] = used_symbol
        else:
            price_errors[ex] = payload.get("error")
            err_text = str(payload.get("error") or "")
            is_outlier = "OUTLIER:" in err_text
            if is_outlier:
                last_known_prices[ex] = None
                last_known_symbols[ex] = None
                prices[ex] = 0.0
            elif last_known_prices[ex] is not None and float(last_known_prices[ex] or 0.0) > 0:
                prices[ex] = float(last_known_prices[ex])
                price_symbols[ex] = last_known_symbols[ex]
                price_statuses[ex] = "STALE"

    try:
        balance_snapshot = await trader.fetch_usdt_balances_with_status()
    except Exception as e:
        logger.warning(f"Snapshot balance refresh warning: {e}")
        balance_snapshot = {}

    for ex in EXCHANGE_KEYS:
        payload = balance_snapshot.get(ex, {})
        if payload.get("ok"):
            bal = float(payload.get("balance") or 0.0)
            balances[ex] = bal
            balance_statuses[ex] = "LIVE"
            balance_warnings[ex] = payload.get("warning")
            balance_assets[ex] = str(payload.get("asset") or "USDT")
            last_known_balances[ex] = bal
        else:
            balance_errors[ex] = payload.get("error")
            if last_known_balances[ex] is not None:
                balances[ex] = float(last_known_balances[ex] or 0.0)
                balance_statuses[ex] = "STALE"

    try:
        btc_snapshot = await trader.fetch_btc_balances_with_status()
    except Exception as e:
        logger.warning(f"Snapshot BTC balance refresh warning: {e}")
        btc_snapshot = {}

    for ex in EXCHANGE_KEYS:
        payload = btc_snapshot.get(ex, {})
        if payload.get("ok"):
            btc = float(payload.get("balance") or 0.0)
            btc_balances[ex] = btc
            btc_statuses[ex] = "LIVE"
            last_known_btc_balances[ex] = btc
        else:
            btc_errors[ex] = payload.get("error")
            if last_known_btc_balances[ex] is not None:
                btc_balances[ex] = float(last_known_btc_balances[ex] or 0.0)
                btc_statuses[ex] = "STALE"

    display_candidates = [
        ex for ex in EXCHANGE_KEYS if prices[ex] > 0 and price_statuses[ex] in {"LIVE", "STALE"}
    ]
    pair_spreads_payload = _snapshot_pair_rows(prices, display_candidates)
    best_pair = max(pair_spreads_payload, key=lambda r: r["spread"]) if pair_spreads_payload else None
    spread_display = float(best_pair["spread"]) if best_pair else 0.0
    signed_spread_display = float(best_pair["signed_spread"]) if best_pair else 0.0
    live_count = sum(1 for k in EXCHANGE_KEYS if price_statuses[k] == "LIVE")
    total_costs = (FEE_RATE + SLIPPAGE_RATE) * 100
    status_msg = "INITIALIZING" if live_count < 2 else "SCANNING_MARKETS"

    return {
        "type": "market",
        "binance": round(float(prices["binance"]), 2),
        "bybit": round(float(prices["bybit"]), 2),
        "coinbase": round(float(prices["coinbase"]), 2),
        "spread": spread_display,
        "spread_signed": signed_spread_display,
        "net_spread": spread_display - total_costs,
        "fees": total_costs,
        "ai_prediction": 0.0,
        "latency": 0,
        "bot_active": bool(bot_active),
        "status": status_msg,
        "opportunity": False,
        "direction": (
            f"{best_pair['buy_exchange']} -> {best_pair['sell_exchange']}"
            if best_pair
            else "NO_ROUTE"
        ),
        "binance_bal": round(float(balances["binance"]), 2),
        "bybit_bal": round(float(balances["bybit"]), 2),
        "coinbase_bal": round(float(balances["coinbase"]), 2),
        "binance_btc": round(float(btc_balances["binance"]), 8),
        "bybit_btc": round(float(btc_balances["bybit"]), 8),
        "coinbase_btc": round(float(btc_balances["coinbase"]), 8),
        "total_btc": round(float(sum(btc_balances.values())), 8),
        "binance_bal_status": balance_statuses["binance"],
        "bybit_bal_status": balance_statuses["bybit"],
        "coinbase_bal_status": balance_statuses["coinbase"],
        "binance_bal_error": balance_errors["binance"],
        "bybit_bal_error": balance_errors["bybit"],
        "coinbase_bal_error": balance_errors["coinbase"],
        "binance_bal_warning": balance_warnings["binance"],
        "bybit_bal_warning": balance_warnings["bybit"],
        "coinbase_bal_warning": balance_warnings["coinbase"],
        "binance_bal_asset": balance_assets["binance"],
        "bybit_bal_asset": balance_assets["bybit"],
        "coinbase_bal_asset": balance_assets["coinbase"],
        "prices": {k: round(float(prices[k]), 2) for k in EXCHANGE_KEYS},
        "price_statuses": price_statuses,
        "price_symbols": price_symbols,
        "price_errors": price_errors,
        "balances": {k: round(float(balances[k]), 2) for k in EXCHANGE_KEYS},
        "btc_balances": {k: round(float(btc_balances[k]), 8) for k in EXCHANGE_KEYS},
        "btc_statuses": btc_statuses,
        "btc_errors": btc_errors,
        "balance_statuses": balance_statuses,
        "balance_errors": balance_errors,
        "balance_warnings": balance_warnings,
        "balance_assets": balance_assets,
        "pair_spreads": [
            {
                **row,
                "buy_price": round(float(row["buy_price"]), 2),
                "sell_price": round(float(row["sell_price"]), 2),
                "spread": round(float(row["spread"]), 6),
                "signed_spread": round(float(row["signed_spread"]), 6),
            }
            for row in pair_spreads_payload
        ],
        "best_pair": (
            {
                **best_pair,
                "buy_price": round(float(best_pair["buy_price"]), 2),
                "sell_price": round(float(best_pair["sell_price"]), 2),
                "spread": round(float(best_pair["spread"]), 6),
                "signed_spread": round(float(best_pair["signed_spread"]), 6),
            }
            if best_pair
            else None
        ),
        "live_exchange_count": live_count,
    }


@app.get("/api/public-prices")
async def get_public_prices():
    prices = {k: float(last_known_prices.get(k) or 0.0) for k in EXCHANGE_KEYS}
    price_statuses = {
        k: ("STALE" if prices[k] > 0 else "OFFLINE")
        for k in EXCHANGE_KEYS
    }

    try:
        price_snapshot = await trader.fetch_prices_with_status()
    except Exception as e:
        logger.warning(f"Public price refresh warning: {e}")
        price_snapshot = {}

    for ex in EXCHANGE_KEYS:
        payload = price_snapshot.get(ex, {})
        if payload.get("ok"):
            px = float(payload.get("price") or 0.0)
            if px > 0:
                prices[ex] = px
                price_statuses[ex] = "LIVE"
                last_known_prices[ex] = px
        elif last_known_prices[ex] is not None and float(last_known_prices[ex] or 0.0) > 0:
            prices[ex] = float(last_known_prices[ex])
            price_statuses[ex] = "STALE"

    return {
        "prices": {k: round(float(prices[k]), 2) for k in EXCHANGE_KEYS},
        "price_statuses": price_statuses,
        "updated_at": datetime.utcnow().isoformat(),
    }


@app.post("/api/trade/approve")
async def approve_trade(payload: dict, user: str = Depends(get_current_user)):
    global pending_approved, _approval_event
    normalized_user = _normalize_username(user)
    if bot_operator and bot_operator != normalized_user:
        raise HTTPException(403, "Only the active bot owner can approve trades.")
    pending_approved = payload.get("decision") == "APPROVE"
    _approval_event.set()
    return {"status": "success"}


@app.get("/api/market-analysis")
async def market_analysis(user: str = Depends(get_current_user)):
    try:
        ohlcv = await trader.binance.fetch_ohlcv("BTC/USDT", timeframe="1h", limit=50)
        prices = [c[4] for c in ohlcv]
        analysis = await market_analyst.analyze_regime(prices)
        db_core.cache_market_analysis(analysis)
        return analysis
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/chat")
async def chat(req: dict, user: str = Depends(get_current_user)):
    query = str((req or {}).get("query") or (req or {}).get("message") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")

    context = current_market_state if current_market_state else {
        "binance": last_known_prices.get("binance"),
        "bybit": last_known_prices.get("bybit"),
        "coinbase": last_known_prices.get("coinbase"),
        "spread": None,
        "status": "CONTEXT_UNAVAILABLE",
    }
    resp = await chatbot.process_chat_query(query, context)
    return {"response": resp, "provider": getattr(chatbot, "last_provider", "offline")}


# 7. WEBSOCKET ENDPOINT
@app.websocket("/ws/market")
async def market_ws(websocket: WebSocket, token: str = None):
    if not token:
        await websocket.close(1008)
        return
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = _normalize_username(payload.get("sub"))
        if not username:
            await websocket.close(1008)
            return
        await websocket.accept()
        active_connections[websocket] = username
        if current_market_state:
            await websocket.send_json(current_market_state)
        while True:
            await websocket.receive_text()
    except Exception:
        active_connections.pop(websocket, None)
        try:
            await websocket.close()
        except Exception:
            pass
