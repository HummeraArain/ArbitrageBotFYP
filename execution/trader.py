import asyncio
import os
import statistics
import sqlite3
import ccxt.async_support as ccxt
import ccxt as ccxt_sync
from dotenv import load_dotenv

load_dotenv()


class TradeExecutor:
    @staticmethod
    def _as_bool(value, default=False):
        if value is None:
            return default
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    def __init__(
        self,
        binance_api,
        binance_secret,
        bybit_api="",
        bybit_secret="",
        coinbase_api="",
        coinbase_secret="",
        coinbase_passphrase="",
        testnet=True,
    ):
        self.testnet = bool(testnet)
        self.max_price_deviation_pct = float((os.getenv("MAX_PRICE_DEVIATION_PCT") or "8.0").strip())
        self.bybit_testnet_price_source = (os.getenv("BYBIT_TESTNET_PRICE_SOURCE") or "mainnet").strip().lower()
        self.request_timeout_ms = int((os.getenv("EXCHANGE_REQUEST_TIMEOUT_MS") or "12000").strip())
        self.coinbase_paper_mode = self._as_bool(os.getenv("COINBASE_PAPER_MODE"), default=False)
        self.paper_fee_rate = float((os.getenv("PAPER_FEE_RATE") or "0.001").strip())
        self.paper_slippage_rate = float((os.getenv("PAPER_SLIPPAGE_RATE") or "0.0005").strip())
        self.paper_wallet_db_path = (os.getenv("PAPER_WALLET_DB_PATH") or "arbitrage.db").strip()
        self.coinbase_paper_start_usd = float((os.getenv("COINBASE_PAPER_START_USD") or "10000").strip())
        self.coinbase_paper_start_btc = float((os.getenv("COINBASE_PAPER_START_BTC") or "0").strip())
        self.coinbase_paper_wallet = {"usd": self.coinbase_paper_start_usd, "btc": self.coinbase_paper_start_btc}
        rebalance_env = os.getenv("COINBASE_PAPER_AUTO_REBALANCE")
        if rebalance_env is None:
            # Backward compatibility for older env naming.
            rebalance_env = os.getenv("COINBASE_AUTO_REBALANCE")
        self.coinbase_paper_auto_rebalance = self._as_bool(
            rebalance_env,
            default=True,
        )

        binance_opts = {
            "apiKey": binance_api,
            "secret": binance_secret,
            "enableRateLimit": True,
            "timeout": self.request_timeout_ms,
            # Force no proxy for Binance to avoid local stalls.
            "proxies": {},
            "options": {
                "adjustForTimeDifference": True,
                "recvWindow": 10000,
            },
        }
        self.binance = ccxt.binance(binance_opts)

        bybit_opts = {
            "apiKey": bybit_api,
            "secret": bybit_secret,
            "enableRateLimit": True,
            "timeout": self.request_timeout_ms,
            "options": {
                "defaultType": "spot",
                "adjustForTimeDifference": True,
                "recvWindow": 10000,
            },
        }

        bybit_proxy = os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY")
        if bybit_proxy:
            bybit_opts["proxies"] = {"http": bybit_proxy, "https": bybit_proxy}

        self.bybit = ccxt.bybit(bybit_opts)

        # Bybit testnet public ticker can diverge heavily from real market.
        # Use mainnet public feed for prices while keeping testnet for trading/balances.
        self.bybit_price = self.bybit
        if self.testnet and self.bybit_testnet_price_source == "mainnet":
            bybit_public_opts = {
                "enableRateLimit": True,
                "timeout": self.request_timeout_ms,
                "options": {
                    "defaultType": "spot",
                    "adjustForTimeDifference": True,
                    "recvWindow": 10000,
                },
            }
            if bybit_proxy:
                bybit_public_opts["proxies"] = {"http": bybit_proxy, "https": bybit_proxy}
            self.bybit_price = ccxt.bybit(bybit_public_opts)

        coinbase_opts = {
            "apiKey": coinbase_api,
            "secret": coinbase_secret,
            "password": coinbase_passphrase,
            "enableRateLimit": True,
            "timeout": self.request_timeout_ms,
        }
        self.coinbase = ccxt.coinbaseadvanced(coinbase_opts)

        # Sync fallback clients for environments where ccxt async transport is unstable.
        self.sync_binance = ccxt_sync.binance(binance_opts)
        self.sync_bybit = ccxt_sync.bybit(bybit_opts)
        self.sync_coinbase = ccxt_sync.coinbaseadvanced(coinbase_opts)
        self.sync_bybit_price = self.sync_bybit
        if self.testnet and self.bybit_testnet_price_source == "mainnet":
            self.sync_bybit_price = ccxt_sync.bybit(bybit_public_opts)

        self.exchanges = {
            "binance": self.binance,
            "bybit": self.bybit,
            "coinbase": self.coinbase,
        }

        self.price_exchanges = {
            "binance": self.binance,
            "bybit": self.bybit_price,
            "coinbase": self.coinbase,
        }

        self.sync_exchanges = {
            "binance": self.sync_binance,
            "bybit": self.sync_bybit,
            "coinbase": self.sync_coinbase,
        }

        self.sync_price_exchanges = {
            "binance": self.sync_binance,
            "bybit": self.sync_bybit_price,
            "coinbase": self.sync_coinbase,
        }

        self.symbol_candidates = {
            "binance": ["BTC/USDT", "BTC/USDC", "BTC/USD"],
            "bybit": ["BTC/USDT", "BTC/USDC"],
            "coinbase": ["BTC/USD", "BTC/USDC", "BTC/USDT"],
        }

        if testnet:
            try:
                self.binance.set_sandbox_mode(True)
            except Exception:
                pass
            try:
                self.bybit.set_sandbox_mode(True)
            except Exception:
                pass
            try:
                self.coinbase.set_sandbox_mode(True)
            except Exception:
                pass
            try:
                self.sync_binance.set_sandbox_mode(True)
            except Exception:
                pass
            try:
                self.sync_bybit.set_sandbox_mode(True)
            except Exception:
                pass
            try:
                self.sync_coinbase.set_sandbox_mode(True)
            except Exception:
                pass

        self._init_coinbase_paper_wallet()

    async def close(self):
        unique = {}
        for ex in list(self.exchanges.values()) + list(self.price_exchanges.values()):
            unique[id(ex)] = ex
        await asyncio.gather(*(ex.close() for ex in unique.values()), return_exceptions=True)
        sync_unique = {}
        for ex in list(self.sync_exchanges.values()) + list(self.sync_price_exchanges.values()):
            sync_unique[id(ex)] = ex
        for ex in sync_unique.values():
            try:
                ex.close()
            except Exception:
                pass

    def _init_coinbase_paper_wallet(self):
        if not self.coinbase_paper_mode:
            return
        with sqlite3.connect(self.paper_wallet_db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS coinbase_paper_wallet (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    usd_balance REAL NOT NULL,
                    btc_balance REAL NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            row = conn.execute(
                "SELECT usd_balance, btc_balance FROM coinbase_paper_wallet WHERE id = 1"
            ).fetchone()
            if row is None:
                conn.execute(
                    """
                    INSERT INTO coinbase_paper_wallet (id, usd_balance, btc_balance)
                    VALUES (1, ?, ?)
                    """,
                    (self.coinbase_paper_start_usd, self.coinbase_paper_start_btc),
                )
                conn.commit()
                self.coinbase_paper_wallet = {
                    "usd": float(self.coinbase_paper_start_usd),
                    "btc": float(self.coinbase_paper_start_btc),
                }
            else:
                self.coinbase_paper_wallet = {"usd": float(row[0] or 0.0), "btc": float(row[1] or 0.0)}

    def _save_coinbase_paper_wallet(self):
        if not self.coinbase_paper_mode:
            return
        with sqlite3.connect(self.paper_wallet_db_path) as conn:
            conn.execute(
                """
                INSERT INTO coinbase_paper_wallet (id, usd_balance, btc_balance, updated_at)
                VALUES (1, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    usd_balance = excluded.usd_balance,
                    btc_balance = excluded.btc_balance,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    float(self.coinbase_paper_wallet.get("usd") or 0.0),
                    float(self.coinbase_paper_wallet.get("btc") or 0.0),
                ),
            )
            conn.commit()

    def _has_credentials(self, exchange):
        return bool(getattr(exchange, "apiKey", None)) and bool(getattr(exchange, "secret", None))

    def _get_sync_exchange(self, exchange_id: str, use_price_exchange: bool = False):
        key = str(exchange_id or "").lower()
        if use_price_exchange:
            return self.sync_price_exchanges.get(key)
        return self.sync_exchanges.get(key)

    def _extract_asset_balance(self, balance_payload, asset="USDT"):
        asset_row = balance_payload.get(asset, {})
        free_val = asset_row.get("free")
        total_val = asset_row.get("total")
        if free_val is not None:
            return float(free_val)
        if total_val is not None:
            return float(total_val)

        free_map = balance_payload.get("free", {})
        total_map = balance_payload.get("total", {})
        if asset in free_map:
            return float(free_map.get(asset) or 0.0)
        if asset in total_map:
            return float(total_map.get(asset) or 0.0)

        # Raw Bybit fallback shape: info.result.list[].coin[]
        info = balance_payload.get("info", {})
        result_list = info.get("result", {}).get("list", [])
        if not isinstance(result_list, list):
            result_list = []

        # Prefer an explicit coin match across all returned account rows.
        for account_row in result_list:
            coins = account_row.get("coin", []) or []
            for coin in coins:
                if str(coin.get("coin", "")).upper() == asset.upper():
                    if coin.get("walletBalance") is not None:
                        return float(coin.get("walletBalance") or 0.0)
                    if coin.get("equity") is not None:
                        return float(coin.get("equity") or 0.0)

        # Fallback totals are only meaningful for quote-currency wallets.
        if str(asset).upper() in {"USDT", "USDC", "USD"}:
            for account_row in result_list:
                if account_row.get("totalWalletBalance") is not None:
                    val = float(account_row.get("totalWalletBalance") or 0.0)
                    if val != 0:
                        return val
                if account_row.get("totalAvailableBalance") is not None:
                    val = float(account_row.get("totalAvailableBalance") or 0.0)
                    if val != 0:
                        return val

            if result_list:
                first_row = result_list[0]
                if first_row.get("totalWalletBalance") is not None:
                    return float(first_row.get("totalWalletBalance") or 0.0)
                if first_row.get("totalAvailableBalance") is not None:
                    return float(first_row.get("totalAvailableBalance") or 0.0)
        return None

    @staticmethod
    def _split_symbol_assets(symbol: str):
        sym = str(symbol or "").strip().upper()
        if "/" in sym:
            base, quote = sym.split("/", 1)
            return base, quote
        if "-" in sym:
            base, quote = sym.split("-", 1)
            return base, quote
        return "BTC", "USDT"

    async def _asset_balance_for_execution(self, exchange_id: str, exchange, asset: str):
        asset_u = str(asset or "").upper()
        if exchange_id == "coinbase" and self.coinbase_paper_mode:
            if asset_u in {"USD", "USDT", "USDC"}:
                return float(self.coinbase_paper_wallet.get("usd") or 0.0)
            if asset_u == "BTC":
                return float(self.coinbase_paper_wallet.get("btc") or 0.0)
            return 0.0
        return float(await self._fetch_exchange_asset_balance(exchange_id, exchange, asset=asset_u))

    async def precheck_route_balances(
        self,
        amount: float,
        buy_exchange: str,
        sell_exchange: str,
        buy_symbol: str,
        sell_symbol: str,
        fee_rate: float = 0.0,
        slippage_rate: float = 0.0,
    ):
        qty = float(amount or 0.0)
        if qty <= 0:
            return {"ok": False, "error": "invalid amount"}

        buy_key = str(buy_exchange).lower()
        sell_key = str(sell_exchange).lower()
        buy_ex = self.price_exchanges.get(buy_key)
        sell_ex = self.price_exchanges.get(sell_key)
        if not buy_ex or not sell_ex:
            return {"ok": False, "error": "invalid exchange mapping"}

        try:
            buy_px, _ = await self._fetch_exchange_price(
                buy_ex,
                [buy_symbol],
                exchange_id=buy_key,
                use_price_exchange=True,
            )
            sell_px, _ = await self._fetch_exchange_price(
                sell_ex,
                [sell_symbol],
                exchange_id=sell_key,
                use_price_exchange=True,
            )
        except Exception as e:
            return {"ok": False, "error": f"price precheck failed: {e}"}

        buy_base, buy_quote = self._split_symbol_assets(buy_symbol)
        sell_base, _ = self._split_symbol_assets(sell_symbol)
        required_quote = float(buy_px) * qty * (1.0 + float(fee_rate) + float(slippage_rate))

        try:
            buy_quote_bal = await self._asset_balance_for_execution(buy_key, self.exchanges[buy_key], buy_quote)
        except Exception as e:
            return {"ok": False, "error": f"buy balance precheck failed: {e}"}

        if float(buy_quote_bal) + 1e-12 < required_quote:
            return {
                "ok": False,
                "error": (
                    f"insufficient {buy_quote} on {buy_key.upper()} for buy. "
                    f"need={required_quote:.6f}, have={float(buy_quote_bal):.6f}"
                ),
            }

        try:
            sell_base_bal = await self._asset_balance_for_execution(sell_key, self.exchanges[sell_key], sell_base)
        except Exception as e:
            return {"ok": False, "error": f"sell balance precheck failed: {e}"}

        if (
            sell_key == "coinbase"
            and self.coinbase_paper_mode
            and self.coinbase_paper_auto_rebalance
            and sell_base == "BTC"
        ):
            return {
                "ok": True,
                "buy_price": float(buy_px),
                "sell_price": float(sell_px),
                "buy_quote": buy_quote,
                "buy_quote_balance": float(buy_quote_bal),
                "sell_base": sell_base,
                "sell_base_balance": float(sell_base_bal),
            }

        if float(sell_base_bal) + 1e-12 < qty:
            return {
                "ok": False,
                "error": (
                    f"insufficient {sell_base} on {sell_key.upper()} for sell. "
                    f"need={qty:.6f}, have={float(sell_base_bal):.6f}"
                ),
            }

        return {
            "ok": True,
            "buy_price": float(buy_px),
            "sell_price": float(sell_px),
            "buy_quote": buy_quote,
            "buy_quote_balance": float(buy_quote_bal),
            "sell_base": sell_base,
            "sell_base_balance": float(sell_base_bal),
        }

    def _balance_params_for_exchange(self, exchange_id: str):
        if exchange_id == "bybit":
            return [
                {"accountType": "UNIFIED"},
                {"accountType": "SPOT"},
                {"accountType": "CONTRACT"},
                {"accountType": "FUND"},
                {},
                {"type": "unified"},
                {"type": "spot"},
            ]
        return [{}]

    async def _fetch_exchange_asset_balance(self, exchange_id, exchange, asset="USDT"):
        if not self._has_credentials(exchange):
            raise ValueError("missing api credentials")

        params_candidates = self._balance_params_for_exchange(exchange_id)
        last_error = None
        had_successful_response = False
        first_extracted_balance = None
        for params in params_candidates:
            try:
                payload = await exchange.fetch_balance(params=params) if params else await exchange.fetch_balance()
                had_successful_response = True
                extracted = self._extract_asset_balance(payload, asset=asset)
                if extracted is None:
                    continue

                extracted_val = float(extracted)
                if extracted_val > 0:
                    return extracted_val

                if first_extracted_balance is None:
                    first_extracted_balance = extracted_val
            except Exception as e:
                last_error = e

        if last_error and not had_successful_response:
            sync_exchange = self._get_sync_exchange(exchange_id, use_price_exchange=False)
            if sync_exchange is not None:
                sync_error = None
                for params in params_candidates:
                    try:
                        if params:
                            payload = await asyncio.to_thread(sync_exchange.fetch_balance, params)
                        else:
                            payload = await asyncio.to_thread(sync_exchange.fetch_balance)
                        extracted = self._extract_asset_balance(payload, asset=asset)
                        if extracted is None:
                            continue
                        extracted_val = float(extracted)
                        if extracted_val > 0:
                            return extracted_val
                        if first_extracted_balance is None:
                            first_extracted_balance = extracted_val
                    except Exception as e_sync:
                        sync_error = e_sync
                if first_extracted_balance is not None:
                    return first_extracted_balance
                if sync_error is not None:
                    raise sync_error
            raise last_error
        if first_extracted_balance is not None:
            return first_extracted_balance
        return 0.0

    async def _fetch_balance_status_for_exchange(self, exchange_id, exchange, asset="USDT"):
        asset_u = str(asset or "USDT").upper()
        if exchange_id == "coinbase" and self.coinbase_paper_mode:
            if asset_u == "BTC":
                return exchange_id, {
                    "balance": float(self.coinbase_paper_wallet.get("btc") or 0.0),
                    "asset": "BTC",
                    "ok": True,
                    "error": None,
                    "warning": None,
                }
            return exchange_id, {
                "balance": float(self.coinbase_paper_wallet.get("usd") or 0.0),
                "asset": "USD",
                "ok": True,
                "error": None,
                "warning": None,
            }

        asset_candidates = [asset_u]
        if asset_u != "BTC":
            if exchange_id == "coinbase":
                asset_candidates = ["USD", "USDC", "USDT"]
            elif exchange_id == "bybit":
                asset_candidates = ["USDT", "USDC", "USD"]
            elif exchange_id == "binance":
                asset_candidates = ["USDT", "USDC", "USD"]

        first_zero = None
        last_error = None
        for candidate in asset_candidates:
            try:
                bal = await self._fetch_exchange_asset_balance(exchange_id, exchange, asset=candidate)
                bal_f = float(bal)
                if bal_f > 0:
                    warning = None
                    if exchange_id == "bybit" and candidate != "USDT":
                        warning = f"Using {candidate} fallback balance for Bybit."
                    return exchange_id, {
                        "balance": bal_f,
                        "asset": candidate,
                        "ok": True,
                        "error": None,
                        "warning": warning,
                    }
                if first_zero is None:
                    first_zero = (bal_f, candidate)
            except Exception as e:
                last_error = e

        if first_zero is not None:
            zero_bal, candidate = first_zero
            warning = None
            if exchange_id == "bybit" and float(zero_bal) == 0.0:
                warning = (
                    "Bybit Unified Trading balance is 0. Test coins are typically credited to Funding first. "
                    "Transfer Funding -> Unified Trading in Bybit to make funds tradeable."
                )
            if exchange_id == "coinbase" and candidate != "USDT":
                warning = f"Using {candidate} balance view for Coinbase."
            return exchange_id, {
                "balance": float(zero_bal),
                "asset": candidate,
                "ok": True,
                "error": None,
                "warning": warning,
            }

        return exchange_id, {
            "balance": None,
            "asset": asset,
            "ok": False,
            "error": str(last_error) if last_error else "balance query failed",
            "warning": None,
        }

    async def fetch_balances_with_status(self, asset="USDT", per_exchange_timeout=8.0):
        tasks = [
            self._fetch_balance_status_for_exchange(exchange_id, exchange, asset=asset)
            for exchange_id, exchange in self.exchanges.items()
        ]
        rows = await asyncio.gather(*tasks, return_exceptions=True)
        result = {}
        for exchange_id, row in zip(self.exchanges.keys(), rows):
            if isinstance(row, Exception):
                result[exchange_id] = {
                    "balance": None,
                    "ok": False,
                    "error": str(row) or row.__class__.__name__,
                }
            else:
                _, payload = row
                result[exchange_id] = payload
        return result

    async def fetch_usdt_balances(self):
        snapshot = await self.fetch_balances_with_status(asset="USDT")
        bin_usdt = float(snapshot.get("binance", {}).get("balance") or 0.0)
        byb_usdt = float(snapshot.get("bybit", {}).get("balance") or 0.0)
        return bin_usdt, byb_usdt

    async def fetch_usdt_balances_with_status(self):
        return await self.fetch_balances_with_status(asset="USDT")

    async def fetch_btc_balances_with_status(self):
        return await self.fetch_balances_with_status(asset="BTC")

    def _extract_ticker_price(self, ticker: dict):
        bid = ticker.get("bid")
        ask = ticker.get("ask")
        if bid is not None and ask is not None:
            bid_f = float(bid or 0.0)
            ask_f = float(ask or 0.0)
            if bid_f > 0 and ask_f > 0:
                mid = (bid_f + ask_f) / 2.0
                # Avoid using broken/illiquid quotes with massive spread.
                spread_pct = abs(ask_f - bid_f) / mid * 100.0
                if spread_pct <= 3.0:
                    return mid

        last_val = ticker.get("last", ticker.get("close"))
        if last_val is not None:
            last_f = float(last_val or 0.0)
            if last_f > 0:
                return last_f
        return None

    async def _fetch_exchange_price(self, exchange, symbols, exchange_id=None, use_price_exchange=False):
        last_error = None
        for symbol in symbols:
            try:
                ticker = await exchange.fetch_ticker(symbol)
                px = self._extract_ticker_price(ticker)
                if px is not None:
                    return float(px), symbol
            except Exception as e:
                last_error = e
        sync_exchange = self._get_sync_exchange(exchange_id, use_price_exchange=use_price_exchange)
        if sync_exchange is not None:
            sync_error = None
            for symbol in symbols:
                try:
                    ticker = await asyncio.to_thread(sync_exchange.fetch_ticker, symbol)
                    px = self._extract_ticker_price(ticker)
                    if px is not None:
                        return float(px), symbol
                except Exception as e_sync:
                    sync_error = e_sync
            if sync_error is not None:
                last_error = sync_error
        if last_error:
            raise last_error
        raise ValueError("ticker unavailable for all candidate symbols")

    async def _fetch_price_status_for_exchange(self, exchange_id, exchange, symbol_candidates):
        try:
            price, symbol = await self._fetch_exchange_price(
                exchange,
                symbol_candidates,
                exchange_id=exchange_id,
                use_price_exchange=True,
            )
            return exchange_id, {"price": price, "symbol": symbol, "ok": True, "error": None}
        except Exception as e:
            return exchange_id, {"price": None, "symbol": None, "ok": False, "error": str(e)}

    async def fetch_prices_with_status(self, symbol_candidates_by_exchange=None, per_exchange_timeout=6.5):
        symbol_map = symbol_candidates_by_exchange or self.symbol_candidates
        tasks = []
        price_exchange_ids = list(self.price_exchanges.keys())
        for exchange_id, exchange in self.price_exchanges.items():
            candidates = symbol_map.get(exchange_id) or self.symbol_candidates.get(exchange_id) or ["BTC/USDT"]
            tasks.append(self._fetch_price_status_for_exchange(exchange_id, exchange, candidates))

        rows = await asyncio.gather(*tasks, return_exceptions=True)
        result = {}
        for exchange_id, row in zip(price_exchange_ids, rows):
            if isinstance(row, Exception):
                result[exchange_id] = {
                    "price": None,
                    "symbol": None,
                    "ok": False,
                    "error": str(row) or row.__class__.__name__,
                }
            else:
                _, payload = row
                result[exchange_id] = payload

        # Cross-exchange sanity check to suppress broken outlier feeds.
        live_prices = [
            (exchange_id, float(payload.get("price") or 0.0))
            for exchange_id, payload in result.items()
            if payload.get("ok") and float(payload.get("price") or 0.0) > 0
        ]
        if len(live_prices) >= 3:
            median_px = float(statistics.median([px for _, px in live_prices]))
            if median_px > 0:
                for exchange_id, px in live_prices:
                    deviation_pct = abs(px - median_px) / median_px * 100.0
                    if deviation_pct > self.max_price_deviation_pct:
                        result[exchange_id] = {
                            "price": None,
                            "symbol": result.get(exchange_id, {}).get("symbol"),
                            "ok": False,
                            "error": (
                                f"OUTLIER: {exchange_id} price deviates {deviation_pct:.2f}% from "
                                f"cross-exchange median {median_px:.2f}"
                            ),
                        }
        return result

    async def check_balances(self):
        print("Connecting to exchanges...")
        try:
            snapshot = await self.fetch_usdt_balances_with_status()
            for exchange_id, payload in snapshot.items():
                if payload.get("ok"):
                    print(f"{exchange_id.upper()} USDT: {payload.get('balance')}")
                else:
                    print(f"{exchange_id.upper()} balance error: {payload.get('error')}")
        except Exception as e:
            print(f"Balance check error: {e}")

    async def _simulate_coinbase_route(self, amount, buy_exchange, sell_exchange, buy_symbol, sell_symbol):
        amount_f = float(amount or 0.0)
        if amount_f <= 0:
            return {"ok": False, "mode": "COINBASE_PAPER", "error": "invalid amount"}

        buy_key = str(buy_exchange).lower()
        sell_key = str(sell_exchange).lower()
        buy_symbol = buy_symbol or "BTC/USDT"
        sell_symbol = sell_symbol or "BTC/USDT"

        buy_ex = self.price_exchanges.get(buy_key)
        sell_ex = self.price_exchanges.get(sell_key)
        if not buy_ex or not sell_ex:
            return {"ok": False, "mode": "COINBASE_PAPER", "error": "invalid exchange mapping"}

        try:
            buy_px, _ = await self._fetch_exchange_price(
                buy_ex,
                [buy_symbol],
                exchange_id=buy_key,
                use_price_exchange=True,
            )
            sell_px, _ = await self._fetch_exchange_price(
                sell_ex,
                [sell_symbol],
                exchange_id=sell_key,
                use_price_exchange=True,
            )
        except Exception as e:
            return {"ok": False, "mode": "COINBASE_PAPER", "error": f"price fetch failed: {e}"}

        fee = float(self.paper_fee_rate)
        slip = float(self.paper_slippage_rate)

        if buy_key == "coinbase":
            effective_buy = float(buy_px) * (1.0 + slip)
            total_cost = effective_buy * amount_f * (1.0 + fee)
            if float(self.coinbase_paper_wallet.get("usd") or 0.0) + 1e-12 < total_cost:
                return {
                    "ok": False,
                    "mode": "COINBASE_PAPER",
                    "error": f"insufficient paper USD for buy. need={total_cost:.2f}",
                }
            self.coinbase_paper_wallet["usd"] = float(self.coinbase_paper_wallet.get("usd") or 0.0) - total_cost
            self.coinbase_paper_wallet["btc"] = float(self.coinbase_paper_wallet.get("btc") or 0.0) + amount_f

        if sell_key == "coinbase":
            btc_available = float(self.coinbase_paper_wallet.get("btc") or 0.0)
            if btc_available + 1e-12 < amount_f:
                if self.coinbase_paper_auto_rebalance:
                    shortfall = amount_f - btc_available
                    rebalance_buy = float(sell_px) * (1.0 + slip)
                    rebalance_cost = rebalance_buy * shortfall * (1.0 + fee)
                    usd_bal = float(self.coinbase_paper_wallet.get("usd") or 0.0)
                    if usd_bal + 1e-12 < rebalance_cost:
                        return {
                            "ok": False,
                            "mode": "COINBASE_PAPER",
                            "error": (
                                f"insufficient paper BTC for sell and USD for rebalance. "
                                f"btc_have={btc_available:.8f}, usd_need={rebalance_cost:.2f}, usd_have={usd_bal:.2f}"
                            ),
                        }
                    self.coinbase_paper_wallet["usd"] = usd_bal - rebalance_cost
                    self.coinbase_paper_wallet["btc"] = btc_available + shortfall
                    btc_available = float(self.coinbase_paper_wallet.get("btc") or 0.0)
                else:
                    return {
                        "ok": False,
                        "mode": "COINBASE_PAPER",
                        "error": f"insufficient paper BTC for sell. have={btc_available:.8f}",
                    }
            effective_sell = float(sell_px) * (1.0 - slip)
            total_proceeds = effective_sell * amount_f * (1.0 - fee)
            self.coinbase_paper_wallet["btc"] = btc_available - amount_f
            self.coinbase_paper_wallet["usd"] = float(self.coinbase_paper_wallet.get("usd") or 0.0) + total_proceeds

        self._save_coinbase_paper_wallet()
        return {
            "ok": True,
            "mode": "COINBASE_PAPER",
            "buy_price": float(buy_px),
            "sell_price": float(sell_px),
            "coinbase_paper_usd": float(self.coinbase_paper_wallet.get("usd") or 0.0),
            "coinbase_paper_btc": float(self.coinbase_paper_wallet.get("btc") or 0.0),
        }

    async def execute_arbitrage(
        self,
        symbol="BTC/USDT",
        amount=0.01,
        buy_exchange="binance",
        sell_exchange="bybit",
        buy_symbol=None,
        sell_symbol=None,
    ):
        print("\n--- INITIATING ARBITRAGE EXECUTION ---")

        buy_key = str(buy_exchange).lower()
        sell_key = str(sell_exchange).lower()
        buy_ex = self.exchanges.get(buy_key)
        sell_ex = self.exchanges.get(sell_key)
        buy_symbol = buy_symbol or symbol
        sell_symbol = sell_symbol or symbol

        if not buy_ex or not sell_ex or buy_key == sell_key:
            print("Invalid arbitrage route configuration.")
            return {"ok": False, "mode": "LIVE", "error": "invalid route"}

        precheck = await self.precheck_route_balances(
            amount=amount,
            buy_exchange=buy_key,
            sell_exchange=sell_key,
            buy_symbol=buy_symbol,
            sell_symbol=sell_symbol,
            fee_rate=self.paper_fee_rate if self.coinbase_paper_mode else 0.0,
            slippage_rate=self.paper_slippage_rate if self.coinbase_paper_mode else 0.0,
        )
        if not precheck.get("ok"):
            return {"ok": False, "mode": "PRECHECK", "error": precheck.get("error", "precheck failed")}

        if self.coinbase_paper_mode and (buy_key == "coinbase" or sell_key == "coinbase"):
            print("Coinbase paper mode active. Simulating route with live prices.")
            return await self._simulate_coinbase_route(
                amount=amount,
                buy_exchange=buy_key,
                sell_exchange=sell_key,
                buy_symbol=buy_symbol,
                sell_symbol=sell_symbol,
            )

        print(f"Leg 1: BUY on {buy_key} ({buy_symbol})")
        try:
            buy_order = await buy_ex.create_market_buy_order(buy_symbol, amount)
            print(f"Buy order placed: {buy_order.get('id')}")
        except Exception as e:
            sync_buy_ex = self._get_sync_exchange(buy_key, use_price_exchange=False)
            if sync_buy_ex is not None:
                try:
                    buy_order = await asyncio.to_thread(sync_buy_ex.create_market_buy_order, buy_symbol, amount)
                    print(f"Buy order placed via sync fallback: {buy_order.get('id')}")
                except Exception as e_sync:
                    print(f"Buy leg failed on {buy_key}: {e_sync}")
                    return {"ok": False, "mode": "LIVE", "error": f"buy leg failed: {e_sync}"}
            else:
                print(f"Buy leg failed on {buy_key}: {e}")
                return {"ok": False, "mode": "LIVE", "error": f"buy leg failed: {e}"}

        print(f"Leg 2: SELL on {sell_key} ({sell_symbol})")
        try:
            sell_order = await sell_ex.create_market_sell_order(sell_symbol, amount)
            print(f"Sell order placed: {sell_order.get('id')}")
        except Exception as e:
            sync_sell_ex = self._get_sync_exchange(sell_key, use_price_exchange=False)
            if sync_sell_ex is not None:
                try:
                    sell_order = await asyncio.to_thread(sync_sell_ex.create_market_sell_order, sell_symbol, amount)
                    print(f"Sell order placed via sync fallback: {sell_order.get('id')}")
                except Exception as e_sync:
                    print(f"Sell leg failed on {sell_key}: {e_sync}")
                    print("Arbitrage partially filled; manual reconciliation may be needed.")
                    return {
                        "ok": False,
                        "mode": "LIVE",
                        "error": f"sell leg failed: {e_sync}",
                        "buy_order_id": buy_order.get("id") if isinstance(buy_order, dict) else None,
                    }
            else:
                print(f"Sell leg failed on {sell_key}: {e}")
                print("Arbitrage partially filled; manual reconciliation may be needed.")
                return {
                    "ok": False,
                    "mode": "LIVE",
                    "error": f"sell leg failed: {e}",
                    "buy_order_id": buy_order.get("id") if isinstance(buy_order, dict) else None,
                }

        print("ARBITRAGE CYCLE COMPLETE")
        return {
            "ok": True,
            "mode": "LIVE",
            "buy_order_id": buy_order.get("id") if isinstance(buy_order, dict) else None,
            "sell_order_id": sell_order.get("id") if isinstance(sell_order, dict) else None,
        }
