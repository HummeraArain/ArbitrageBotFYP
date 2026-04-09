import React from "react";
import { Bot as BotIcon, ChevronRight, Send, MessageSquare } from "lucide-react";

interface Message {
  role: string;
  text: string;
}

interface SidebarProps {
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  messages: Message[];
  input: string;
  setInput: (input: string) => void;
  handleSend: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

const Sidebar: React.FC<SidebarProps> = ({
  chatOpen,
  setChatOpen,
  messages,
  input,
  setInput,
  handleSend,
  chatEndRef,
}) => {
  return (
    <aside className={`${chatOpen ? 'w-[350px]' : 'w-16'} transition-all duration-500 ease-in-out border-l border-white/5 bg-[#0a0a0c] flex flex-col z-10 shadow-2xl relative`}>
      {chatOpen ? (
        <>
          <div className="p-5 border-b border-white/5 flex justify-between items-center bg-[#111116]/80 backdrop-blur-md sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
                <BotIcon size={16} className="text-purple-500" />
              </div>
              <div>
                <h3 className="font-black text-sm text-gray-200 tracking-tight">AI Logic Core</h3>
                <p className="text-[9px] text-purple-400/60 uppercase font-black tracking-widest">Neural Analysis Active</p>
              </div>
            </div>
            <button 
              onClick={() => setChatOpen(false)} 
              className="text-gray-600 hover:text-white hover:bg-white/5 p-1.5 rounded-lg transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide bg-gradient-to-b from-[#0a0a0c] via-black to-[#0a0a0c]/80">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`max-w-[85%] p-3.5 rounded-2xl text-[12px] leading-relaxed relative ${
                  m.role === 'user' 
                    ? 'bg-gradient-to-br from-green-500 to-green-600 text-black font-bold shadow-[0_4px_15px_rgba(34,197,94,0.2)]' 
                    : 'bg-[#111116] border border-white/10 text-gray-300 shadow-xl'
                } whitespace-pre-wrap`}>
                  {m.text}
                  {m.role !== 'user' && (
                    <div className="absolute -left-1.5 top-3 w-3 h-3 bg-[#111116] border-l border-t border-white/10 rotate-[-45deg] rounded-sm"></div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-white/5 bg-[#111116]/90 backdrop-blur-md">
            <div className="flex gap-2 items-center bg-[#050505] border border-white/10 rounded-2xl p-1.5 pr-2.5 shadow-inner focus-within:border-purple-500/50 transition-colors">
              <input 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyPress={(e) => e.key === 'Enter' && handleSend()} 
                placeholder="Query AI Core..." 
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
        </>
      ) : (
        <button 
          onClick={() => setChatOpen(true)} 
          className="h-full w-full flex flex-col items-center py-8 text-gray-600 hover:text-purple-400 bg-gradient-to-b from-[#111116] to-[#0a0a0c] transition-all group"
        >
          <div className="p-3 rounded-xl border border-transparent group-hover:border-purple-500/20 group-hover:bg-purple-500/5 transition-all">
            <MessageSquare size={20} />
          </div>
          <span className="[writing-mode:vertical-lr] mt-6 text-[10px] font-black uppercase tracking-[0.3em] opacity-40 group-hover:opacity-100 transition-opacity">AI Logic Core</span>
        </button>
      )}
    </aside>
  );
};

export default Sidebar;
