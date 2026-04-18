import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type PricePoint = {
  time: number;
  binance: number | null;
  bybit: number | null;
  coinbase: number | null;
};

type SpreadPoint = {
  time: number;
  binance_bybit: number;
  binance_coinbase: number;
  bybit_coinbase: number;
  best: number;
};

interface ChartSectionProps {
  spreadData: SpreadPoint[];
  priceData: PricePoint[];
  threshold: number;
}

const timeFormatter = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const formatTime = (value: number) => timeFormatter.format(new Date(value));

const ChartSection: React.FC<ChartSectionProps> = ({ spreadData, priceData, threshold }) => {
  const hasSpreadData = spreadData.length > 0;
  const hasPriceData = priceData.some(
    (row) => row.binance !== null || row.bybit !== null || row.coinbase !== null
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center px-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-l-2 border-purple-500 pl-2">
            Pair Spread Monitor
          </h3>
        </div>
        <div className="h-[320px] w-full bg-[#0a0a0c]/50 border border-white/5 rounded-2xl p-4 backdrop-blur-sm relative overflow-hidden">
          {!hasSpreadData ? (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">
              Waiting for live spread data from exchanges...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={spreadData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="time" tickFormatter={formatTime} minTickGap={32} tick={{ fontSize: 10, fill: "#6b7280" }} />
                <YAxis domain={["auto", "auto"]} orientation="right" tick={{ fontSize: 10, fill: "#6b7280" }} />
                <Tooltip
                  labelFormatter={(value) => formatTime(Number(value))}
                  formatter={(value: number, name: string) => [`${Number(value).toFixed(4)}%`, name]}
                />
                <Line type="monotone" dataKey="binance_bybit" name="BINANCE-BYBIT" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="binance_coinbase" name="BINANCE-COINBASE" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="bybit_coinbase" name="BYBIT-COINBASE" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="best" name="BEST SPREAD" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} strokeDasharray="5 5" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}

          {hasSpreadData && (
            <div
              className="absolute left-0 w-full border-t border-purple-500/40 border-dashed z-10 pointer-events-none transition-all duration-500"
              style={{ bottom: `${Math.min(90, Math.max(5, (threshold / 0.5) * 100))}%` }}
            >
              <span className="absolute right-2 -top-4 text-[9px] text-purple-400/80 font-bold uppercase">
                Threshold: {threshold.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center px-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-l-2 border-green-500 pl-2">
            Exchange Price Stream (BTC)
          </h3>
        </div>
        <div className="h-[320px] w-full bg-[#0a0a0c]/50 border border-white/5 rounded-2xl p-4 backdrop-blur-sm relative overflow-hidden">
          {!hasPriceData ? (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">
              Waiting for live price data from exchanges...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="time" tickFormatter={formatTime} minTickGap={32} tick={{ fontSize: 10, fill: "#6b7280" }} />
                <YAxis domain={["auto", "auto"]} orientation="right" tick={{ fontSize: 10, fill: "#6b7280" }} />
                <Tooltip
                  labelFormatter={(value) => formatTime(Number(value))}
                  formatter={(value: number | null, name: string) => [
                    value === null || value === undefined ? "n/a" : `$${Number(value).toLocaleString()}`,
                    name,
                  ]}
                />
                <Line type="monotone" dataKey="binance" name="BINANCE" stroke="#eab308" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="bybit" name="BYBIT" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="coinbase" name="COINBASE" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ChartSection);
