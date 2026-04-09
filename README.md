# ArbPro - AI Arbitrage Bot 🚀
**v7.0 - Multi-Tier AI Architecture & Risk Guard Edition**

An enterprise-grade, AI-powered cryptocurrency arbitrage system designed to detect and exploit price discrepancies between **Binance** and **Bybit** on the **BTC/USDT** pair. Featuring a **5-Tier Autonomous Agent Stack**, a **Kelly Criterion Risk Engine**, and a high-fidelity glassmorphism dashboard.

## 🌟 Key Features (v7.0)

*   **🧠 5-Tier LLM Multi-Agent System**:
    *   **Tier 1 (AIAgent)**: Real-time decision logic & JSON schema validation.
    *   **Tier 2 (MarketAnalyst)**: Identifies market regimes (Trending/Volatile) from 50 OHLCV candles.
    *   **Tier 3 (StrategyAdvisor)**: Batch-processed weekly portfolio & spread optimization.
    *   **Tier 4 (AnalystBot)**: Context-aware interactive assistant with senior quant persona.
    *   **Tier 5 (RiskEngine)**: Fractional Kelly sizing & multi-layer circuit breakers.
*   **🛡️ Dynamic Risk Management**:
    *   **Kelly Criterion**: Automated position sizing (0.2x multiplier) for capital preservation.
    *   **Circuit Breakers**: Hard daily drawdown limits ($50) and consecutive loss protection.
*   **📡 Real-Time Intelligent Oracles**: High-frequency price fetching from Binance and Bybit via CCXT async links.
*   **📊 Next-Gen Dashboard**: Modular React interface with **Recharts** for real-time spread visualizers and market status monitoring.
*   **🗄️ DatabaseCore v7.0**: SQLite WAL-mode engine with full LLM decision auditing and market analysis caching.

## 🏗️ Project Architecture

### [A] Backend (Python / FastAPI)
*   **`api.py`**: Central WebSocket engine & Tiered LLM router.
*   **`core/risk_engine.py`**: Circuit breakers and Kelly position sizing.
*   **`core/database.py`**: High-concurrency WAL storage and auditing.
*   **`llm/`**: Modular logic for all 5 AI Agents (GenAI v1.0+ SDK).
*   **`execution/trader.py`**: CCXT order execution with proxy-restricted Bybit support.

### [B] Frontend (React / TypeScript)
*   **`Dashboard.tsx`**: Main UI engine for real-time telemetry.
*   **`components/dashboard/`**: Reusable modules (`Header`, `PortfolioMetrics`, `OracleFeeds`, `Sidebar`).
*   **`Sidebar.tsx`**: Context-aware AI Logic Core with integrated chat.

## 🛠️ Tech Stack

*   **Backend**: Python 3.10+, FastAPI, Asyncio, CCXT, JWT, SQLite 3 (WAL).
*   **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide.
*   **AI/ML**: Google Generative AI (Gemini 2.0 Flash), GRU Neural Network (TensorFlow).
*   **Design**: Modern Dark-Mode Glassmorphism.

## 🚀 Quick Start

### 1. Requirements
```bash
python -m venv .venv
source .venv/bin/activate  # Or .\.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Environment (.env)
```env
GEMINI_API_KEY=your_key
BINANCE_TESTNET_API_KEY=your_key
BINANCE_TESTNET_SECRET=your_secret
BYBIT_TESTNET_API_KEY=your_key
BYBIT_TESTNET_SECRET=your_secret
JWT_SECRET_KEY=your_custom_secret
```

### 3. Launch
**Backend:** `python main.py`
**Frontend:** `cd Frontend && npm install && npm run dev`

Optional frontend API override:
```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

---
*Developed as a Final Year Project (FYP) for Cross-Exchange Arbitrage & AI Optimization.*
