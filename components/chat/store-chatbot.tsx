"use client";

import { Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CHATBOT_URL = process.env.NEXT_PUBLIC_CHATBOT_URL ?? "http://localhost:8000";

type ChatMessage = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hi! I'm the store assistant. Ask me about products, prices, stock, categories, or about vendors";

export function StoreChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  async function send() {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    const next = [...messages, { role: "user", content: trimmed } as ChatMessage];
    setMessages(next);
    setDraft("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${CHATBOT_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) throw new Error(`Chat service responded ${res.status}`);
      const data = (await res.json()) as { reply: string };
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Couldn't reach the store assistant. Is the chatbot service running?");
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <section className="flex h-[520px] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xl shadow-zinc-900/10 dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none">
          <header className="flex items-center gap-2.5 border-b border-zinc-200/80 px-4 py-3.5 dark:border-zinc-800/80">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Store assistant
              </p>
              <h2 className="truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Ask about the marketplace
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div
            ref={scrollerRef}
            className="flex flex-1 flex-col gap-2 overflow-y-auto bg-zinc-50/60 px-4 py-4 dark:bg-zinc-950/40"
          >
            <Bubble message={{ role: "assistant", content: GREETING }} />
            {messages.map((m, i) => (
              <Bubble key={i} message={m} />
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-xs text-zinc-500 shadow-sm shadow-zinc-900/[0.03] ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800/80">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="border-t border-red-200/80 bg-red-50/80 px-4 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}

          <form
            onSubmit={onSubmit}
            className="flex items-end gap-2 border-t border-zinc-200/80 bg-white p-3 dark:border-zinc-800/80 dark:bg-zinc-900"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={1000}
              placeholder="Ask about products, prices, stock…"
              disabled={sending}
              className="min-h-9 flex-1 resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm shadow-zinc-900/[0.02] transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10"
            />
            <Button type="submit" size="icon" disabled={!draft.trim() || sending}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close store assistant" : "Open store assistant"}
        className="grid h-14 w-14 place-items-center rounded-full bg-zinc-900 text-white shadow-lg shadow-zinc-900/20 transition-transform duration-150 hover:scale-105 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const self = message.role === "user";
  return (
    <div className={cn("flex", self ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm shadow-zinc-900/[0.03]",
          self
            ? "rounded-br-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none"
            : "rounded-bl-md bg-white text-zinc-900 ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800/80 dark:shadow-none",
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
      </div>
    </div>
  );
}
