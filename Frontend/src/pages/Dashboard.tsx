import React, { useState, useEffect, useRef, useCallback } from "react";
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

type ChatMessage = { role: "ai" | "user"; text: string };
type TradeRecord = {
  time: string;
  route: string;
  profit: string;
  pair?: string;
  mode?: string;
  status?: string;
  error?: string | null;
};
type ExchangeStatus = "LIVE" | "STALE" | "OFFLINE";
type PricePoint = { time: number; binance: number | null; bybit: number | null; coinbase: number | null };
type SpreadPoint = { time: number; binance_bybit: number; binance_coinbase: number; bybit_coinbase: number; best: number };
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
const DEFAULT_CHAT_MESSAGE: ChatMessage = {
  role: "ai",
  text: "Arbitrage Bot System Online. Monitoring cross-exchange liquidity.",
};

const Dashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const fallbackPollRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastMarketUpdateRef = useRef(0);

  const [botRunning, setBotRunning] = useState(false);
  const [chatOpen, setChatOpen] = useState(
    () => loadChatState(DASHBOARD_CHAT_KEY, [DEFAULT_CHAT_MESSAGE]).chatOpen
  );
  const [input, setInput] = useState(
    () => loadChatState(DASHBOARD_CHAT_KEY, [DEFAULT_CHAT_MESSAGE]).input
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => loadChatState(DASHBOARD_CHAT_KEY, [DEFAULT_CHAT_MESSAGE]).messages
  );

  const [marketData, setMarketData] = useState<SocketPayload | null>(null);
  const [spreadData, setSpreadData] = useState<SpreadPoint[]>([]);
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [tradeLog, setTradeLog] = useState<TradeRecord[]>([]);
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

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  }, [navigate]);

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
    const now = Date.now();

    setPriceData((prev) => [
      ...prev.slice(-119),
      {
        time: now,
        binance: binancePrice,
        bybit: bybitPrice,
        coinbase: coinbasePrice,
      },
    ]);

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
    setSpreadData((prev) => [
      ...prev.slice(-119),
      {
        time: now,
        binance_bybit: bb,
        binance_coinbase: bc,
        bybit_coinbase: yc,
        best: bestSpread,
      },
    ]);
  }, []);

  useEffect(() => {
    const fetchDatabaseHistory = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(apiUrl("/api/history"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return handleLogout();
        const data: { history?: TradeRecord[]; total_profit?: number } = await res.json();
        setTradeLog(data.history || []);
        setTotalProfit(data.total_profit || 0);
      } catch (e) {
        console.error("Failed to fetch history:", e);
      }
    };
    fetchDatabaseHistory();
  }, [handleLogout]);

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
          setMessages((prev) => [...prev.slice(-49), { role: "ai", text: data.text || "" }]);
          return;
        }

        if (data.type === "pending_trade") {
          if (data.trade) setPendingTrade(data.trade as PendingTrade);
          setApprovalModalOpen(true);
          return;
        }

        if (data.type === "trade") {
          if (data.trade) {
            setTradeLog((prev) => [data.trade as TradeRecord, ...prev]);
          }
          if (data.raw_profit !== undefined) setTotalProfit((p) => p + data.raw_profit);
          toast({
            title: "Arbitrage Executed",
            description: `${data.trade?.pair ?? "BTC/USDT"} | ${data.trade?.route ?? "ROUTE"} | ${data.trade?.profit ?? "$0.00"}`,
            className: "bg-green-500 text-black font-bold border-none shadow-[0_0_20px_rgba(34,197,94,0.4)]",
          });
          return;
        }

        if (data.type === "trade_failed") {
          if (data.trade) {
            setTradeLog((prev) => [data.trade as TradeRecord, ...prev]);
          }
          toast({
            title: "Trade Failed",
            description: `${data.trade?.pair ?? data.pair ?? "PAIR"} | ${data.error ?? data.trade?.error ?? "Execution failed"}`,
            variant: "destructive",
          });
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
  }, [applyMarketPayload, toast, handleLogout]);

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

      const data: { response?: string; provider?: "openai" | "offline" | "local" } = await res.json();
      if (data.response) {
        const providerLabel = String(data.provider || "offline").toUpperCase();
        const finalText = `Source: ${providerLabel}\n${data.response || ""}`;
        setMessages((prev) => [...prev.slice(-49), { role: "ai", text: finalText }]);
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

  useEffect(() => {
    saveChatState(DASHBOARD_CHAT_KEY, { messages, chatOpen, input });
  }, [messages, chatOpen, input]);

  const toggleBot = async () => {
    const token = localStorage.getItem("token");
    const newState = !botRunning;
    try {
      setBotRunning(newState);
      await fetch(apiUrl("/toggle_bot"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: newState }),
      });
    } catch (e) {
      setBotRunning(!newState);
      toast({ title: "System Offline", description: "Could not reach trading engine.", variant: "destructive" });
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
      await fetch(apiUrl("/api/trade/approve"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision: approved ? "APPROVE" : "REJECT" }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const grandTotal = binanceBalance + bybitBalance + coinbaseBalance + totalProfit;
  const bestPairLabel = marketData?.best_pair
    ? `${String(marketData.best_pair.buy_exchange || "N/A")} -> ${String(marketData.best_pair.sell_exchange || "N/A")}`
    : "NO ROUTE";

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
        <div className="w-11 h-11 bg-gradient-to-br from-green-400 to-green-700 rounded-2xl flex items-center justify-center font-black text-xl text-black shadow-[0_0_25px_rgba(34,197,94,0.4)] hover:scale-105 transition-transform cursor-pointer">A</div>
        <nav className="flex flex-col gap-8 text-gray-600">
          <Tooltip><TooltipTrigger asChild><button className="p-3 text-green-500 bg-green-500/10 rounded-xl shadow-[inset_0_0_10px_rgba(34,197,94,0.1)]"><LayoutDashboard size={22} /></button></TooltipTrigger><TooltipContent side="right">Market Dashboard</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button className="p-3 hover:text-gray-300 transition-colors"><Activity size={22} /></button></TooltipTrigger><TooltipContent side="right">Execution Feed</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button className="p-3 hover:text-gray-300 transition-colors"><Database size={22} /></button></TooltipTrigger><TooltipContent side="right">Database Status</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button onClick={() => navigate("/blog")} className="p-3 hover:text-green-500 hover:bg-green-500/5 rounded-xl transition-all"><BookOpen size={22} /></button></TooltipTrigger><TooltipContent side="right">Internal Blog</TooltipContent></Tooltip>
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

        <div className="flex-shrink-0 mb-8">
          <ExecutionLedger tradeLog={tradeLog} />
        </div>
      </main>

      <Sidebar
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
        messages={messages}
        input={input}
        setInput={setInput}
        handleSend={handleSend}
        chatEndRef={chatEndRef}
      />
    </div>
  );
};

export default Dashboard;
