import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bot, ChartNoAxesCombined, Shield, Waypoints } from "lucide-react";

const Demo = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  return (
    <div className="terminal-grid min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.14),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.08),transparent_18%)]" />
        <div className="hero-noise absolute inset-0 opacity-30" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 py-5 md:px-8 md:py-6">
        <header className="terminal-panel rounded-2xl px-4 py-3 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-200 transition hover:border-green-500/30 hover:text-green-300"
            >
              <ArrowLeft size={14} />
              Home
            </button>

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

        <main className="pb-12 pt-10">
          <section className="terminal-panel relative overflow-hidden rounded-[2rem] border-green-500/15 bg-[linear-gradient(180deg,rgba(34,197,94,0.05),rgba(9,9,9,0.9))] p-8 md:p-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_28%)]" />
            <div className="terminal-badge">
              <span className="h-2 w-2 rounded-sm bg-green-400" />
              VIEW DEMO
            </div>
            <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <h1 className="text-4xl font-black leading-tight tracking-[-0.03em] text-white md:text-6xl">
                  See how the bot works before you enter the dashboard.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-8 text-gray-400 md:text-lg">
                  This page gives users a simple walkthrough of the bot flow, the operating guidelines, and what they
                  will see once they sign in.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    onClick={() => navigate(token ? "/dashboard" : "/login?mode=register")}
                    className="inline-flex items-center gap-2 rounded-2xl border border-green-400/30 bg-green-400 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-black transition hover:bg-green-300"
                  >
                    {token ? "Open Dashboard" : "Start Trading"}
                    <ArrowRight size={16} />
                  </button>
                  <button
                    onClick={() => navigate("/login?mode=signin")}
                    className="rounded-2xl border border-white/15 bg-white/[0.02] px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-gray-100 transition hover:border-cyan-400/30"
                  >
                    Login
                  </button>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-cyan-500/15 bg-[linear-gradient(180deg,rgba(8,145,178,0.12),rgba(9,9,9,0.92))] p-6 shadow-[0_24px_60px_rgba(6,182,212,0.08)]">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-gray-500">Demo Summary</p>
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl border border-green-500/15 bg-green-500/10 p-4">
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-green-300">Connected Exchanges</p>
                    <p className="mt-2 text-sm leading-7 text-gray-300">Binance, Bybit, and Coinbase prices are monitored in one operator workspace.</p>
                  </div>
                  <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/10 p-4">
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-200">Execution Signals</p>
                    <p className="mt-2 text-sm leading-7 text-gray-300">The system highlights spread opportunities, profit potential, status, and route decisions.</p>
                  </div>
                  <div className="rounded-2xl border border-yellow-500/15 bg-yellow-500/10 p-4">
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-yellow-200">Operator Control</p>
                    <p className="mt-2 text-sm leading-7 text-gray-300">Users can sign in, inspect the market, approve trades where required, and review the execution ledger.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="terminal-panel relative overflow-hidden rounded-[1.75rem] border-green-500/20 bg-[linear-gradient(180deg,rgba(34,197,94,0.07),rgba(9,9,9,0.94))] p-6 shadow-[0_24px_70px_rgba(34,197,94,0.08)] lg:col-span-2">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.1),transparent_30%)]" />
              <div className="relative">
                <div className="inline-flex items-center rounded-full border border-green-500/25 bg-green-500/10 px-4 py-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-green-300">How Bot Works</p>
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-green-50/70">
                  A step-by-step walkthrough of the live arbitrage flow, from sign-in to monitoring, execution, and review.
                </p>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-green-500/20 bg-green-500/[0.05] p-5">
                  <div className="mb-4 inline-flex rounded-2xl border border-green-500/20 bg-green-500/10 p-3 text-green-400">
                    <Waypoints size={18} />
                  </div>
                  <h2 className="text-lg font-black text-white">1. Connect and authenticate</h2>
                  <p className="mt-3 text-sm leading-7 text-gray-400">
                    Users sign up or log in, then access the dashboard where exchange-linked data is displayed in one place.
                  </p>
                </div>
                <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/[0.05] p-5">
                  <div className="mb-4 inline-flex rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-cyan-300">
                    <ChartNoAxesCombined size={18} />
                  </div>
                  <h2 className="text-lg font-black text-white">2. Monitor live spreads</h2>
                  <p className="mt-3 text-sm leading-7 text-gray-400">
                    The engine streams prices, measures arbitrage spread differences, and surfaces the best route in real time.
                  </p>
                </div>
                <div className="rounded-3xl border border-yellow-500/20 bg-yellow-500/[0.05] p-5">
                  <div className="mb-4 inline-flex rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-yellow-300">
                    <Bot size={18} />
                  </div>
                  <h2 className="text-lg font-black text-white">3. Execute with visibility</h2>
                  <p className="mt-3 text-sm leading-7 text-gray-400">
                    When conditions match the threshold, the bot prepares or executes trades and records each result in the activity feed.
                  </p>
                </div>
                <div className="rounded-3xl border border-red-500/20 bg-red-500/[0.05] p-5">
                  <div className="mb-4 inline-flex rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-red-300">
                    <Shield size={18} />
                  </div>
                  <h2 className="text-lg font-black text-white">4. Review and manage</h2>
                  <p className="mt-3 text-sm leading-7 text-gray-400">
                    The dashboard keeps ledger history, balance snapshots, AI guidance, and trading status visible for operator review.
                  </p>
                </div>
              </div>
            </div>

            <div className="terminal-panel relative overflow-hidden rounded-[1.75rem] border-cyan-500/20 bg-[linear-gradient(180deg,rgba(6,182,212,0.08),rgba(9,9,9,0.94))] p-6 shadow-[0_24px_70px_rgba(6,182,212,0.08)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.12),transparent_34%)]" />
              <div className="relative">
                <div className="inline-flex items-center rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200">Guidelines</p>
                </div>
                <p className="mt-4 text-sm leading-7 text-cyan-50/70">
                  These are operator reminders and safety checks so users understand how to work with the bot responsibly.
                </p>
              </div>
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.05] p-4 text-sm leading-7 text-gray-300">
                  Keep exchange credentials valid so the dashboard can read live balances and prices correctly.
                </div>
                <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.05] p-4 text-sm leading-7 text-gray-300">
                  Check spread thresholds and route signals before enabling live trading behavior.
                </div>
                <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.05] p-4 text-sm leading-7 text-gray-300">
                  Use the execution ledger to verify successful trades, failed attempts, and profit updates.
                </div>
                <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.05] p-4 text-sm leading-7 text-gray-300">
                  Review the AI or system feed for reasoning, runtime status, and operator-facing alerts.
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 terminal-panel relative overflow-hidden rounded-[1.75rem] border-yellow-500/15 bg-[linear-gradient(180deg,rgba(234,179,8,0.05),rgba(9,9,9,0.94))] p-6 shadow-[0_24px_70px_rgba(234,179,8,0.06)] md:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(234,179,8,0.08),transparent_28%)]" />
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-3xl border border-green-500/20 bg-green-500/[0.05] p-5">
                <div className="inline-flex items-center rounded-full border border-green-500/25 bg-green-500/10 px-3 py-1.5">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-green-300">Overview</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-gray-300">
                  A high-level screen for balances, live spread data, best route visibility, and core market movement.
                </p>
              </div>
              <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/[0.05] p-5">
                <div className="inline-flex items-center rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200">Activity</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-gray-300">
                  A clearer view of recent trade behavior, execution results, route details, and success or failure counts.
                </p>
              </div>
              <div className="rounded-3xl border border-yellow-500/20 bg-yellow-500/[0.05] p-5">
                <div className="inline-flex items-center rounded-full border border-yellow-500/25 bg-yellow-500/10 px-3 py-1.5">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-yellow-200">Database</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-gray-300">
                  A ledger-focused view where users can inspect stored trade records and net profit summaries.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default Demo;
