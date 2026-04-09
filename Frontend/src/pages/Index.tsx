import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Activity, Database, MessageSquare, Send, Bot as BotIcon,
  TrendingUp, Power, ChevronRight, SlidersHorizontal, LogOut, BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import TradeApprovalModal from "@/components/TradeApprovalModal";
import { useToast } from "@/hooks/use-toast";
import { apiUrl, wsUrl } from "@/lib/api";
import { loadChatState, saveChatState } from "@/lib/chatStorage";

// Removed unused SpreadChart and CandleChart imports to prevent build errors

type ChatMessage = { role: "ai" | "user"; text: string };
type SpreadPoint = { time: number; spread: number };
type OhlcPoint = { time: number; open: number; high: number; low: number; close: number };
type TradeRecord = { time: string; route: string; profit: string };
type PendingTrade = {
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  predictedProfit: number;
};
type SocketPayload = {
  type?: string;
  text?: string;
  trade?: TradeRecord;
  raw_profit?: number;
  binance?: number;
  bybit?: number;
  spread?: number;
  price?: number;
  candle?: Partial<OhlcPoint> & { time?: number };
  binance_bal?: number;
  bybit_bal?: number;
  binance_bal_status?: "LIVE" | "STALE" | "OFFLINE";
  bybit_bal_status?: "LIVE" | "STALE" | "OFFLINE";
  latency?: number;
  status?: string;
  opportunity?: boolean;
};

const INDEX_CHAT_KEY = "arbpro_index_chat_v1";
const DEFAULT_CHAT_MESSAGE: ChatMessage = {
  role: "ai",
  text: "Arbitrage Bot System Online. Monitoring cross-exchange liquidity.",
};

