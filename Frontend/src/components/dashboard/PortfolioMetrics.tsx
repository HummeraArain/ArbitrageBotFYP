import React from "react";
import { TrendingUp, Activity, Landmark } from "lucide-react";

type VaultStatus = "LIVE" | "STALE" | "OFFLINE";

interface PortfolioMetricsProps {
  grandTotal: number;
  totalProfit: number;
  binanceBalance: number;
  bybitBalance: number;
  coinbaseBalance: number;
  binanceBtc?: number;
  bybitBtc?: number;
  coinbaseBtc?: number;
  binanceAsset?: string;
  bybitAsset?: string;
  coinbaseAsset?: string;
  binanceStatus?: VaultStatus;
  bybitStatus?: VaultStatus;
  coinbaseStatus?: VaultStatus;
  binanceWarning?: string | null;
  bybitWarning?: string | null;
  coinbaseWarning?: string | null;
}

const PortfolioMetrics: React.FC<PortfolioMetricsProps> = ({
  grandTotal,
  totalProfit,
  binanceBalance,
  bybitBalance,
  coinbaseBalance,
  binanceBtc = 0,
  bybitBtc = 0,
  coinbaseBtc = 0,
  binanceAsset = "USDT",
  bybitAsset = "USDT",
  coinbaseAsset = "USDT",
  binanceStatus = "OFFLINE",
  bybitStatus = "OFFLINE",
  coinbaseStatus = "OFFLINE",
  binanceWarning = null,
  bybitWarning = null,
  coinbaseWarning = null,
}) => {
  const totalBtc = binanceBtc + bybitBtc + coinbaseBtc;
  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="md:col-span-1 bg-gradient-to-br from-[#0a0a0c] via-[#111116] to-[#050505] border border-white/10 p-6 rounded-2xl relative overflow-hidden group shadow-2xl">
        <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 blur-[50px] group-hover:bg-green-500/10 transition-colors"></div>
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-2">Net Account Equity</p>
        <h2 className="text-4xl font-black text-white mb-2 tracking-tight">
          ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </h2>
        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-400 text-xs font-bold rounded-lg border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]">
          <TrendingUp size={12} /> +${totalProfit.toFixed(2)} Total Profit
        </div>
        <p className="mt-2 text-[10px] text-cyan-300 font-bold uppercase tracking-wider">
          BTC Holdings: {totalBtc.toFixed(6)} BTC
        </p>
      </div>

      <VaultCard
        name="Binance"
        color="text-yellow-500"
        bg="bg-yellow-500/10"
        balance={binanceBalance}
        asset={binanceAsset}
        icon="binance"
        status={binanceStatus}
        warning={binanceWarning}
        btcBalance={binanceBtc}
      />
      <VaultCard
        name="Bybit"
        color="text-orange-500"
        bg="bg-orange-500/10"
        balance={bybitBalance}
        asset={bybitAsset}
        icon="bybit"
        status={bybitStatus}
        warning={bybitWarning}
        btcBalance={bybitBtc}
      />
      <VaultCard
        name="Coinbase"
        color="text-cyan-400"
        bg="bg-cyan-500/10"
        balance={coinbaseBalance}
        asset={coinbaseAsset}
        icon="coinbase"
        status={coinbaseStatus}
        warning={coinbaseWarning}
        btcBalance={coinbaseBtc}
      />
    </section>
  );
};

type VaultCardProps = {
  name: string;
  color: string;
  bg: string;
  balance: number;
  asset?: string;
  icon: "binance" | "bybit" | "coinbase";
  status: VaultStatus;
  warning?: string | null;
  btcBalance?: number;
};

const statusClasses: Record<VaultCardProps["status"], string> = {
  LIVE: "text-green-400 border-green-500/30 bg-green-500/10",
  STALE: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  OFFLINE: "text-red-400 border-red-500/30 bg-red-500/10",
};

const VaultCard = ({ name, color, bg, balance, asset = "USDT", icon, status, warning, btcBalance = 0 }: VaultCardProps) => {
  return (
    <div className="bg-[#0a0a0c] border border-white/5 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-white/10 transition-all duration-300 shadow-lg">
      <div className="absolute top-0 right-0 w-16 h-16 bg-white/[0.02] -mr-8 -mt-8 rounded-full blur-2xl group-hover:bg-white/[0.05]"></div>
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <h3 className={`${color} font-bold text-sm uppercase tracking-widest`}>{name}</h3>
          <span className="text-[9px] text-gray-500 uppercase font-black">Exchange Vault Status</span>
        </div>
        <div className={`p-2.5 ${bg} rounded-xl shadow-inner`}>
          {icon === "binance" ? (
            <TrendingUp size={16} className={color} />
          ) : icon === "bybit" ? (
            <Activity size={16} className={color} />
          ) : (
            <Landmark size={16} className={color} />
          )}
        </div>
      </div>
      <div className="space-y-2 relative z-10">
        <div className="flex justify-end">
          <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border rounded-md ${statusClasses[status]}`}>
            {status}
          </span>
        </div>
        <div className="flex justify-between items-center bg-[#050505]/40 px-3 py-2.5 rounded-xl border border-white/5 shadow-inner">
          <span className="text-gray-500 text-[10px] uppercase font-extrabold tracking-tighter">Liquid Capital</span>
          <span className="font-mono text-gray-200 text-sm font-black">
            ${(balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider text-right">Asset: {asset}</p>
        <p className="text-[9px] text-cyan-300/90 uppercase font-bold tracking-wider text-right">
          BTC: {Number(btcBalance || 0).toFixed(6)}
        </p>
        {warning && (
          <p className="text-[10px] leading-4 text-amber-300/90 bg-amber-500/10 border border-amber-400/20 rounded-lg px-2 py-1">
            {warning}
          </p>
        )}
      </div>
    </div>
  );
};

export default PortfolioMetrics;
