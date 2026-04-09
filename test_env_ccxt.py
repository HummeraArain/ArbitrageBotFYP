import asyncio
import os
from dotenv import load_dotenv
import ccxt.async_support as ccxt

load_dotenv()

async def test():
    print("Testing CCXT with Proxies:", os.getenv("HTTP_PROXY"))
    b = ccxt.binance()
    try:
        data = await b.fetch_ticker('BTC/USDT')
        print('SUCCESS:', data['last'])
    except Exception as e:
        print("FAILED:", type(e).__name__, str(e))
    finally:
        await b.close()

asyncio.run(test())
