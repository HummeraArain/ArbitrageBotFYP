import React from "react";
import { Power, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HeaderProps {
  botRunning: boolean;
  status: string;
  latency: number;
  liveExchangeCount?: number;
  toggleBot: () => void;
  handleLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({
  botRunning,
  status,
  latency,
  liveExchangeCount = 0,
  toggleBot,
  handleLogout,
}) => {
  return (
    <header className="flex justify-between items-start mb-8">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-black tracking-tight text-white">Arbitrage Bot</h1>
          <span
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all duration-300 ${
              botRunning
                ? "border-green-500 text-green-500 bg-green-500/10 animate-pulse"
                : "border-gray-600 text-gray-500 bg-gray-800/50 shadow-inner"
            }`}
          >
            {status?.replace("_", " ") || "IDLE"}
          </span>
        </div>
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              botRunning ? "bg-green-500 animate-pulse" : "bg-gray-700"
            } shadow-[0_0_8px_rgba(34,197,94,0.4)]`}
          ></span>
          Multi-Exchange Live: {liveExchangeCount} | Latency: {latency || 0}ms
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={toggleBot}
              className={`h-12 px-6 font-bold tracking-wide rounded-xl flex items-center gap-2 transition-all duration-350 active:scale-95 ${
                botRunning
                  ? "bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                  : "bg-green-500 text-black hover:bg-green-400 shadow-[0_4px_20px_rgba(34,197,94,0.3)] hover:shadow-[0_4px_25px_rgba(34,197,94,0.4)]"
              }`}
            >
              <Power size={18} /> {botRunning ? "HALT TRADING" : "ENGAGE ALGORITHM"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-[#111116] border-white/10 text-xs">
            {botRunning ? "Stop autonomous bot execution" : "Start autonomous arbitrage algorithm"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleLogout}
              className="h-12 px-4 bg-red-500/5 text-red-500 border border-red-500/10 hover:border-red-500/30 hover:bg-red-500/10 transition-all rounded-xl flex items-center gap-2 group"
            >
              <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" /> Logout
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-[#111116] border-white/10 text-xs">
            Safely terminate current operator session
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
};

export default Header;
