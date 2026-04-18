import React, { startTransition, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutDashboard,
  Activity,
  Database,
  BookOpen,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import Header from "@/components/dashboard/Header";
import PortfolioMetrics from "@/components/dashboard/PortfolioMetrics";
import OracleFeeds from "@/components/dashboard/OracleFeeds";
import ChartSection from "@/components/dashboard/ChartSection";
import ExecutionLedger from "@/components/dashboard/ExecutionLedger";
import Sidebar from "@/components/dashboard/Sidebar";
import TradeApprovalModal from "@/components/TradeApprovalModal";
import { apiUrl, wsUrl } from "@/lib/api";
import { loadChatState, saveChatState } from "@/lib/chatStorage";
import { loadChartState, saveChartState } from "@/lib/chartStorage";

type ChatMessage = { role: "ai" | "user"; text: string };
type DashboardPage = "overview" | "activity" | "database";
type TradeRecord = {
  time: string;
  timestamp?: string;
  route: string;
  profit: string;
  pair?: string;
  buy_exchange?: string;
  sell_exchange?: string;
  spread_pct?: number;
  gross_profit?: string;
  gross_profit_value?: number;
  fees?: string;
  fees_value?: number;
  net_profit?: string;
  net_profit_value?: number;
  mode?: string;
  status?: string;
  status_raw?: string;
  error?: string | null;
};
type LedgerFilters = {
  date: string;
  day: string;
  status: string;
  pair: string;
};
type HistoryResponse = {
  history?: TradeRecord[];
  total_profit?: number;
  pair_options?: string[];
  summary?: LedgerSummary;
};
type LedgerSummary = {
  total_records: number;
  successful_trades: number;
  failed_trades: number;
  success_rate: number;
  total_gross_profit: number;
  total_fees: number;
  total_net_profit: number;
  top_pair: string;
  top_route: string;
  applied_filters: LedgerFilters;
  generated_at: string;
};
type ExchangeStatus = "LIVE" | "STALE" | "OFFLINE";
type PricePoint = { time: number; binance: number | null; bybit: number | null; coinbase: number | null };
type SpreadPoint = { time: number; binance_bybit: number; binance_coinbase: number; bybit_coinbase: number; best: number };
type ChartSnapshot = {
  binance: number | null;
  bybit: number | null;
  coinbase: number | null;
  binance_bybit: number;
  binance_coinbase: number;
  bybit_coinbase: number;
  best: number;
};
type PendingTrade = {
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  predictedProfit: number;
};
type PairSpreadRow = {
  pair?: string;
  spread?: number;
  buy_exchange?: string;
  sell_exchange?: string;
};
type SocketPayload = {
  type?: string;
  text?: string;
  trade?: TradeRecord;
  raw_profit?: number;
  bot_active?: boolean;
  error?: string;
  pair?: string;
  route?: string;
  profit?: string;
  binance?: number;
  bybit?: number;
  coinbase?: number;
  spread?: number;
  binance_bal?: number;
  bybit_bal?: number;
  coinbase_bal?: number;
  binance_btc?: number;
  bybit_btc?: number;
  coinbase_btc?: number;
  total_btc?: number;
  binance_bal_status?: ExchangeStatus;
  bybit_bal_status?: ExchangeStatus;
  coinbase_bal_status?: ExchangeStatus;
  binance_bal_error?: string | null;
  bybit_bal_error?: string | null;
  coinbase_bal_error?: string | null;
  binance_bal_warning?: string | null;
  bybit_bal_warning?: string | null;
  coinbase_bal_warning?: string | null;
  binance_bal_asset?: string | null;
  bybit_bal_asset?: string | null;
  coinbase_bal_asset?: string | null;
  latency?: number;
  status?: string;
  opportunity?: boolean;
  live_exchange_count?: number;
  prices?: Record<string, number>;
  price_statuses?: Record<string, ExchangeStatus>;
  balances?: Record<string, number>;
  btc_balances?: Record<string, number>;
  btc_statuses?: Record<string, ExchangeStatus>;
  btc_errors?: Record<string, string | null>;
  balance_statuses?: Record<string, ExchangeStatus>;
  balance_warnings?: Record<string, string | null>;
  balance_assets?: Record<string, string | null>;
  pair_spreads?: PairSpreadRow[];
  best_pair?: PairSpreadRow | null;
};

const DASHBOARD_CHAT_KEY = "arbpro_dashboard_chat_v1";
const DASHBOARD_SYSTEM_FEED_KEY = "arbpro_dashboard_system_feed_v1";
const DASHBOARD_CHART_KEY = "arbpro_dashboard_chart_v1";
const DEFAULT_CHAT_MESSAGE: ChatMessage = {
  role: "ai",
  text: "Welcome. Ask about crypto trends, prices, or your local trade history.",
};
const DEFAULT_SYSTEM_FEED: ChatMessage = {
  role: "ai",
  text: "Execution feed online. Live trading events and engine decisions appear here.",
};
const DEFAULT_LEDGER_FILTERS: LedgerFilters = {
  date: "",
  day: "ALL",
  status: "ALL",
  pair: "ALL",
};
const EMPTY_LEDGER_SUMMARY: LedgerSummary = {
  total_records: 0,
  successful_trades: 0,
  failed_trades: 0,
  success_rate: 0,
  total_gross_profit: 0,
  total_fees: 0,
  total_net_profit: 0,
  top_pair: "N/A",
  top_route: "N/A",
  applied_filters: DEFAULT_LEDGER_FILTERS,
  generated_at: "",
};

const decodeTokenUsername = (token: string | null): string => {
  if (!token) return "";
  try {
    const base64 = token.split(".")[1] || "";
    const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(padded)) as { sub?: string };
    return String(payload.sub || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

const resolveSessionUsername = () => {
  const stored = String(localStorage.getItem("username") || "").trim().toLowerCase();
  if (stored) return stored;
  const decoded = decodeTokenUsername(localStorage.getItem("token"));
  if (decoded) {
    localStorage.setItem("username", decoded);
    return decoded;
  }
  return "anonymous";
};

const formatExecutionModeLabel = (mode?: string) => {
  const normalized = String(mode || "LIVE").trim().toUpperCase();
  if (normalized === "COINBASE_PAPER") {
    return "Coinbase";
  }
  return normalized;
};

const Dashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const sessionUsername = resolveSessionUsername();
  const dashboardChatKey = `${DASHBOARD_CHAT_KEY}_${sessionUsername}`;
  const dashboardSystemFeedKey = `${DASHBOARD_SYSTEM_FEED_KEY}_${sessionUsername}`;
  const dashboardChartKey = `${DASHBOARD_CHART_KEY}_${sessionUsername}`;
  const chatEndRef = useRef<HTMLDivElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const fallbackPollRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastMarketUpdateRef = useRef(0);
  const initialChartsRef = useRef(loadChartState(dashboardChartKey));
  const ledgerFiltersRef = useRef<LedgerFilters>(DEFAULT_LEDGER_FILTERS);

  const [botRunning, setBotRunning] = useState(false);
  const [chatOpen, setChatOpen] = useState(
    () => loadChatState(dashboardChatKey, [DEFAULT_CHAT_MESSAGE]).chatOpen
  );
  const [input, setInput] = useState(
    () => loadChatState(dashboardChatKey, [DEFAULT_CHAT_MESSAGE]).input
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => loadChatState(dashboardChatKey, [DEFAULT_CHAT_MESSAGE]).messages
  );
  const [systemFeed, setSystemFeed] = useState<ChatMessage[]>(
    () => loadChatState(dashboardSystemFeedKey, [DEFAULT_SYSTEM_FEED]).messages
  );

  const [marketData, setMarketData] = useState<SocketPayload | null>(null);
  const [spreadData, setSpreadData] = useState<SpreadPoint[]>(() => initialChartsRef.current.spreadData);
  const [priceData, setPriceData] = useState<PricePoint[]>(() => initialChartsRef.current.priceData);
  const [tradeLog, setTradeLog] = useState<TradeRecord[]>([]);
  const [activityTradeLog, setActivityTradeLog] = useState<TradeRecord[]>([]);
  const [databaseSummary, setDatabaseSummary] = useState<LedgerSummary>(EMPTY_LEDGER_SUMMARY);
  const [totalProfit, setTotalProfit] = useState(0.0);
  const [binanceBalance, setBinanceBalance] = useState(0.0);
  const [bybitBalance, setBybitBalance] = useState(0.0);
  const [coinbaseBalance, setCoinbaseBalance] = useState(0.0);
  const [binanceBtc, setBinanceBtc] = useState(0.0);
  const [bybitBtc, setBybitBtc] = useState(0.0);
  const [coinbaseBtc, setCoinbaseBtc] = useState(0.0);
  const [binanceBalStatus, setBinanceBalStatus] = useState<ExchangeStatus>("OFFLINE");
  const [bybitBalStatus, setBybitBalStatus] = useState<ExchangeStatus>("OFFLINE");
  const [coinbaseBalStatus, setCoinbaseBalStatus] = useState<ExchangeStatus>("OFFLINE");
  const [binanceBalAsset, setBinanceBalAsset] = useState<string>("USDT");
  const [bybitBalAsset, setBybitBalAsset] = useState<string>("USDT");
  const [coinbaseBalAsset, setCoinbaseBalAsset] = useState<string>("USDT");
  const [binanceBalWarning, setBinanceBalWarning] = useState<string | null>(null);
  const [bybitBalWarning, setBybitBalWarning] = useState<string | null>(null);
  const [coinbaseBalWarning, setCoinbaseBalWarning] = useState<string | null>(null);
  const [pendingTrade, setPendingTrade] = useState<PendingTrade | null>(null);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [threshold, setThreshold] = useState(0.08);
  const [activePage, setActivePage] = useState<DashboardPage>("overview");
  const [ledgerFilters, setLedgerFilters] = useState<LedgerFilters>(DEFAULT_LEDGER_FILTERS);
  const [pairOptions, setPairOptions] = useState<string[]>([]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    navigate("/login", { replace: true });
  }, [navigate]);

  const fetchTradeHistory = useCallback(
    async (filters: LedgerFilters) => {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      params.set("limit", "500");
      if (filters.date) params.set("date", filters.date);
      if (filters.day && filters.day !== "ALL") params.set("day", filters.day);
      if (filters.status && filters.status !== "ALL") params.set("status", filters.status);
      if (filters.pair && filters.pair !== "ALL") params.set("pair", filters.pair);

      const query = params.toString();
      try {
        const res = await fetch(apiUrl(`/api/history${query ? `?${query}` : ""}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          handleLogout();
          return;
        }
        const data: HistoryResponse = await res.json();
        setTradeLog(data.history || []);
        setTotalProfit(data.total_profit || 0);
        setPairOptions(data.pair_options || []);
        setDatabaseSummary(data.summary || EMPTY_LEDGER_SUMMARY);
      } catch (e) {
        console.error("Failed to fetch history:", e);
      }
    },
    [handleLogout],
  );

  const fetchRecentActivityHistory = useCallback(async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(apiUrl("/api/history?limit=24"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        handleLogout();
        return;
      }
      const data: HistoryResponse = await res.json();
      setActivityTradeLog(data.history || []);
      setTotalProfit(data.total_profit || 0);
    } catch (e) {
      console.error("Failed to fetch recent activity history:", e);
    }
  }, [handleLogout]);

  const applyMarketPayload = useCallback((data: SocketPayload) => {
    setMarketData(data);
    lastMarketUpdateRef.current = Date.now();
    if (data.bot_active !== undefined) {
      setBotRunning(Boolean(data.bot_active));
    }

    const balances = data.balances || {};
    const btcBalances = data.btc_balances || {};
    const statuses = data.balance_statuses || {};
    const warnings = data.balance_warnings || {};
    const assets = data.balance_assets || {};

    if (data.binance_bal !== undefined || balances.binance !== undefined) {
      setBinanceBalance(Number(balances.binance ?? data.binance_bal ?? 0));
    }
    if (data.bybit_bal !== undefined || balances.bybit !== undefined) {
      setBybitBalance(Number(balances.bybit ?? data.bybit_bal ?? 0));
    }
    if (data.coinbase_bal !== undefined || balances.coinbase !== undefined) {
      setCoinbaseBalance(Number(balances.coinbase ?? data.coinbase_bal ?? 0));
    }
    if (data.binance_btc !== undefined || btcBalances.binance !== undefined) {
      setBinanceBtc(Number(btcBalances.binance ?? data.binance_btc ?? 0));
    }
    if (data.bybit_btc !== undefined || btcBalances.bybit !== undefined) {
      setBybitBtc(Number(btcBalances.bybit ?? data.bybit_btc ?? 0));
    }
    if (data.coinbase_btc !== undefined || btcBalances.coinbase !== undefined) {
      setCoinbaseBtc(Number(btcBalances.coinbase ?? data.coinbase_btc ?? 0));
    }

    if (data.binance_bal_status || statuses.binance) {
      setBinanceBalStatus((statuses.binance ?? data.binance_bal_status ?? "OFFLINE") as ExchangeStatus);
    }
    if (data.bybit_bal_status || statuses.bybit) {
      setBybitBalStatus((statuses.bybit ?? data.bybit_bal_status ?? "OFFLINE") as ExchangeStatus);
    }
    if (data.coinbase_bal_status || statuses.coinbase) {
      setCoinbaseBalStatus((statuses.coinbase ?? data.coinbase_bal_status ?? "OFFLINE") as ExchangeStatus);
    }
    if (data.binance_bal_asset !== undefined || assets.binance !== undefined) {
      setBinanceBalAsset(String(assets.binance ?? data.binance_bal_asset ?? "USDT"));
    }
    if (data.bybit_bal_asset !== undefined || assets.bybit !== undefined) {
      setBybitBalAsset(String(assets.bybit ?? data.bybit_bal_asset ?? "USDT"));
    }
    if (data.coinbase_bal_asset !== undefined || assets.coinbase !== undefined) {
      setCoinbaseBalAsset(String(assets.coinbase ?? data.coinbase_bal_asset ?? "USDT"));
    }
    if (data.binance_bal_warning !== undefined || warnings.binance !== undefined) {
      setBinanceBalWarning((warnings.binance ?? data.binance_bal_warning ?? null) as string | null);
    }
    if (data.bybit_bal_warning !== undefined || warnings.bybit !== undefined) {
      setBybitBalWarning((warnings.bybit ?? data.bybit_bal_warning ?? null) as string | null);
    }
    if (data.coinbase_bal_warning !== undefined || warnings.coinbase !== undefined) {
      setCoinbaseBalWarning((warnings.coinbase ?? data.coinbase_bal_warning ?? null) as string | null);
    }

    const prices = data.prices || {};
    const priceStatuses = data.price_statuses || {};
    const resolvePriceForChart = (exchangeKey: "binance" | "bybit" | "coinbase", fallbackVal?: number) => {
      const status = String(priceStatuses[exchangeKey] || "").toUpperCase();
      const rawVal = Number(prices[exchangeKey] ?? fallbackVal ?? 0);
      if (!Number.isFinite(rawVal) || rawVal <= 0) return null;
      if (status === "OFFLINE") return null;
      return rawVal;
    };
    const binancePrice = resolvePriceForChart("binance", data.binance);
    const bybitPrice = resolvePriceForChart("bybit", data.bybit);
    const coinbasePrice = resolvePriceForChart("coinbase", data.coinbase);

    let bb = 0;
    let bc = 0;
    let yc = 0;
    (data.pair_spreads || []).forEach((row) => {
      const key = String(row.pair || "").toUpperCase();
      const spread = Number(row.spread || 0);
      if (key === "BINANCE-BYBIT" || key === "BYBIT-BINANCE") bb = spread;
      if (key === "BINANCE-COINBASE" || key === "COINBASE-BINANCE") bc = spread;
      if (key === "BYBIT-COINBASE" || key === "COINBASE-BYBIT") yc = spread;
    });

    const bestSpread = Number(data.spread || data.best_pair?.spread || 0);
    const chartSnapshot: ChartSnapshot = {
      binance: binancePrice,
      bybit: bybitPrice,
      coinbase: coinbasePrice,
      binance_bybit: bb,
      binance_coinbase: bc,
      bybit_coinbase: yc,
      best: bestSpread,
    };
    const now = Date.now();
    startTransition(() => {
      setPriceData((prev) => [
        ...prev.slice(-119),
        {
          time: now,
          binance: chartSnapshot.binance,
          bybit: chartSnapshot.bybit,
          coinbase: chartSnapshot.coinbase,
        },
      ]);

      setSpreadData((prev) => [
        ...prev.slice(-119),
        {
          time: now,
          binance_bybit: chartSnapshot.binance_bybit,
          binance_coinbase: chartSnapshot.binance_coinbase,
          bybit_coinbase: chartSnapshot.bybit_coinbase,
          best: chartSnapshot.best,
        },
      ]);
    });
  }, []);

  useEffect(() => {
    ledgerFiltersRef.current = ledgerFilters;
  }, [ledgerFilters]);

  useEffect(() => {
    fetchTradeHistory(ledgerFilters);
  }, [fetchTradeHistory, ledgerFilters]);

  useEffect(() => {
    fetchRecentActivityHistory();
  }, [fetchRecentActivityHistory]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    let isDisposed = false;

    const clearTimer = (ref: React.MutableRefObject<number | null>) => {
      if (ref.current !== null) {
        window.clearTimeout(ref.current);
        ref.current = null;
      }
    };

    const clearIntervalTimer = (ref: React.MutableRefObject<number | null>) => {
      if (ref.current !== null) {
        window.clearInterval(ref.current);
        ref.current = null;
      }
    };

    const stopHeartbeat = () => clearIntervalTimer(heartbeatTimerRef);
    const stopReconnectTimer = () => clearTimer(reconnectTimerRef);

    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeatTimerRef.current = window.setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send("ping");
          } catch (err) {
            console.error("WebSocket heartbeat failed:", err);
          }
        }
      }, 15000);
    };

    const fetchMarketSnapshot = async () => {
      try {
        const res = await fetch(apiUrl("/api/market-snapshot"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          handleLogout();
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as SocketPayload;
        if (data.type === "market") {
          applyMarketPayload(data);
        }
      } catch (err) {
        console.error("Snapshot fallback failed:", err);
      }
    };

    const scheduleReconnect = () => {
      if (isDisposed) return;
      stopReconnectTimer();
      const attempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = attempt;
      const delayMs = Math.min(10000, 1000 * attempt);
      reconnectTimerRef.current = window.setTimeout(() => {
        connectSocket();
      }, delayMs);
    };

    const connectSocket = () => {
      if (isDisposed) return;

      stopReconnectTimer();
      try {
        wsRef.current = new WebSocket(wsUrl("/ws/market", { token }));
      } catch (err) {
        console.error("WebSocket init failed:", err);
        scheduleReconnect();
        return;
      }

      const socket = wsRef.current;
      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
        startHeartbeat();
        fetchMarketSnapshot();
      };

      socket.onmessage = (event) => {
        let data: SocketPayload;
        try {
          data = JSON.parse(event.data) as SocketPayload;
        } catch (err) {
          console.error("Invalid websocket payload:", err);
          return;
        }

        if (data.type === "ai_msg") {
          setSystemFeed((prev) => [...prev.slice(-99), { role: "ai", text: data.text || "" }]);
          return;
        }

        if (data.type === "pending_trade") {
          if (data.trade) setPendingTrade(data.trade as PendingTrade);
          setApprovalModalOpen(true);
          return;
        }

        if (data.type === "trade") {
          if (data.trade) {
            setSystemFeed((prev) => [
              ...prev.slice(-99),
              {
                role: "ai",
                text:
                  `Trade Status: SUCCESS\n` +
                  `- Time: ${data.trade?.time ?? new Date().toLocaleTimeString()}\n` +
                  `- Pair: ${data.trade?.pair ?? "BTC/USDT"}\n` +
                  `- Route: ${data.trade?.route ?? "N/A"}\n` +
                  `- Mode: ${formatExecutionModeLabel(data.trade?.mode)}\n` +
                  `- Settlement: ${data.trade?.profit ?? "$0.00"}`,
              },
            ]);
          }
          if (data.raw_profit !== undefined) setTotalProfit((p) => p + data.raw_profit);
          fetchTradeHistory(ledgerFiltersRef.current);
          fetchRecentActivityHistory();
          toast({
            title: "Arbitrage Executed",
            description: `${data.trade?.pair ?? "BTC/USDT"} | ${data.trade?.route ?? "ROUTE"} | ${data.trade?.profit ?? "$0.00"}`,
            className: "bg-green-500 text-black font-bold border-none shadow-[0_0_20px_rgba(34,197,94,0.4)]",
          });
          return;
        }

        if (data.type === "trade_failed") {
          const failurePair = data.trade?.pair ?? data.pair ?? "BTC/USDT";
          const failureRoute = data.trade?.route ?? data.route ?? "N/A";
          const failureReason = data.error ?? data.trade?.error ?? "Execution failed";

          setSystemFeed((prev) => [
            ...prev.slice(-99),
            {
              role: "ai",
              text:
                `Trade Status: FAILED\n` +
                `- Time: ${data.trade?.time ?? new Date().toLocaleTimeString()}\n` +
                `- Pair: ${failurePair}\n` +
                `- Route: ${failureRoute}\n` +
                `- Reason: ${failureReason}`,
              },
            ]);
          toast({
            title: "Trade Failed",
            description: `${failurePair} | ${failureReason}`,
            variant: "destructive",
          });
          fetchTradeHistory(ledgerFiltersRef.current);
          fetchRecentActivityHistory();
          return;
        }

        if (data.type === "trade_blocked") {
          const blockedPair = data.trade?.pair ?? data.pair ?? "BTC/USDT";
          const blockedRoute = data.trade?.route ?? data.route ?? "N/A";
          const blockedReason = data.error ?? data.trade?.error ?? "Trade blocked";

          setSystemFeed((prev) => [
            ...prev.slice(-99),
            {
              role: "ai",
              text:
                `Trade Status: BLOCKED\n` +
                `- Time: ${data.trade?.time ?? new Date().toLocaleTimeString()}\n` +
                `- Pair: ${blockedPair}\n` +
                `- Route: ${blockedRoute}\n` +
                `- Reason: ${blockedReason}`,
            },
          ]);
          fetchTradeHistory(ledgerFiltersRef.current);
          fetchRecentActivityHistory();
          return;
        }

        if (data.type !== "market") return;
        applyMarketPayload(data);
      };

      socket.onerror = () => {
        console.error("WebSocket error");
      };

      socket.onclose = (event) => {
        stopHeartbeat();
        if (isDisposed) return;
        if (event.code === 1008) {
          handleLogout();
          return;
        }
        scheduleReconnect();
      };
    };

    // Initial data warmup for charts if websocket opens late.
    fetchMarketSnapshot();
    connectSocket();

    fallbackPollRef.current = window.setInterval(() => {
      const staleForMs = Date.now() - lastMarketUpdateRef.current;
      const socketReady = wsRef.current?.readyState === WebSocket.OPEN;
      if (!socketReady || staleForMs > 3000) {
        fetchMarketSnapshot();
      }
    }, 1500);

    return () => {
      isDisposed = true;
      stopReconnectTimer();
      stopHeartbeat();
      clearIntervalTimer(fallbackPollRef);
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [applyMarketPayload, toast, handleLogout, fetchTradeHistory, fetchRecentActivityHistory]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages((prev) => [...prev.slice(-49), { role: "user", text: userMsg }]);
    setInput("");

    const token = localStorage.getItem("token");
    try {
      const res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: userMsg }),
      });

      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) {
        throw new Error(`Chat request failed with status ${res.status}`);
      }

      const data: { response?: string; provider?: "openai" | "offline" | "local" } = await res.json();
      if (data.response) {
        setMessages((prev) => [...prev.slice(-49), { role: "ai", text: data.response }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: "The analyst is currently tied up with market data. Please try again soon." },
        ]);
      }
    } catch (err) {
      console.error("Chat Error:", err);
      setMessages((prev) => [...prev, { role: "ai", text: "Network divergence detected. AI Core unreachable." }]);
    }
  };

  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);
  useEffect(() => feedEndRef.current?.scrollIntoView({ behavior: "smooth" }), [systemFeed]);

  useEffect(() => {
    saveChatState(dashboardChatKey, { messages, chatOpen, input });
  }, [messages, chatOpen, input, dashboardChatKey]);
  useEffect(() => {
    saveChatState(dashboardSystemFeedKey, { messages: systemFeed, chatOpen, input: "" });
  }, [systemFeed, chatOpen, dashboardSystemFeedKey]);
  useEffect(() => {
    saveChartState(dashboardChartKey, { spreadData, priceData });
  }, [spreadData, priceData, dashboardChartKey]);

  const toggleBot = async () => {
    const token = localStorage.getItem("token");
    const newState = !botRunning;
    try {
      setBotRunning(newState);
      const res = await fetch(apiUrl("/toggle_bot"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: newState }),
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(data.detail || "Could not update bot state.");
      }
    } catch (e) {
      setBotRunning(!newState);
      toast({
        title: "Bot Control Blocked",
        description: e instanceof Error ? e.message : "Could not reach trading engine.",
        variant: "destructive",
      });
    }
  };

  const handleThresholdChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const token = localStorage.getItem("token");
    const newVal = parseFloat(e.target.value);
    setThreshold(newVal);
    try {
      await fetch(apiUrl("/api/threshold"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ threshold: newVal }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleTradeApproval = async (approved: boolean) => {
    const token = localStorage.getItem("token");
    setApprovalModalOpen(false);
    setPendingTrade(null);
    try {
      const res = await fetch(apiUrl("/api/trade/approve"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision: approved ? "APPROVE" : "REJECT" }),
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(data.detail || "Trade approval failed.");
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Approval Failed",
        description: err instanceof Error ? err.message : "Trade approval failed.",
        variant: "destructive",
      });
    }
  };

  const clearLedgerFilters = () => {
    setLedgerFilters(DEFAULT_LEDGER_FILTERS);
  };

  const grandTotal = binanceBalance + bybitBalance + coinbaseBalance + totalProfit;
  const bestPairLabel = marketData?.best_pair
    ? `${String(marketData.best_pair.buy_exchange || "N/A")} -> ${String(marketData.best_pair.sell_exchange || "N/A")}`
    : "NO ROUTE";
  const activityFailedTrades = activityTradeLog.filter((t) => {
    const status = String(t.status || "").toUpperCase();
    return status === "FAILED" || status === "BLOCKED";
  }).length;
  const activitySuccessTrades = activityTradeLog.filter((t) => String(t.status || "").toUpperCase() === "SUCCESSFUL").length;
  const latestTrade = activityTradeLog[0] || null;
  const summaryFilters = [
    databaseSummary.applied_filters.date ? `Date: ${databaseSummary.applied_filters.date}` : "",
    databaseSummary.applied_filters.day !== "ALL" ? `Day: ${databaseSummary.applied_filters.day}` : "",
    databaseSummary.applied_filters.status !== "ALL" ? `Status: ${databaseSummary.applied_filters.status}` : "",
    databaseSummary.applied_filters.pair !== "ALL" ? `Pair: ${databaseSummary.applied_filters.pair}` : "",
  ].filter(Boolean);

  const formatMoney = (value: number) => `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;

  const downloadSummary = () => {
    const lines = [
      "ArbitrageBot Database Summary",
      `User: ${sessionUsername}`,
      `Generated At: ${databaseSummary.generated_at || new Date().toLocaleString()}`,
      `Applied Filters: ${summaryFilters.length ? summaryFilters.join(" | ") : "None"}`,
      "",
      `Total Records: ${databaseSummary.total_records}`,
      `Successful Trades: ${databaseSummary.successful_trades}`,
      `Failed Trades: ${databaseSummary.failed_trades}`,
      `Success Rate: ${databaseSummary.success_rate.toFixed(2)}%`,
      `Total Gross Profit: ${formatMoney(databaseSummary.total_gross_profit)}`,
      `Total Fees: ${formatMoney(-Math.abs(databaseSummary.total_fees))}`,
      `Total Net Profit: ${formatMoney(databaseSummary.total_net_profit)}`,
      `Top Pair: ${databaseSummary.top_pair}`,
      `Top Route: ${databaseSummary.top_route}`,
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = (databaseSummary.generated_at || new Date().toISOString()).replace(/[: ]/g, "-");
    link.href = url;
    link.download = `arbitrage-summary-${stamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen w-full bg-[#050505] text-gray-200 overflow-hidden font-sans relative">
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-green-500/5 blur-[120px] rounded-full"></div>
      </div>

      {pendingTrade && (
        <TradeApprovalModal
          isOpen={approvalModalOpen}
          onApprove={() => handleTradeApproval(true)}
          onReject={() => handleTradeApproval(false)}
          {...pendingTrade}
        />
      )}

      <aside className="w-20 border-r border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl flex flex-col items-center py-8 gap-8 z-20">
        <div
          onClick={() => navigate("/dashboard")}
          className="w-11 h-11 bg-gradient-to-br from-green-400 to-green-700 rounded-2xl flex items-center justify-center font-black text-xl text-black shadow-[0_0_25px_rgba(34,197,94,0.4)] hover:scale-105 transition-transform cursor-pointer"
        >
          A
        </div>
        <nav className="flex flex-col gap-8 text-gray-600">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setActivePage("overview")}
                className={`p-3 rounded-xl transition-colors ${
                  activePage === "overview"
                    ? "text-green-500 bg-green-500/10 shadow-[inset_0_0_10px_rgba(34,197,94,0.1)]"
                    : "hover:text-gray-300"
                }`}
              >
                <LayoutDashboard size={22} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Overview</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setActivePage("activity")}
                className={`p-3 rounded-xl transition-colors ${
                  activePage === "activity" ? "text-cyan-300 bg-cyan-500/10" : "hover:text-gray-300"
                }`}
              >
                <Activity size={22} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Activity</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setActivePage("database")}
                className={`p-3 rounded-xl transition-colors ${
                  activePage === "database" ? "text-yellow-300 bg-yellow-500/10" : "hover:text-gray-300"
                }`}
              >
                <Database size={22} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Database</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => navigate("/blog")} className="p-3 hover:text-green-500 hover:bg-green-500/5 rounded-xl transition-all">
                <BookOpen size={22} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Guides & Blog</TooltipContent>
          </Tooltip>
        </nav>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto flex flex-col gap-8 scrollbar-hide z-10">
        <Header
          botRunning={botRunning}
          status={marketData?.status || "INITIALIZING..."}
          latency={marketData?.latency || 0}
          liveExchangeCount={marketData?.live_exchange_count || 0}
          toggleBot={toggleBot}
          handleLogout={handleLogout}
        />

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-black text-gray-500">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {activePage === "overview" ? "Overview" : activePage === "activity" ? "Activity Center" : "Database Center"}
        </div>

        {activePage === "overview" && (
          <>
            <div className="flex-shrink-0">
              <PortfolioMetrics
                grandTotal={grandTotal}
                totalProfit={totalProfit}
                binanceBalance={binanceBalance}
                bybitBalance={bybitBalance}
                coinbaseBalance={coinbaseBalance}
                binanceBtc={binanceBtc}
                bybitBtc={bybitBtc}
                coinbaseBtc={coinbaseBtc}
                binanceAsset={binanceBalAsset}
                bybitAsset={bybitBalAsset}
                coinbaseAsset={coinbaseBalAsset}
                binanceStatus={binanceBalStatus}
                bybitStatus={bybitBalStatus}
                coinbaseStatus={coinbaseBalStatus}
                binanceWarning={binanceBalWarning}
                bybitWarning={bybitBalWarning}
                coinbaseWarning={coinbaseBalWarning}
              />
            </div>

            <div className="bg-[#0a0a0c]/40 border border-white/5 rounded-[2.5rem] p-8 shadow-2xl backdrop-blur-md relative overflow-hidden flex-shrink-0">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/20 to-transparent"></div>

              <OracleFeeds
                binancePrice={marketData?.binance || 0}
                bybitPrice={marketData?.bybit || 0}
                coinbasePrice={marketData?.coinbase || 0}
                spread={marketData?.spread || 0}
                opportunity={marketData?.opportunity || false}
                threshold={threshold}
                liveExchangeCount={marketData?.live_exchange_count || 0}
                bestPairLabel={bestPairLabel}
                handleThresholdChange={handleThresholdChange}
              />

              <ChartSection spreadData={spreadData} priceData={priceData} threshold={threshold} />
            </div>
          </>
        )}

        {activePage === "activity" && (
          <div className="space-y-6">
            <section className="rounded-[1.5rem] border border-white/8 bg-[#0b0f14] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">Activity Snapshot</p>
                  <h3 className="mt-1 text-lg font-black text-white">Recent trade overview</h3>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-gray-300">
                  Live View
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <div className="rounded-xl border border-cyan-400/16 bg-[#0c1419] px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">Recent Trades</p>
                  <p className="mt-2 text-2xl font-black text-white">{activityTradeLog.length}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-400">Stored recent records.</p>
                </div>
                <div className="rounded-xl border border-green-400/16 bg-[#0d1610] px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-green-200/70">Success</p>
                  <p className="mt-2 text-2xl font-black text-green-300">{activitySuccessTrades}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-400">Positive completed trades.</p>
                </div>
                <div className="rounded-xl border border-red-400/16 bg-[#171012] px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-red-200/70">Failed</p>
                  <p className="mt-2 text-2xl font-black text-red-300">{activityFailedTrades}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-400">Failed or blocked trades.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0d1018] px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400">Live Route Radar</p>
                  <p className="mt-2 text-sm font-black leading-6 text-cyan-300">{bestPairLabel}</p>
                  <p className="mt-2 inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-gray-300">
                    {marketData?.status?.replaceAll("_", " ") || "INITIALIZING"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-[#0b0f14] overflow-hidden shadow-[0_20px_48px_rgba(0,0,0,0.24)]">
              <div className="px-6 py-4 border-b border-white/8 bg-[#11161d] flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">Recent Execution Stream</p>
                  <h3 className="mt-1 text-lg font-black text-white">Latest trading events</h3>
                </div>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200 font-black">
                  {activityTradeLog.length} recent
                </span>
              </div>

              <div className="overflow-y-auto max-h-[520px] scrollbar-hide">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-[#0b0f14]/95 backdrop-blur-md z-10">
                    <tr className="text-[10px] text-gray-600 uppercase tracking-[0.18em] font-black border-b border-white/5">
                      <th className="px-6 py-4">Timestamp</th>
                      <th className="px-6 py-4">Pair</th>
                      <th className="px-6 py-4">Buy</th>
                      <th className="px-6 py-4">Sell</th>
                      <th className="px-6 py-4 text-right">Spread</th>
                      <th className="px-6 py-4 text-right">Net Profit</th>
                      <th className="px-6 py-4">Route</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs font-mono">
                    {activityTradeLog.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-10 text-center text-gray-500">
                          No recent execution activity found.
                        </td>
                      </tr>
                    ) : (
                      activityTradeLog.map((trade, index) => {
                        const isSuccess = String(trade.status || "").toUpperCase() === "SUCCESSFUL";
                        const isBlocked = String(trade.status || "").toUpperCase() === "BLOCKED";
                        return (
                          <tr
                            key={`${trade.timestamp || trade.time}-${index}`}
                            className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="px-6 py-4 text-gray-400 align-top">{trade.timestamp || trade.time}</td>
                            <td className="px-6 py-4 align-top">
                              <div className="text-cyan-300">{trade.pair || "BTC/USDT"}</div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">
                                Trade {String(activityTradeLog.length - index).padStart(2, "0")}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-200 align-top">{trade.buy_exchange || "-"}</td>
                            <td className="px-6 py-4 text-gray-200 align-top">{trade.sell_exchange || "-"}</td>
                            <td className="px-6 py-4 text-right text-gray-100 align-top">{Number(trade.spread_pct || 0).toFixed(4)}%</td>
                            <td className={`px-6 py-4 text-right font-bold align-top ${isSuccess ? "text-green-300" : isBlocked ? "text-amber-300" : "text-red-300"}`}>
                              {trade.net_profit || trade.profit || "$0.00"}
                            </td>
                            <td className="px-6 py-4 text-cyan-200 align-top">{trade.route || "UNKNOWN_ROUTE"}</td>
                            <td className="px-6 py-4 align-top">
                              <span
                                className={`rounded-full border px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.16em] ${
                                  isSuccess
                                    ? "border-green-400/24 bg-green-500/10 text-green-200"
                                    : isBlocked
                                      ? "border-amber-400/24 bg-amber-500/10 text-amber-200"
                                      : "border-red-400/24 bg-red-500/10 text-red-200"
                                }`}
                              >
                                {trade.status || "FAILED"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {activePage === "database" && (
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-yellow-500/15 bg-[#0a0a11]/90 overflow-hidden shadow-2xl">
              <div className="px-6 py-5 border-b border-white/5 bg-[#111116]/80 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-yellow-100/70 font-black">Database Summary</p>
                  <h3 className="mt-1 text-xl font-black text-white">Filtered archive snapshot</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Summary updates from the same filters used by the ledger table below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadSummary}
                  className="rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-yellow-200 transition hover:border-yellow-400/40 hover:bg-yellow-500/15"
                >
                  Download Summary
                </button>
              </div>

              <div className="px-6 py-4 border-b border-white/5 bg-[#0d0d12]/80">
                <div className="flex flex-wrap gap-2">
                  {summaryFilters.length ? (
                    summaryFilters.map((item) => (
                      <span key={item} className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gray-300">
                      No filters applied
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-6">
                <div className="rounded-2xl border border-white/10 bg-[#0a0a11] p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Stored Trades</p>
                  <p className="mt-2 text-3xl font-black text-white">{databaseSummary.total_records}</p>
                  <p className="mt-1 text-xs text-gray-400">Rows currently matching the selected filters.</p>
                </div>
                <div className="rounded-2xl border border-green-500/15 bg-green-500/10 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-green-100/70 font-black">Success Rate</p>
                  <p className="mt-2 text-3xl font-black text-green-300">{databaseSummary.success_rate.toFixed(2)}%</p>
                  <p className="mt-1 text-xs text-green-50/70">
                    {databaseSummary.successful_trades} success / {databaseSummary.failed_trades} failed
                  </p>
                </div>
                <div className="rounded-2xl border border-yellow-500/15 bg-yellow-500/10 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-yellow-100/70 font-black">Gross Profit</p>
                  <p className="mt-2 text-3xl font-black text-yellow-200">{formatMoney(databaseSummary.total_gross_profit)}</p>
                  <p className="mt-1 text-xs text-yellow-50/70">Before deducting combined trading costs.</p>
                </div>
                <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/10 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/70 font-black">Net Profit</p>
                  <p className="mt-2 text-3xl font-black text-cyan-200">{formatMoney(databaseSummary.total_net_profit)}</p>
                  <p className="mt-1 text-xs text-cyan-50/70">Fees tracked: {formatMoney(-Math.abs(databaseSummary.total_fees))}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 pb-6">
                <div className="rounded-2xl border border-white/10 bg-[#0a0a11] p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Top Pair</p>
                  <p className="mt-2 text-xl font-black text-white">{databaseSummary.top_pair}</p>
                  <p className="mt-1 text-xs text-gray-400">Most frequent filtered pair in the archive snapshot.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0a0a11] p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Top Route</p>
                  <p className="mt-2 text-xl font-black text-cyan-300">{databaseSummary.top_route}</p>
                  <p className="mt-1 text-xs text-gray-400">Most frequent route among the matching records.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0a0a11] p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Summary Timestamp</p>
                  <p className="mt-2 text-lg font-black text-white">{databaseSummary.generated_at || "--"}</p>
                  <p className="mt-1 text-xs text-gray-400">Export uses this same filtered snapshot.</p>
                </div>
              </div>
            </div>
            <ExecutionLedger
              tradeLog={tradeLog}
              filters={ledgerFilters}
              setFilters={setLedgerFilters}
              pairOptions={pairOptions}
              onClearFilters={clearLedgerFilters}
            />
          </div>
        )}
      </main>

      <Sidebar
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
        chatMessages={messages}
        systemFeed={systemFeed}
        input={input}
        setInput={setInput}
        handleSend={handleSend}
        chatEndRef={chatEndRef}
        feedEndRef={feedEndRef}
      />
    </div>
  );
};

export default Dashboard;
