import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, KeyRound, LineChart, LogOut, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Article = {
  id: string;
  category: "Getting Started" | "API Setup" | "Trading Logic" | "Troubleshooting";
  title: string;
  summary: string;
  readTime: string;
  sections: Array<{ heading: string; points: string[] }>;
};

const ARTICLES: Article[] = [
  {
    id: "start-here",
    category: "Getting Started",
    title: "Start Here: From Login to Live Monitoring",
    summary: "Simple first-run flow so a new operator can reach dashboard safely.",
    readTime: "4 min",
    sections: [
      {
        heading: "1) Create account and sign in",
        points: [
          "Open Home page, click Sign Up, then create operator credentials.",
          "After registration, switch to Sign In and enter dashboard.",
        ],
      },
      {
        heading: "2) Verify exchange cards",
        points: [
          "Check each vault card status (LIVE / STALE / OFFLINE).",
          "Make sure balances are visible before enabling auto execution.",
        ],
      },
      {
        heading: "3) Start engine carefully",
        points: [
          "Use the top action button to ENGAGE ALGORITHM.",
          "Set threshold according to market and fee conditions.",
          "Watch Execution Ledger and Execution Feed for reasons and outcomes.",
        ],
      },
    ],
  },
  {
    id: "api-keys",
    category: "API Setup",
    title: "How to Add Exchange APIs in .env",
    summary: "Exact key fields for Binance, Bybit, and Coinbase test/live environments.",
    readTime: "6 min",
    sections: [
      {
        heading: "Required key groups",
        points: [
          "Binance: BINANCE_TESTNET_API_KEY and BINANCE_TESTNET_SECRET (or live equivalents).",
          "Bybit: BYBIT_TESTNET_API_KEY and BYBIT_TESTNET_SECRET (or live equivalents).",
          "Coinbase: COINBASE_TESTNET_API_KEY and COINBASE_TESTNET_SECRET.",
          "For live Coinbase, also set COINBASE_PASSPHRASE.",
        ],
      },
      {
        heading: "Environment mode",
        points: [
          "EXCHANGE_TESTNET=true uses test credentials.",
          "EXCHANGE_TESTNET=false switches to live credentials.",
          "Restart backend after editing .env so new keys load.",
        ],
      },
      {
        heading: "Common setup checks",
        points: [
          "Wrong/expired key leads to OFFLINE or 401 errors.",
          "API permissions must allow balance read and trading.",
          "Clock sync issues can fail signed requests; keep system time correct.",
        ],
      },
    ],
  },
  {
    id: "execution-logic",
    category: "Trading Logic",
    title: "How Execution Decision Works (Simple)",
    summary: "Why bot may skip even when spread looks above threshold.",
    readTime: "5 min",
    sections: [
      {
        heading: "Decision gates",
        points: [
          "Gate 1: Raw spread must be >= execution threshold.",
          "Gate 2: Net spread after fee+slippage must stay positive.",
          "Gate 3: Risk engine must not halt due to safety rules.",
        ],
      },
      {
        heading: "Important formula",
        points: [
          "Net spread = raw spread - (trading fee + slippage).",
          "If net spread <= 0, profit-only mode blocks execution.",
        ],
      },
      {
        heading: "Where to check reason",
        points: [
          "Execution Feed shows live engine reason for skip/execute.",
          "Execution Ledger stores final status and settlement value.",
        ],
      },
    ],
  },
  {
    id: "issues",
    category: "Troubleshooting",
    title: "No Trades Executing? Quick Fix Checklist",
    summary: "Fast checks when dashboard is live but no trade is firing.",
    readTime: "4 min",
    sections: [
      {
        heading: "Market and costs",
        points: [
          "Spread can be above threshold but still below total costs.",
          "If costs dominate spread, execution remains blocked by design.",
        ],
      },
      {
        heading: "Balances and routes",
        points: [
          "Sell-side BTC must be available on route target exchange.",
          "If one route fails repeatedly, temporary cooldown can pause that route.",
        ],
      },
      {
        heading: "Runtime controls",
        points: [
          "Ensure bot is active and threshold is saved.",
          "After .env changes, restart backend to apply new values.",
        ],
      },
    ],
  },
];

