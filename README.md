# ArbPro - AI Arbitrage Bot

ArbPro is a Final Year Project focused on cross-exchange crypto arbitrage monitoring and execution. The system combines a FastAPI backend, a React dashboard, exchange integrations, a GRU-based spread predictor, operator authentication, and a local SQLite database for trade history, summaries, and execution logs.

## Current Scope

- Multi-exchange monitoring for Binance, Bybit, and Coinbase
- Real-time price, balance, BTC holding, and spread dashboard
- JWT-based user login and per-user trade history isolation
- Trade execution logging with `SUCCESSFUL`, `FAILED`, and `BLOCKED` records
- Coinbase paper-wallet support for simulation with live market prices
- GRU spread prediction loaded from local trained model files
- Crypto-only chat assistant for market questions and local trade history
- Docker support for backend + frontend deployment

## Stack

- Backend: FastAPI, Uvicorn, SQLite, CCXT, JWT, Passlib
- Frontend: React, TypeScript, Vite, Tailwind CSS, Recharts
- AI/ML: PyTorch GRU model, OpenAI chat integration, Gemini/Groq hooks
- Storage: `arbitrage.db` and `operator_vault.db`

## Main Project Files

- [api.py](./api.py): main backend app, REST APIs, websocket feed, bot loop
- [execution/trader.py](./execution/trader.py): exchange integration and execution logic
- [core/database.py](./core/database.py): trade storage, summaries, filtering, migrations
- [core/risk_engine.py](./core/risk_engine.py): trade approval and circuit-breaker logic
- [predictor.py](./predictor.py): GRU model loader and inference
- [Frontend/src/pages/Dashboard.tsx](./Frontend/src/pages/Dashboard.tsx): main dashboard UI

## Local Run

### 1. Backend

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Backend runs on:

- `http://127.0.0.1:8000`

### 2. Frontend

```bash
cd Frontend
npm install
npm run dev
```

Frontend runs on:

- `http://127.0.0.1:8080`

## Environment

Use `.env.example` as the base template and create your own `.env`.

Important variables include:

- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL`
- `JWT_SECRET_KEY`
- `EXCHANGE_TESTNET`
- `BINANCE_TESTNET_API_KEY`
- `BINANCE_TESTNET_SECRET`
- `BYBIT_TESTNET_API_KEY`
- `BYBIT_TESTNET_SECRET`
- `COINBASE_PAPER_MODE`
- `COINBASE_PAPER_START_USD`
- `COINBASE_PAPER_START_BTC`

## Model Files

The current project uses these local model assets:

- `gru_model.pth`
- `scaler_params.npy`

These are loaded by [predictor.py](./predictor.py) at runtime.

## Database Notes

- `arbitrage.db`: trade history, summaries, market caches, paper wallet
- `operator_vault.db`: registered users and password hashes

Trade history is isolated per authenticated user in the dashboard and summary APIs.

## Docker

Run the full stack with Docker:

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:8000`

Docker files included:

- [Dockerfile](./Dockerfile)
- [docker-compose.yml](./docker-compose.yml)
- [Frontend/Dockerfile](./Frontend/Dockerfile)
- [Frontend/nginx.conf](./Frontend/nginx.conf)

## Git Workflow

This repo is already connected to GitHub. A typical push flow is:

```bash
git status
git add .
git commit -m "Update ArbPro project"
git push -u origin feature/codex_Project
```

## Notes

- Coinbase paper mode uses simulated funds with live market prices.
- Chart visuals are live snapshot based, not exchange-native tick-by-tick streaming.
- Some large runtime files and databases may be intentionally kept for demo purposes depending on your submission needs.

## Project Goal

This project was developed as an FYP to demonstrate how AI-assisted arbitrage monitoring, risk controls, execution flow, and explainable dashboarding can be combined into one integrated crypto trading system.
