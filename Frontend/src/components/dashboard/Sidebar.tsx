import React, { useState } from "react";
import { Activity, Bot as BotIcon, ChevronRight, MessageSquare, Send } from "lucide-react";

interface Message {
  role: string;
  text: string;
}

interface SidebarProps {
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  chatMessages: Message[];
  systemFeed: Message[];
  input: string;
  setInput: (input: string) => void;
  handleSend: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
  feedEndRef: React.RefObject<HTMLDivElement>;
}

const Sidebar: React.FC<SidebarProps> = ({
  chatOpen,
  setChatOpen,
  chatMessages,
  systemFeed,
  input,
  setInput,
  handleSend,
  chatEndRef,
  feedEndRef,
}) => {
  const [activePane, setActivePane] = useState<"chat" | "feed">("chat");
  const activeMessages = activePane === "chat" ? chatMessages : systemFeed;

  return (
    <aside
      className={`${
        chatOpen ? "w-[380px]" : "w-16"
      } transition-all duration-500 ease-in-out border-l border-white/5 bg-[#0a0a0c] flex flex-col z-10 shadow-2xl relative`}
    >
      {chatOpen ? (
        <>
          <div className="p-5 border-b border-white/5 bg-[#111116]/80 backdrop-blur-md sticky top-0 z-20 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
                  {activePane === "chat" ? (
                    <BotIcon size={16} className="text-purple-500" />
                  ) : (
                    <Activity size={16} className="text-cyan-400" />
                  )}
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-200 tracking-tight">
                    {activePane === "chat" ? "AI Chat" : "Execution Feed"}
                  </h3>
                  <p className="text-[9px] text-purple-400/60 uppercase font-black tracking-widest">
                    {activePane === "chat" ? "Question Answering" : "Trade Reasons & Engine Logs"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="text-gray-600 hover:text-white hover:bg-white/5 p-1.5 rounded-lg transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/30 p-1">
              <button
                onClick={() => setActivePane("chat")}
                className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                  activePane === "chat" ? "bg-green-500 text-black" : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setActivePane("feed")}
                className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                  activePane === "feed" ? "bg-cyan-500 text-black" : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                Feed
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide bg-gradient-to-b from-[#0a0a0c] via-black to-[#0a0a0c]/80">
            {activeMessages.map((m, i) => (
              (() => {
                const isFeed = activePane === "feed";
                const textUpper = String(m.text || "").toUpperCase();
                const isSuccessFeed = isFeed && textUpper.includes("TRADE STATUS: SUCCESS");
                const isFailureFeed = isFeed && textUpper.includes("TRADE STATUS: FAILED");
                const isBlockedFeed = isFeed && textUpper.includes("TRADE STATUS: BLOCKED");
                const isUser = activePane === "chat" && m.role === "user";
                const nubClass = isSuccessFeed
                  ? "bg-[#0f1712] border-l border-t border-green-500/40"
                  : isFailureFeed
                    ? "bg-[#190f12] border-l border-t border-red-500/35"
                    : isBlockedFeed
                      ? "bg-[#1b160f] border-l border-t border-amber-500/35"
                    : "bg-[#111116] border-l border-t border-white/10";

                return (
              <div
                key={`${activePane}-${i}`}
                className={`flex ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                <div
                  className={`max-w-[92%] p-3.5 rounded-2xl text-[12px] leading-relaxed relative whitespace-pre-wrap ${
                    isUser
                      ? "bg-gradient-to-br from-green-500 to-green-600 text-black font-bold shadow-[0_4px_15px_rgba(34,197,94,0.2)]"
                      : isSuccessFeed
                        ? "bg-[#0f1712] border border-green-500/40 text-green-100 shadow-xl"
                        : isFailureFeed
                          ? "bg-[#190f12] border border-red-500/35 text-red-100 shadow-xl"
                          : isBlockedFeed
                            ? "bg-[#1b160f] border border-amber-500/35 text-amber-100 shadow-xl"
                          : "bg-[#111116] border border-white/10 text-gray-300 shadow-xl"
                  }`}
                >
                  {m.text}
                  {!isUser && (
                    <div className={`absolute -left-1.5 top-3 w-3 h-3 rotate-[-45deg] rounded-sm ${nubClass}`}></div>
                  )}
                </div>
              </div>
                );
              })()
            ))}
            {activePane === "chat" ? <div ref={chatEndRef} /> : <div ref={feedEndRef} />}
          </div>

          {activePane === "chat" ? (
            <div className="p-4 border-t border-white/5 bg-[#111116]/90 backdrop-blur-md">
              <div className="flex gap-2 items-center bg-[#050505] border border-white/10 rounded-2xl p-1.5 pr-2.5 shadow-inner focus-within:border-purple-500/50 transition-colors">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask about prices, trends, or your previous trades..."
                  className="flex-1 bg-transparent px-3 py-2 text-xs text-white outline-none placeholder:text-gray-700 font-medium"
                />
                <button
                  onClick={handleSend}
                  className="p-2.5 bg-purple-500/10 text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 rounded-xl transition-all shadow-sm active:scale-95"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 border-t border-white/5 bg-[#111116]/90 backdrop-blur-md">
              <p className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[11px] leading-5 text-cyan-200">
                Execution feed shows engine reasoning, trade decisions, and failure causes in real time.
              </p>
            </div>
          )}
        </>
      ) : (
        <button
          onClick={() => setChatOpen(true)}
          className="h-full w-full flex flex-col items-center py-8 text-gray-600 hover:text-purple-400 bg-gradient-to-b from-[#111116] to-[#0a0a0c] transition-all group"
        >
          <div className="p-3 rounded-xl border border-transparent group-hover:border-purple-500/20 group-hover:bg-purple-500/5 transition-all">
            <MessageSquare size={20} />
          </div>
          <span className="[writing-mode:vertical-lr] mt-6 text-[10px] font-black uppercase tracking-[0.3em] opacity-40 group-hover:opacity-100 transition-opacity">
            AI & FEED
          </span>
        </button>
      )}
    </aside>
  );
};

export default Sidebar;
