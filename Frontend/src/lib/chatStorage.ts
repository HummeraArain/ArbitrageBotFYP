export type PersistedChatMessage = { role: "ai" | "user"; text: string };

export type PersistedChatState = {
  messages: PersistedChatMessage[];
  chatOpen: boolean;
  input: string;
};

export function loadChatState(storageKey: string, fallbackMessages: PersistedChatMessage[]): PersistedChatState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return { messages: fallbackMessages, chatOpen: true, input: "" };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedChatState>;
    const messages = Array.isArray(parsed.messages) && parsed.messages.length > 0 ? parsed.messages.slice(-100) : fallbackMessages;
    const chatOpen = typeof parsed.chatOpen === "boolean" ? parsed.chatOpen : true;
    const input = typeof parsed.input === "string" ? parsed.input : "";
    return { messages, chatOpen, input };
  } catch {
    return { messages: fallbackMessages, chatOpen: true, input: "" };
  }
}

export function saveChatState(storageKey: string, state: PersistedChatState) {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        messages: state.messages.slice(-100),
        chatOpen: state.chatOpen,
        input: state.input,
      })
    );
  } catch {
    // Intentionally ignore storage failures.
  }
}