const Blog = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"All" | Article["category"]>("All");
  const [selected, setSelected] = useState<Article | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ARTICLES.filter((a) => {
      const categoryMatch = activeCategory === "All" || a.category === activeCategory;
      const textMatch =
        !q || a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q) || a.category.toLowerCase().includes(q);
      return categoryMatch && textMatch;
    });
  }, [query, activeCategory]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              onClick={() => navigate("/dashboard")}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-br from-green-400 to-green-600 font-black text-black"
            >
              A
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Bot Guides</h1>
              <p className="text-xs uppercase tracking-widest text-gray-500">Usage, API setup, and troubleshooting</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigate("/dashboard")}
              variant="ghost"
              className="border border-white/10 bg-white/[0.03] text-gray-200 hover:bg-white/[0.08]"
            >
              <ArrowLeft size={16} className="mr-2" />
              Dashboard
            </Button>
            <Button onClick={handleLogout} className="bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20">
              <LogOut size={16} className="mr-2" />
              Logout
            </Button>
          </div>
        </header>

        {!selected ? (
          <div className="space-y-8">
            <section className="rounded-2xl border border-white/10 bg-[#0a0a11] p-6">
              <h2 className="text-lg font-bold text-white">Quick Help</h2>
              <p className="mt-2 text-sm text-gray-400">
                If you are new, read in this order: Start Here → API Setup → Execution Logic → Troubleshooting.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-[#101018] p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-green-400">Step 1</p>
                  <p className="mt-2 text-sm text-gray-300">Create account and sign in from Home page.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#101018] p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-cyan-400">Step 2</p>
                  <p className="mt-2 text-sm text-gray-300">Add exchange keys in .env and restart backend.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#101018] p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-yellow-400">Step 3</p>
                  <p className="mt-2 text-sm text-gray-300">Use dashboard feed + ledger to validate execution.</p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search guide..."
                    className="border-white/10 bg-[#0a0a11] pl-9 text-sm"
                  />
                </div>
                {(["All", "Getting Started", "API Setup", "Trading Logic", "Troubleshooting"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setActiveCategory(c)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition ${
                      activeCategory === c
                        ? "bg-green-500 text-black"
                        : "border border-white/15 bg-white/[0.03] text-gray-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {filtered.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => setSelected(article)}
                    className="rounded-2xl border border-white/10 bg-[#0a0a11] p-5 text-left transition hover:border-green-500/40"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <Badge className="bg-green-500/10 text-green-400 border-green-500/25">{article.category}</Badge>
                      <span className="text-xs text-gray-500">{article.readTime}</span>
                    </div>
                    <h3 className="text-lg font-bold text-white">{article.title}</h3>
                    <p className="mt-2 text-sm text-gray-400">{article.summary}</p>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <article className="rounded-2xl border border-white/10 bg-[#0a0a11] p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500/10 text-green-400 border-green-500/25">{selected.category}</Badge>
                <span className="text-xs text-gray-500">{selected.readTime}</span>
              </div>
              <Button
                onClick={() => setSelected(null)}
                variant="ghost"
                className="border border-white/15 bg-white/[0.03] text-gray-300 hover:bg-white/[0.08]"
              >
                <ArrowLeft size={16} className="mr-2" />
                Back
              </Button>
            </div>
            <h2 className="text-2xl font-black text-white">{selected.title}</h2>
            <p className="mt-2 text-sm text-gray-400">{selected.summary}</p>

            <div className="mt-6 space-y-5">
              {selected.sections.map((section) => (
                <div key={section.heading} className="rounded-xl border border-white/10 bg-[#101018] p-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-cyan-300">{section.heading}</h3>
                  <ul className="mt-3 space-y-2 text-sm text-gray-300">
                    {section.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-green-400" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-[#0d0d15] p-4">
                <div className="mb-2 flex items-center gap-2 text-green-400">
                  <BookOpen size={14} />
                  <p className="text-xs font-black uppercase tracking-wider">Guided Use</p>
                </div>
                <p className="text-sm text-gray-300">Follow these steps in order to avoid setup mistakes.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0d0d15] p-4">
                <div className="mb-2 flex items-center gap-2 text-cyan-400">
                  <KeyRound size={14} />
                  <p className="text-xs font-black uppercase tracking-wider">API Hygiene</p>
                </div>
                <p className="text-sm text-gray-300">Use correct env keys and restart backend after edits.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0d0d15] p-4">
                <div className="mb-2 flex items-center gap-2 text-yellow-400">
                  <LineChart size={14} />
                  <p className="text-xs font-black uppercase tracking-wider">Execution Clarity</p>
                </div>
                <p className="text-sm text-gray-300">Read feed + ledger together for decision and settlement context.</p>
              </div>
            </div>
          </article>
        )}

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#0a0a11] p-6">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white">
            <ShieldCheck size={16} className="text-green-400" />
            API Entry Reminder
          </h3>
          <p className="mt-2 text-sm text-gray-400">
            Add your exchange credentials in <code>.env</code>, keep test/live mode correct, and restart backend so values apply.
            Dashboard showing LIVE status on all vaults is your final confirmation.
          </p>
        </section>
      </div>
    </div>
  );
};

export default Blog;
