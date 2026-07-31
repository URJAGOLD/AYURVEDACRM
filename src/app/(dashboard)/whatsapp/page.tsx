"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/store/auth";

interface Conversation {
  waContactId: string;
  contactName: string | null;
  lastMessage: string | null;
  lastDirection: string;
  lastAt: string;
  status: string;
}
interface Msg {
  id: number;
  waContactId: string;
  direction: string;
  body: string | null;
  status: string;
  createdAt: string;
}

export default function WhatsAppPage() {
  const { can } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    try {
      const data = await api.get("/api/whatsapp/conversations");
      setConversations(data.conversations || []);
    } catch (e) { console.error(e); }
  }

  async function loadThread(contact: string) {
    setLoading(true);
    try {
      const data = await api.get("/api/whatsapp/conversations/" + contact);
      setMessages(data.messages || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { loadConversations(); const t = setInterval(loadConversations, 8000); return () => clearInterval(t); }, []);
  useEffect(() => { if (active) { loadThread(active); const t = setInterval(() => loadThread(active), 5000); return () => clearInterval(t); } }, [active]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    const contact = active || newNumber.replace(/\D/g, "");
    if (!contact || !text.trim()) return;
    setSending(true);
    try {
      await api.post("/api/whatsapp/conversations/" + contact, { text: text.trim() });
      setText("");
      if (!active) { setActive(contact); setNewNumber(""); }
      await loadThread(contact);
      await loadConversations();
    } catch (e: any) {
      alert(e.message || "Failed to send");
    }
    setSending(false);
  }

  if (!can("whatsapp.view")) {
    return <div className="p-6 text-gray-500">You don't have access to WhatsApp chat.</div>;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] border rounded-lg overflow-hidden bg-white">
      {/* Conversation list */}
      <div className="w-full max-w-xs border-r flex flex-col">
        <div className="p-3 border-b">
          <div className="text-sm font-semibold mb-2">New conversation</div>
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="10-digit mobile number"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
            />
            <button
              className="px-3 py-1.5 bg-brand text-white rounded text-sm disabled:opacity-40"
              disabled={!newNumber.trim()}
              onClick={() => { setActive(newNumber.replace(/\D/g, "")); }}
            >
              Open
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="p-4 text-sm text-gray-400">No conversations yet. Messages customers send to your WhatsApp number will appear here.</div>
          )}
          {conversations.map((c) => (
            <button
              key={c.waContactId}
              onClick={() => setActive(c.waContactId)}
              className={`w-full text-left p-3 border-b hover:bg-brand-light/40 ${active === c.waContactId ? "bg-brand-light" : ""}`}
            >
              <div className="font-medium text-sm">{c.contactName || c.waContactId}</div>
              <div className="text-xs text-gray-500 truncate">{c.lastDirection === "outbound" ? "You: " : ""}{c.lastMessage}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 flex flex-col">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a conversation, or enter a number on the left to start a new one.
          </div>
        ) : (
          <>
            <div className="p-3 border-b font-medium text-sm">{active}</div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
              {loading && <div className="text-xs text-gray-400">Loading...</div>}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${m.direction === "outbound" ? "bg-brand text-white" : "bg-white border"}`}>
                    {m.body}
                    <div className={`text-[10px] mt-1 ${m.direction === "outbound" ? "text-white/70" : "text-gray-400"}`}>
                      {new Date(m.createdAt).toLocaleString()} {m.direction === "outbound" ? `· ${m.status}` : ""}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {can("whatsapp.send") && (
              <div className="p-3 border-t flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Type a message..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                />
                <button className="px-4 py-2 bg-brand text-white rounded disabled:opacity-40" disabled={sending || !text.trim()} onClick={send}>
                  {sending ? "..." : "Send"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
