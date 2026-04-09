import React from "react";

interface TradeRecord {
  time: string;
  route: string;
  profit: string;
  pair?: string;
  mode?: string;
  status?: string;
  error?: string | null;
}

interface ExecutionLedgerProps {
  tradeLog: TradeRecord[];
}

const ExecutionLedger: React.FC<ExecutionLedgerProps> = ({ tradeLog }) => {
  const profitValue = (raw: string) => Number(String(raw || "").replace(/[^0-9.-]/g, ""));
  const normalizeProfitText = (raw: string) => {
    const num = profitValue(raw);
    if (!Number.isFinite(num)) return raw;
    return `${num >= 0 ? "+" : "-"}$${Math.abs(num).toFixed(2)}`;
  };

  return (
    <section className="bg-[#0a0a0c] border border-white/5 rounded-2xl overflow-hidden w-full flex-shrink-0 min-h-[400px] shadow-2xl relative">
      {/* Decorative gradient overlay */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-green-500/10 to-transparent"></div>
      
      <div className="px-6 py-4 border-b border-white/5 bg-[#111116]/80 backdrop-blur-md flex justify-between items-center relative z-10">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-2 border-l-2 border-green-500/50">
          Execution Ledger
        </h3>
        <span className="text-[10px] text-gray-600 font-bold bg-white/5 px-2 py-0.5 rounded-full border border-white/5 uppercase">
          {tradeLog.length} Records Detected
        </span>
      </div>
      
      <div className="overflow-y-auto max-h-[400px] scrollbar-hide">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[#0a0a0c]/95 backdrop-blur-md z-10">
            <tr className="text-[10px] text-gray-600 uppercase tracking-widest font-black border-b border-white/5">
              <th className="px-6 py-4">Timestamp</th>
              <th className="px-6 py-4">Pair</th>
              <th className="px-6 py-4">Route Path</th>
              <th className="px-6 py-4">Mode</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Settlement (USD)</th>
            </tr>
          </thead>
          <tbody className="text-xs font-mono">
            {tradeLog.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-700 italic font-medium tracking-tight">
                  Scanning for high-yield market opportunities... No trades logged in current epoch.
                </td>
              </tr>
            ) : (
              tradeLog.map((t, i) => {
                const p = profitValue(t.profit);
                const settlementPositive = Number.isFinite(p)
                  ? p >= 0
                  : String(t.status || "SUCCESS").toUpperCase() === "SUCCESS";
                return (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4 text-gray-600 font-medium group-hover:text-gray-400">
                    {t.time}
                  </td>
                  <td className="px-6 py-4 text-cyan-300/90 group-hover:text-cyan-200">
                    {t.pair || "BTC/USDT"}
                  </td>
                  <td className="px-6 py-4 text-gray-400 group-hover:text-gray-300">
                    <span className="px-2 py-0.5 bg-white/5 rounded border border-white/5 text-[10px]">
                      {t.route}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-300">
                    {String(t.mode || "LIVE").toUpperCase()}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-md text-[10px] font-bold border ${
                        String(t.status || "SUCCESS").toUpperCase() === "SUCCESS"
                          ? "text-green-400 border-green-500/30 bg-green-500/10"
                          : "text-red-400 border-red-500/30 bg-red-500/10"
                      }`}
                      title={t.error || undefined}
                    >
                      {String(t.status || "SUCCESS").toUpperCase()}
                    </span>
                  </td>
                  <td className={`px-6 py-4 text-right font-bold underline decoration-green-500/20 underline-offset-4 ${
                    settlementPositive
                      ? "text-green-500 group-hover:text-green-400"
                      : "text-red-400 group-hover:text-red-300"
                  }`}>
                    {normalizeProfitText(t.profit)}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {/* Bottom fade effect */}
      <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-[#0a0a0c] to-transparent pointer-events-none"></div>
    </section>
  );
};

export default ExecutionLedger;
