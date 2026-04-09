import asyncio
import json
from execution.trader import TradeExecutor
from dotenv import load_dotenv
import os

load_dotenv()

def _pick_env(p, s):
    return (os.getenv(p) or os.getenv(s) or "").strip()

trader = TradeExecutor(
    binance_api=_pick_env("BINANCE_TESTNET_API_KEY", "BINANCE_API_KEY"),
    binance_secret=_pick_env("BINANCE_TESTNET_SECRET", "BINANCE_SECRET"),
    bybit_api=_pick_env("BYBIT_TESTNET_API_KEY", "BYBIT_API_KEY"),
    bybit_secret=_pick_env("BYBIT_TESTNET_SECRET", "BYBIT_SECRET"),
    coinbase_api=_pick_env("COINBASE_TESTNET_API_KEY", "COINBASE_API_KEY"),
    coinbase_secret=_pick_env("COINBASE_TESTNET_SECRET", "COINBASE_SECRET"),
    coinbase_passphrase=_pick_env("COINBASE_TESTNET_PASSPHRASE", "COINBASE_PASSPHRASE"),
    testnet=True,
)

async def check():
    print("=== BYBIT KEYS LOADED ===")
    print("API Key:", repr(trader.bybit.apiKey))
    print("Sandbox mode:", getattr(trader.bybit, "sandbox", None))

    print("\n=== BYBIT FULL BALANCE (all param variants) ===")
    for params in [{"accountType": "UNIFIED"}, {"accountType": "SPOT"}, {"accountType": "CONTRACT"}, {"accountType": "FUND"}, {}]:
        try:
            res = await trader.bybit.fetch_balance(params=params)
            free = res.get("free", {})
            total = res.get("total", {})
            non_zero_free = {k: v for k, v in free.items() if v and float(v) > 0}
            non_zero_total = {k: v for k, v in total.items() if v and float(v) > 0}
            info = res.get("info", {})
            rlist = info.get("result", {}).get("list", [])
            raw_coins = []
            for row in rlist:
                for coin in (row.get("coin") or []):
                    if float(coin.get("walletBalance", 0) or 0) > 0:
                        raw_coins.append(coin)
                twb = row.get("totalWalletBalance")
                if twb:
                    print(f"  params={params} totalWalletBalance={twb}")
            print(f"params={params} => non-zero free={non_zero_free}, non-zero total={non_zero_total}, raw_coins={raw_coins}")
        except Exception as ex:
            print(f"params={params} => ERROR: {ex}")

    print("\n=== COINBASE KEYS LOADED ===")
    print("API Key:", repr(trader.coinbase.apiKey))
    print("Sandbox mode:", getattr(trader.coinbase, "sandbox", None))

    print("\n=== COINBASE FULL BALANCE ===")
    try:
        res = await trader.coinbase.fetch_balance()
        free = res.get("free", {})
        total = res.get("total", {})
        non_zero_free = {k: v for k, v in free.items() if v and float(v) > 0}
        non_zero_total = {k: v for k, v in total.items() if v and float(v) > 0}
        print("non-zero free:", non_zero_free)
        print("non-zero total:", non_zero_total)
        print("info keys:", list(res.get("info", {}).keys()))
    except Exception as e:
        print("Coinbase error:", e)

    await trader.close()

asyncio.run(check())