const Index = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [botRunning, setBotRunning] = useState(false);
  const [chatOpen, setChatOpen] = useState(
    () => loadChatState(INDEX_CHAT_KEY, [DEFAULT_CHAT_MESSAGE]).chatOpen
  );
  const [input, setInput] = useState(
    () => loadChatState(INDEX_CHAT_KEY, [DEFAULT_CHAT_MESSAGE]).input
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => loadChatState(INDEX_CHAT_KEY, [DEFAULT_CHAT_MESSAGE]).messages
  );
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [marketData, setMarketData] = useState<SocketPayload | null>(null);
  const [spreadData, setSpreadData] = useState<SpreadPoint[]>([]);
  const [ohlcData, setOhlcData] = useState<OhlcPoint[]>([]);
  const [tradeLog, setTradeLog] = useState<TradeRecord[]>([]);
  const [totalProfit, setTotalProfit] = useState(0.00);

  const [binanceBalance, setBinanceBalance] = useState(0.00);
  const [bybitBalance, setBybitBalance] = useState(0.00);
  const [binanceBalStatus, setBinanceBalStatus] = useState<"LIVE" | "STALE" | "OFFLINE">("OFFLINE");
  const [bybitBalStatus, setBybitBalStatus] = useState<"LIVE" | "STALE" | "OFFLINE">("OFFLINE");

  const [pendingTrade, setPendingTrade] = useState<PendingTrade | null>(null);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [threshold, setThreshold] = useState(0.08);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    const fetchDatabaseHistory = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(apiUrl("/api/history"), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return handleLogout();
        const data: { history?: TradeRecord[]; total_profit?: number } = await res.json();
        setTradeLog(data.history || []);
        setTotalProfit(data.total_profit || 0);
      } catch (e) {
        handleLogout();
      }
    };
    fetchDatabaseHistory();
  }, [handleLogout]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const socket = new WebSocket(wsUrl("/ws/market", { token }));

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as SocketPayload;

      if (data.type === "ai_msg") {
        setMessages(prev => [...prev, { role: 'ai', text: data.text }]);
      } else if (data.type === "pending_trade") {
        setPendingTrade(data.trade);
        setApprovalModalOpen(true);
      } else if (data.type === "trade") {
        if (data.trade) {
          setTradeLog(prev => [data.trade as TradeRecord, ...prev]);
        }
        if (data.raw_profit !== undefined) setTotalProfit(p => p + data.raw_profit);
        toast({ title: "Arbitrage Executed", description: `Captured: ${data.trade?.profit ?? "$0.00"}`, className: "bg-green-500 text-black font-bold border-none" });
      } else if (data.type === "market") {
        setMarketData(data);
        if (data.binance_bal !== undefined) setBinanceBalance(data.binance_bal);
        if (data.bybit_bal !== undefined) setBybitBalance(data.bybit_bal);
        if (data.binance_bal_status) setBinanceBalStatus(data.binance_bal_status);
        if (data.bybit_bal_status) setBybitBalStatus(data.bybit_bal_status);

        // 1. Bulletproof Spread Tracking (Keeps last 60 points)
        setSpreadData(prev => [...prev.slice(-59), {
          time: Date.now(),
          spread: Number(data.spread) || 0,
        }]);

        // 2. Failsafe OHLC Generator
        const currentPrice = Number(data.binance || data.price || 0);

        if (data.candle && !Array.isArray(data.candle) && data.candle.close !== undefined) {
          // If backend sends a perfect single candle object, use it
          setOhlcData(prev => [...prev.slice(-59), {
            time: Number(data.candle.time || Date.now()),
            open: Number(data.candle.open),
            high: Number(data.candle.high),
            low: Number(data.candle.low),
            close: Number(data.candle.close)
          }]);
        } else if (currentPrice > 0) {
          // AUTO-GENERATOR: Build live candles from the raw price feed
          setOhlcData(prev => {
            const now = Date.now();
            const lastCandle = prev[prev.length - 1];

            // Create a new candle every 3 seconds for smooth visual movement
            if (!lastCandle || (now - lastCandle.time > 3000)) {
              return [...prev.slice(-59), {
                time: now, open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice
              }];
            } else {
              // Update the current candle's wicks and close price
              const updated = {
                ...lastCandle,
                close: currentPrice,
                high: Math.max(lastCandle.high, currentPrice),
                low: Math.min(lastCandle.low, currentPrice)
              };
              return [...prev.slice(0, -1), updated];
            }
          });
        }
      }
    };

    socket.onclose = (event) => { if (event.code === 1008) handleLogout(); };
    socket.onerror = () => { handleLogout(); };
    return () => socket.close();
  }, [toast, handleLogout]);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: 'user', text: input }]);
    setInput("");
    setTimeout(() => {
      if (messages.length < 5) {
        setMessages(prev => [...prev, { role: 'ai', text: "Analyzing query against market depth... spread convergence detected at Binance node." }]);
      }
    }, 1000);
  };

  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  useEffect(() => {
    saveChatState(INDEX_CHAT_KEY, { messages, chatOpen, input });
  }, [messages, chatOpen, input]);

  const toggleBot = async () => {
    const token = localStorage.getItem('token');
    const newState = !botRunning;
    try {
      setBotRunning(newState);
      await fetch(apiUrl("/toggle_bot"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ active: newState }),
      });
    } catch (e) {
      setBotRunning(!newState);
      toast({ title: "System Offline", description: "Could not reach trading engine.", variant: "destructive" });
    }
  };

  const handleThresholdChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const token = localStorage.getItem('token');
    const newVal = parseFloat(e.target.value);
    setThreshold(newVal);
    try {
      await fetch(apiUrl("/api/threshold"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ threshold: newVal }),
      });
    } catch (err) { console.error(err); }
  };

  const handleTradeApproval = async (approved: boolean) => {
    const token = localStorage.getItem('token');
    setApprovalModalOpen(false);
    setPendingTrade(null);
    try {
      await fetch(apiUrl("/api/trade/approve"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ decision: approved ? "APPROVE" : "REJECT" }),
      });
    } catch (err) { console.error(err); }
  };

  if (!marketData) {
    return (
      <div className="h-screen bg-[#050505] flex flex-col items-center justify-center text-green-500 font-mono text-center px-4 relative">
        <div className="w-16 h-16 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin mb-6"></div>
        <p className="tracking-[0.4em] animate-pulse text-xs mb-2">ACCESSING NEURAL NETWORK...</p>
        <p className="tracking-[0.2em] text-[10px] text-gray-600 uppercase">Establishing Secure Arbitrage Link</p>
      </div>
    );
  }

  const grandTotal = binanceBalance + bybitBalance + totalProfit;

  return (
    <div className="flex h-screen w-full bg-[#050505] text-gray-200 overflow-hidden font-sans selection:bg-green-500/30 relative">

      {pendingTrade && (
        <TradeApprovalModal
          isOpen={approvalModalOpen}
          onApprove={() => handleTradeApproval(true)}
          onReject={() => handleTradeApproval(false)}
          {...pendingTrade}
        />
      )}

      {/* LEFT SIDEBAR */}
      <aside className="w-20 border-r border-white/5 bg-[#0a0a0c] flex flex-col items-center py-6 gap-8 z-10">
        <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-xl flex items-center justify-center font-black text-xl text-black shadow-[0_0_20px_rgba(34,197,94,0.3)]">A</div>
        <nav className="flex flex-col gap-6 text-gray-600">
          <Tooltip><TooltipTrigger asChild><button className="p-3 text-green-500 bg-green-500/10 rounded-xl"><LayoutDashboard size={20} /></button></TooltipTrigger><TooltipContent side="right">Dashboard</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button className="p-3 hover:text-gray-300"><Activity size={20} /></button></TooltipTrigger><TooltipContent side="right">Activity</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button className="p-3 hover:text-gray-300"><Database size={20} /></button></TooltipTrigger><TooltipContent side="right">Vault</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button onClick={() => navigate("/blog")} className="p-3 hover:text-green-500 hover:bg-green-500/10 rounded-xl transition-all"><BookOpen size={20} /></button></TooltipTrigger><TooltipContent side="right">Blog</TooltipContent></Tooltip>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-8 overflow-y-auto flex flex-col gap-8 scrollbar-hide">
        <header className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black tracking-tight text-white">Arbitrage Bot</h1>
              <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border ${botRunning ? 'border-green-500 text-green-500 bg-green-500/10 animate-pulse' : 'border-gray-600 text-gray-500 bg-gray-800/50'}`}>
                {marketData.status?.replace("_", " ") || "IDLE"}
              </span>
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Live Testnet Environment • Latency: {marketData.latency || 0}ms
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={toggleBot} className={`h-12 px-6 font-bold tracking-wide rounded-xl flex items-center gap-2 ${botRunning ? "bg-red-500/10 text-red-500 border border-red-500/50" : "bg-green-500 text-black hover:bg-green-400"}`}>
                  <Power size={18} /> {botRunning ? "HALT TRADING" : "ENGAGE ALGORITHM"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{botRunning ? "Stop bot" : "Start bot"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleLogout} className="h-12 px-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl flex items-center gap-2">
                  <LogOut size={18} /> Logout
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Safely terminate session</TooltipContent>
            </Tooltip>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-gradient-to-br from-[#111116] to-[#0a0a0c] border border-white/10 p-6 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 blur-[50px]"></div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-2">Net Account Equity</p>
            <h2 className="text-4xl font-black text-white mb-2">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-400 text-xs font-bold rounded-lg border border-green-500/20">
              <TrendingUp size={12} /> +${totalProfit.toFixed(2)} Profit
            </div>
          </div>
          <VaultCard name="Binance" color="text-yellow-500" bg="bg-yellow-500/10" balance={binanceBalance} icon="binance" status={binanceBalStatus} />
          <VaultCard name="Bybit" color="text-orange-500" bg="bg-orange-500/10" balance={bybitBalance} icon="bybit" status={bybitBalStatus} />
        </section>

        <section className="bg-[#0a0a0c] border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 relative overflow-hidden">
          <div className="grid grid-cols-4 gap-4 border-b border-white/10 pb-6">
            <div><p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Binance Oracle</p><p className="text-xl font-mono text-white font-black">${marketData.binance?.toLocaleString() || 0}</p></div>
            <div><p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Bybit Oracle</p><p className="text-xl font-mono text-white font-black">${marketData.bybit?.toLocaleString() || 0}</p></div>
            <div><p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Current Spread</p><p className={`text-xl font-mono font-black ${marketData.opportunity ? 'text-green-500' : 'text-gray-300'}`}>{(marketData.spread || 0).toFixed(3)}%</p></div>
            <div className="bg-[#111116] p-3 rounded-2xl border border-white/10 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-2"><p className="text-[10px] text-purple-400 uppercase font-bold flex items-center gap-1"><SlidersHorizontal size={10} /> Threshold</p><span className="text-xs font-mono font-bold text-white">{threshold.toFixed(2)}%</span></div>
              <input type="range" min="0.01" max="0.50" step="0.01" value={threshold} onChange={handleThresholdChange} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
            <div className="w-full flex flex-col gap-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-2 border-l-2 border-purple-500">Spread Analysis</h3>
              <div style={{ height: '300px' }} className="w-full bg-[#111116] border border-white/5 rounded-xl p-4 relative overflow-hidden flex items-end">
                {spreadData.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">Waiting for spread data...</div>
                ) : (
                  <div className="w-full h-full flex items-end gap-1">
                    {spreadData.map((d, i) => {
                      const heightPct = Math.min(100, Math.max(5, (d.spread / 0.5) * 100));
                      const isOverThreshold = d.spread >= threshold;
                      return (
                        <div key={i} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                          <div
                            style={{ height: `${heightPct}%` }}
                            className={`w-full rounded-t-sm transition-all duration-300 ${isOverThreshold ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-gray-700'}`}
                          ></div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div
                  className="absolute left-0 w-full border-t border-purple-500/50 border-dashed z-10 pointer-events-none"
                  style={{ bottom: `${Math.min(100, (threshold / 0.5) * 100)}%` }}
                >
                  <span className="absolute right-2 -top-4 text-[9px] text-purple-400 font-bold">Threshold {threshold}%</span>
                </div>
              </div>
            </div>

            <div className="w-full flex flex-col gap-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-2 border-l-2 border-yellow-500">Market Price Action</h3>
              <div style={{ height: '300px' }} className="w-full bg-[#111116] border border-white/5 rounded-xl p-4 relative overflow-hidden">
                {ohlcData.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">Awaiting market ticks...</div>
                ) : (
                  <div className="w-full h-full flex items-center justify-end gap-2 overflow-hidden">
                    {ohlcData.map((candle, i) => {
                      const min = Math.min(...ohlcData.map(c => c.low));
                      const max = Math.max(...ohlcData.map(c => c.high));
                      const range = max - min === 0 ? 1 : max - min;

                      const getH = (val: number) => Math.max(2, ((val - min) / range) * 100);

                      const isGreen = candle.close >= candle.open;
                      const color = isGreen ? 'bg-green-500' : 'bg-red-500';

                      const wickTop = Math.max(getH(candle.high), getH(Math.max(candle.open, candle.close)));
                      const wickBot = Math.min(getH(candle.low), getH(Math.min(candle.open, candle.close)));
                      const bodyTop = getH(Math.max(candle.open, candle.close));
                      const bodyBot = getH(Math.min(candle.open, candle.close));

                      return (
                        <div key={i} className="relative flex-1 max-w-[12px] h-full flex items-end">
                          <div className="absolute w-full h-full flex justify-center bottom-0">
                            <div className={`absolute w-[2px] ${color}`} style={{ bottom: `${wickBot}%`, height: `${wickTop - wickBot}%` }}></div>
                            <div className={`absolute w-full rounded-sm ${color}`} style={{ bottom: `${bodyBot}%`, height: `${Math.max(1, bodyTop - bodyBot)}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#0a0a0c] border border-white/5 rounded-2xl overflow-hidden flex-1 min-h-[250px]">
          <div className="px-6 py-4 border-b border-white/5 bg-[#111116] flex justify-between items-center">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Execution Ledger</h3>
            <span className="text-[10px] text-gray-600">{tradeLog.length} Records</span>
          </div>
          <div className="overflow-y-auto max-h-[300px]">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[#0a0a0c]/90 backdrop-blur-sm z-10">
                <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Route Path</th>
                  <th className="px-6 py-3 text-right">Profit (USD)</th>
                </tr>
              </thead>
              <tbody className="text-xs font-mono">
                {tradeLog.length === 0 ? (
                  <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-600 italic">No trades executed yet.</td></tr>
                ) : (
                  tradeLog.map((t, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-6 py-3 text-gray-500">{t.time}</td>
                      <td className="px-6 py-3 text-gray-300 flex items-center gap-2">{t.route}</td>
                      <td className="px-6 py-3 text-right text-green-500 font-bold">{t.profit}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <aside className={`${chatOpen ? 'w-[350px]' : 'w-16'} transition-all duration-300 border-l border-white/5 bg-[#0a0a0c] flex flex-col z-10`}>
        {chatOpen ? (
          <>
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-[#111116]">
              <div className="flex items-center gap-3"><div className="p-2 bg-purple-500/10 rounded-lg"><BotIcon size={16} className="text-purple-500" /></div><h3 className="font-bold text-sm text-gray-200">AI Logic Core</h3></div>
              <button onClick={() => setChatOpen(false)} className="text-gray-500 hover:text-white"><ChevronRight size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3.5 rounded-2xl text-[12px] ${m.role === 'user' ? 'bg-green-500 text-black' : 'bg-[#111116] border border-white/5 text-gray-300'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-4 border-t border-white/5 bg-[#111116]">
              <div className="flex gap-2 items-center bg-[#050505] border border-white/10 rounded-xl p-1 pr-2">
                <input value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} placeholder="Ask AI Core..." className="flex-1 bg-transparent px-3 py-2 text-xs text-white outline-none" />
                <button onClick={handleSend} className="p-2 bg-purple-500/20 text-purple-400 rounded-lg"><Send size={14} /></button>
              </div>
            </div>
          </>
        ) : (
          <button onClick={() => setChatOpen(true)} className="h-full w-full flex flex-col items-center py-6 text-gray-600 hover:text-purple-400 bg-[#111116]"><MessageSquare size={20} /></button>
        )}
      </aside>
    </div>
  );
};

type VaultCardProps = {
  name: string;
  color: string;
  bg: string;
  balance: number;
  icon: "binance" | "bybit";
  status: "LIVE" | "STALE" | "OFFLINE";
};

const statusClasses: Record<VaultCardProps["status"], string> = {
  LIVE: "text-green-400 border-green-500/30 bg-green-500/10",
  STALE: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  OFFLINE: "text-red-400 border-red-500/30 bg-red-500/10",
};

const VaultCard = ({ name, color, bg, balance, icon, status }: VaultCardProps) => {
  return (
    <div className="bg-[#111116] border border-white/5 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-white/10 transition-colors">
      <div className="absolute top-0 right-0 w-16 h-16 bg-white/[0.02] -mr-8 -mt-8 rounded-full blur-2xl"></div>
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div><h3 className={`${color} font-bold text-sm uppercase`}>{name}</h3><span className="text-[9px] text-gray-500 uppercase">Exchange Vault</span></div>
        <div className={`p-2.5 ${bg} rounded-xl`}>{icon === 'binance' ? <TrendingUp size={16} className={color} /> : <Activity size={16} className={color} />}</div>
      </div>
      <div className="space-y-2 relative z-10">
        <div className="flex justify-end">
          <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border rounded-md ${statusClasses[status]}`}>
            {status}
          </span>
        </div>
        <div className="flex justify-between items-center bg-[#0a0a0c] px-3 py-2.5 rounded-xl border border-white/5">
          <span className="text-gray-500 text-[10px] uppercase font-bold">Total Assets</span>
          <span className="font-mono text-gray-200 text-sm font-black">${(balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
  );
};

export default Index;
