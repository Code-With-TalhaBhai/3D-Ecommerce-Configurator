"use client";

import { Loader2, MessageCircle, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CHAT_BROADCAST_EVENT, chatChannelName } from "@/lib/realtime-shared";
import { getSupabase } from "@/lib/supabase/client";

type Message = {
  id: string;
  productId: string;
  senderId: string;
  receiverId: string;
  body: string;
  createdAt: string;
};

type Props = {
  productId: string;
  currentUserId: string;
  vendorUserId: string;
  vendorDisplayName: string;
};

export function ProductChatPanel({
  productId,
  currentUserId,
  vendorUserId,
  vendorDisplayName,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const channelName = useMemo(
    () => chatChannelName(productId, currentUserId, vendorUserId),
    [productId, currentUserId, vendorUserId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/products/${productId}/messages`)
      .then((r) => r.json())
      .then((data: { messages?: Message[]; error?: string }) => {
        if (cancelled) return;
        if (data.messages) setMessages(data.messages);
        else if (data.error) setError(data.error);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the chat history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabase();
    } catch {
      return;
    }
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: CHAT_BROADCAST_EVENT }, ({ payload }) => {
      const msg = payload as Message;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const data = (await res.json()) as { message?: Message; error?: string };
      if (!res.ok || !data.message) {
        setError(data.error ?? "Failed to send message.");
        return;
      }
      setMessages((prev) =>
        prev.some((m) => m.id === data.message!.id) ? prev : [...prev, data.message!],
      );
      setDraft("");
    } catch {
      setError("Network error. Please try again.");
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
    <section className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm shadow-zinc-900/[0.03] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none">
      <header className="flex items-center gap-2.5 border-b border-zinc-200/80 px-5 py-3.5 dark:border-zinc-800/80">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          <MessageCircle className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Vendor chat
          </p>
          <h2 className="truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {vendorDisplayName}
          </h2>
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="flex h-80 flex-col gap-2 overflow-y-auto bg-zinc-50/60 px-5 py-4 dark:bg-zinc-950/40"
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-zinc-400 shadow-sm dark:bg-zinc-900 dark:text-zinc-500">
              <MessageCircle className="h-4 w-4" />
            </span>
            <p className="max-w-[16rem]">
              No messages yet. Ask about materials, lead time, or shipping.
            </p>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} self={m.senderId === currentUserId} />)
        )}
      </div>

      {error && (
        <p className="border-t border-red-200/80 bg-red-50/80 px-5 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
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
          maxLength={2000}
          placeholder="Type a message…  (Enter to send, Shift+Enter for newline)"
          disabled={sending}
          className="min-h-9 flex-1 resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm shadow-zinc-900/[0.02] transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || sending}>
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </form>
    </section>
  );
}

function Bubble({ message, self }: { message: Message; self: boolean }) {
  return (
    <div className={cn("flex", self ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm shadow-zinc-900/[0.03]",
          self
            ? "rounded-br-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none"
            : "rounded-bl-md bg-white text-zinc-900 ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800/80 dark:shadow-none",
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
        <p
          className={cn(
            "mt-1 text-[10px] tabular-nums",
            self ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-400 dark:text-zinc-500",
          )}
        >
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
