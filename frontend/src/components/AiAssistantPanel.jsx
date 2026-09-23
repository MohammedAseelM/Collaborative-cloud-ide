import { useEffect, useRef, useState } from "react";
import { Bot, Eraser, Loader2, Send, Sparkles, X } from "lucide-react";
import { askAssistant } from "../services/ai.service";

const QUICK_PROMPTS = [
  ["Explain", "Explain the active file: its purpose, flow, and any concerns."],
  ["Fix", "Review the active file for bugs and propose a focused fix."],
  ["Refactor", "Suggest a small refactor that improves readability or maintainability."],
  ["Tests", "Suggest high-value tests for the active file."],
];

const AiAssistantPanel = ({ projectId, activeFile, getActiveCode, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const sendMessage = async (message) => {
    const content = message?.trim();
    if (!content || isSending) return;

    const nextMessages = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setDraft("");
    setIsSending(true);
    try {
      const data = await askAssistant(projectId, {
        messages: nextMessages,
        context: {
          filename: activeFile?.name,
          language: activeFile?.name?.split(".").pop() || "plaintext",
          // Read directly from Monaco at send time so the assistant sees
          // unsaved edits as well as the last saved file content.
          code: getActiveCode?.() || "",
        },
      });
      setMessages((current) => [...current, { role: "assistant", content: data.answer }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error.response?.data?.message || "I couldn't complete that request. Please try again.",
        isError: true,
      }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-200">
      <div className="h-14 border-b border-slate-900 px-4 flex items-center justify-between shrink-0 bg-slate-950/60 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-violet-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">AI Assistant</h2>
            <p className="text-[10px] text-slate-500 truncate max-w-48">{activeFile?.name || "No active file"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMessages([])} title="Clear conversation" className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-900"><Eraser size={15} /></button>
          <button onClick={onClose} title="Close AI Assistant" className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-900"><X size={16} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center pt-8">
            <Bot size={32} className="mx-auto text-violet-400/50 mb-3" />
            <p className="text-xs text-slate-300">Ask about your code.</p>
            <p className="mt-1 text-[10px] text-slate-500">The active file is included with each request.</p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-left">
              {QUICK_PROMPTS.map(([label, prompt]) => <button key={label} onClick={() => sendMessage(prompt)} className="rounded border border-slate-800 bg-slate-900 p-2 text-[10px] text-slate-300 hover:border-violet-500 hover:text-white">{label} this file</button>)}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`text-xs whitespace-pre-wrap leading-5 rounded-lg p-3 ${message.role === "user" ? "ml-6 bg-violet-600 text-white" : `mr-3 border ${message.isError ? "border-red-900/60 bg-red-950/20 text-red-200" : "border-slate-800 bg-slate-900 text-slate-200"}`}`}>
            {message.content}
          </div>
        ))}
        {isSending && <div className="flex items-center gap-2 text-xs text-violet-300"><Loader2 size={14} className="animate-spin" /> Thinking…</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(event) => { event.preventDefault(); sendMessage(draft); }} className="p-3 border-t border-slate-900 bg-slate-950/40">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(draft); } }} rows={3} placeholder="Ask about this project…" disabled={isSending} className="w-full resize-none rounded border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:outline-none disabled:opacity-60" />
        <button type="submit" disabled={!draft.trim() || isSending} className="mt-2 ml-auto flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"><Send size={13} /> Send</button>
      </form>
    </div>
  );
};

export default AiAssistantPanel;
