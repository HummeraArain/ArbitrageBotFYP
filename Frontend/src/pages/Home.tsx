import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { apiUrl } from "@/lib/api";

type ExchangeKey = "binance" | "bybit" | "coinbase";

type PublicPricePayload = {
  prices?: Record<ExchangeKey, number>;
  price_statuses?: Record<ExchangeKey, "LIVE" | "STALE" | "OFFLINE">;
  updated_at?: string;
};

const Home = () => {
  const navigate = useNavigate();
  const [prices, setPrices] = useState<Record<ExchangeKey, number>>({
    binance: 0,
    bybit: 0,
    coinbase: 0,
  });
  const [statuses, setStatuses] = useState<Record<ExchangeKey, "LIVE" | "STALE" | "OFFLINE">>({
    binance: "OFFLINE",
    bybit: "OFFLINE",
    coinbase: "OFFLINE",
  });

  const handleGetStarted = () => {
    const token = localStorage.getItem("token");
    navigate(token ? "/dashboard" : "/login?mode=register");
  };

  useEffect(() => {
    let isDisposed = false;

    const fetchPrices = async () => {
      try {
        const response = await fetch(apiUrl("/api/public-prices"));
        if (!response.ok) {
          throw new Error(`Price request failed: ${response.status}`);
        }

        const data = (await response.json()) as PublicPricePayload;
        if (isDisposed) return;

        setPrices({
          binance: Number(data.prices?.binance || 0),
          bybit: Number(data.prices?.bybit || 0),
          coinbase: Number(data.prices?.coinbase || 0),
        });
        setStatuses({
          binance: data.price_statuses?.binance || "OFFLINE",
          bybit: data.price_statuses?.bybit || "OFFLINE",
          coinbase: data.price_statuses?.coinbase || "OFFLINE",
        });
      } catch (error) {
        if (!isDisposed) {
          setStatuses({
            binance: "OFFLINE",
            bybit: "OFFLINE",
            coinbase: "OFFLINE",
          });
        }
        console.error("Homepage price fetch failed:", error);
      }
    };

    fetchPrices();
    const intervalId = window.setInterval(fetchPrices, 5000);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const priceCards: Array<{ key: ExchangeKey; label: string; accent: string; statusAccent: string }> = [
    { key: "binance", label: "Binance", accent: "text-yellow-300", statusAccent: "border-yellow-500/20 bg-yellow-500/10" },
    { key: "bybit", label: "Bybit", accent: "text-orange-300", statusAccent: "border-orange-500/20 bg-orange-500/10" },
    { key: "coinbase", label: "Coinbase", accent: "text-cyan-300", statusAccent: "border-cyan-500/20 bg-cyan-500/10" },
  ];

  return (
    <div className="terminal-grid min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.16),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(56,189,248,0.08),transparent_18%)]" />
        <div className="hero-noise absolute inset-0 opacity-30" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-5 md:px-8 md:py-6">
        <header className="terminal-panel sticky top-4 z-30 rounded-2xl px-4 py-3 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-green-400 to-green-600 font-black text-black shadow-[0_0_25px_rgba(34,197,94,0.28)]">
                A
              </div>
              <div>
                <p className="text-sm font-black tracking-[0.18em] text-white uppercase">Arbitrage Bot</p>
                <p className="text-[10px] uppercase tracking-[0.28em] text-gray-500">AI Cross-Exchange Console</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/login?mode=signin")}
                className="rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-100 transition hover:border-green-500/30 hover:text-green-300"
              >
                Login
              </button>
              <button
                onClick={() => navigate("/login?mode=register")}
                className="rounded-xl bg-gradient-to-r from-green-400 to-green-600 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-black shadow-[0_12px_30px_rgba(34,197,94,0.22)] transition hover:from-green-300 hover:to-green-500"
              >
                Sign Up
              </button>
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col justify-center py-10 md:py-14">
          <section className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
            <div className="terminal-badge">
              <span className="h-2 w-2 rounded-sm bg-green-400" />
              AI-POWERED ARBITRAGE SYSTEM
            </div>
            <h1 className="mt-8 max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.04em] text-white sm:text-6xl md:text-7xl">
              Smarter Crypto Trading
              <br />
              Through <span className="text-green-400 terminal-glow">Automation</span>
            </h1>
            <p className="mt-8 max-w-3xl text-base leading-8 text-gray-400 md:text-xl">
              Identify and act on cross-exchange arbitrage opportunities in real time with a unified operator view for
              Binance, Bybit, and Coinbase.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={handleGetStarted}
                className="inline-flex items-center gap-2 rounded-2xl border border-green-400/30 bg-green-400 px-7 py-4 text-sm font-black uppercase tracking-[0.2em] text-black transition hover:bg-green-300"
              >
                Start Trading
                <ArrowRight size={16} />
              </button>
              <button
                onClick={() => navigate("/demo")}
                className="rounded-2xl border border-white/15 bg-white/[0.02] px-7 py-4 text-sm font-bold uppercase tracking-[0.2em] text-gray-100 transition hover:border-cyan-400/30 hover:bg-white/[0.05]"
              >
                View Demo
              </button>
            </div>
            <div className="mt-16 w-full max-w-5xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-[0.26em] text-gray-500">Live Exchange Prices</p>
                <p className="text-[11px] uppercase tracking-[0.22em] text-gray-600">BTC Market Snapshot</p>
              </div>
              <div className="grid gap-4 text-left md:grid-cols-3">
                {priceCards.map((card) => (
                  <div key={card.key} className="terminal-panel rounded-3xl p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-sm font-black uppercase tracking-[0.18em] ${card.accent}`}>{card.label}</p>
                        <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-gray-500">Live Price</p>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gray-200 ${card.statusAccent}`}
                      >
                        {statuses[card.key]}
                      </span>
                    </div>
                    <p className="mt-6 font-mono text-3xl font-black text-white">
                      {prices[card.key] > 0 ? `$${prices[card.key].toLocaleString()}` : "--"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default Home;
