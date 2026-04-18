import React from "react";
import { Input } from "@/components/ui/input";

type LedgerFilters = {
  date: string;
  day: string;
  status: string;
  pair: string;
};

interface TradeRecord {
  time: string;
  timestamp?: string;
  pair?: string;
  buy_exchange?: string;
  sell_exchange?: string;
  spread_pct?: number;
  gross_profit?: string;
  fees?: string;
  net_profit?: string;
  profit?: string;
  status?: string;
  error?: string | null;
}

interface ExecutionLedgerProps {
  tradeLog: TradeRecord[];
  filters: LedgerFilters;
  setFilters: React.Dispatch<React.SetStateAction<LedgerFilters>>;
  pairOptions: string[];
  onClearFilters: () => void;
}

const dayOptions = ["ALL", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const statusOptions = ["ALL", "SUCCESSFUL", "FAILED", "BLOCKED"];

const ExecutionLedger: React.FC<ExecutionLedgerProps> = ({
  tradeLog,
  filters,
  setFilters,
  pairOptions,
  onClearFilters,
}) => {
  const isFiltersActive = Boolean(
    filters.date || filters.day !== "ALL" || filters.status !== "ALL" || filters.pair !== "ALL",
  );

  const updateFilter = (key: keyof LedgerFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const formatCurrency = (value?: string) => value || "$0.00";
  const formatTimestamp = (value?: string) => value || "--";
  const formatSpread = (value?: number) => `${Number(value || 0).toFixed(4)}%`;

  return (
    <section className="bg-[#0a0a0c] border border-white/5 rounded-2xl overflow-hidden w-full flex-shrink-0 min-h-[400px] shadow-2xl relative">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-green-500/10 to-transparent"></div>

      <div className="px-6 py-4 border-b border-white/5 bg-[#111116]/80 backdrop-blur-md flex flex-wrap justify-between items-center gap-3 relative z-10">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-2 border-l-2 border-green-500/50">
          Execution Ledger
        </h3>
        <span className="text-[10px] text-gray-600 font-bold bg-white/5 px-2 py-0.5 rounded-full border border-white/5 uppercase">
          {tradeLog.length} Records Detected
        </span>
      </div>

      <div className="px-6 py-4 border-b border-white/5 bg-[#0d0d12]/80 backdrop-blur-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Date</label>
            <Input
              type="date"
              value={filters.date}
              onChange={(e) => updateFilter("date", e.target.value)}
              className="h-10 border-white/10 bg-black/30 text-gray-200 focus-visible:ring-green-500"
            />
          </div>

          <div className="min-w-[160px] flex-1">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Day</label>
            <select
              value={filters.day}
              onChange={(e) => updateFilter("day", e.target.value)}
              className="flex h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 outline-none transition focus:border-green-500/40"
            >
              {dayOptions.map((day) => (
                <option key={day} value={day} className="bg-[#0a0a0c] text-gray-200">
                  {day === "ALL" ? "All Days" : day}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[160px] flex-1">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Status</label>
            <select
              value={filters.status}
              onChange={(e) => updateFilter("status", e.target.value)}
              className="flex h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 outline-none transition focus:border-green-500/40"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status} className="bg-[#0a0a0c] text-gray-200">
                  {status === "ALL" ? "All Statuses" : status}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[180px] flex-[1.2]">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Pair</label>
            <select
              value={filters.pair}
              onChange={(e) => updateFilter("pair", e.target.value)}
              className="flex h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 outline-none transition focus:border-green-500/40"
            >
              <option value="ALL" className="bg-[#0a0a0c] text-gray-200">
                All Pairs
              </option>
              {pairOptions.map((pair) => (
                <option key={pair} value={pair} className="bg-[#0a0a0c] text-gray-200">
                  {pair}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onClearFilters}
            className="h-10 rounded-md border border-white/10 bg-white/5 px-4 text-[11px] font-black uppercase tracking-[0.18em] text-gray-300 transition hover:border-green-500/30 hover:text-green-300 disabled:opacity-50"
            disabled={!isFiltersActive}
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[460px] scrollbar-hide">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[#0a0a0c]/95 backdrop-blur-md z-10">
            <tr className="text-[10px] text-gray-600 uppercase tracking-widest font-black border-b border-white/5">
              <th className="px-6 py-4">Timestamp</th>
              <th className="px-6 py-4">Pair</th>
              <th className="px-6 py-4">Buy Exchange</th>
              <th className="px-6 py-4">Sell Exchange</th>
              <th className="px-6 py-4 text-right">Spread %</th>
              <th className="px-6 py-4 text-right">Gross Profit</th>
              <th className="px-6 py-4 text-right">Fees</th>
              <th className="px-6 py-4 text-right">Net Profit</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="text-xs font-mono">
            {tradeLog.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-gray-700 italic font-medium tracking-tight">
                  No trades matched the current filters.
                </td>
              </tr>
            ) : (
              tradeLog.map((trade, index) => {
                const isSuccessful = String(trade.status || "").toUpperCase() === "SUCCESSFUL";
                const isBlocked = String(trade.status || "").toUpperCase() === "BLOCKED";
                return (
                  <tr key={`${trade.timestamp || trade.time}-${index}`} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4 text-gray-500 font-medium group-hover:text-gray-300">
                      {formatTimestamp(trade.timestamp || trade.time)}
                    </td>
                    <td className="px-6 py-4 text-cyan-300/90 group-hover:text-cyan-200">
                      {trade.pair || "BTC/USDT"}
                    </td>
                    <td className="px-6 py-4 text-gray-300">{trade.buy_exchange || "-"}</td>
                    <td className="px-6 py-4 text-gray-300">{trade.sell_exchange || "-"}</td>
                    <td className="px-6 py-4 text-right text-gray-300">{formatSpread(trade.spread_pct)}</td>
                    <td className={`px-6 py-4 text-right font-bold ${isSuccessful ? "text-green-400" : isBlocked ? "text-amber-300" : "text-gray-300"}`}>
                      {formatCurrency(trade.gross_profit)}
                    </td>
                    <td className="px-6 py-4 text-right text-red-300">{formatCurrency(trade.fees)}</td>
                    <td className={`px-6 py-4 text-right font-bold underline decoration-green-500/20 underline-offset-4 ${
                      isSuccessful
                        ? "text-green-500 group-hover:text-green-400"
                        : isBlocked
                          ? "text-amber-300 group-hover:text-amber-200"
                          : "text-red-400 group-hover:text-red-300"
                    }`}>
                      {formatCurrency(trade.net_profit || trade.profit)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-md text-[10px] font-bold border ${
                          isSuccessful
                            ? "text-green-400 border-green-500/30 bg-green-500/10"
                            : isBlocked
                              ? "text-amber-300 border-amber-400/30 bg-amber-500/10"
                              : "text-red-400 border-red-500/30 bg-red-500/10"
                        }`}
                        title={trade.error || undefined}
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

      <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-[#0a0a0c] to-transparent pointer-events-none"></div>
    </section>
  );
};

export default ExecutionLedger;
