"use client";

import { ChevronDown, Loader2, Send } from "lucide-react";
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
  productTitle: string;
  customerId: string;
  customerName: string;
  vendorUserId: string;
  initialLastBody: string;
};

export function VendorThread({
  productId,
  customerId,
  vendorUserId,
  initialLastBody,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const channelName = useMemo(
    () => chatChannelName(productId, vendorUserId, customerId),
    [productId, vendorUserId, customerId],
  );

  async function loadIfNeeded() {
    if (loaded || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/products/${productId}/messages?withUserId=${encodeURIComponent(customerId)}`,
      );
      const data = (await res.json()) as { messages?: Message[]; error?: string };
      if (data.messages) {
        setMessages(data.messages);
        setLoaded(true);
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError("Couldn't load the thread.");
    } finally {
      setLoading(false);
    }
  }

  // Subscribe to live updates whenever the thread is expanded.
  useEffect(() => {
    if (!expanded) return;
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
  }, [expanded, channelName]);

  useEffect(() => {
    if (!expanded) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [expanded, messages.length]);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) loadIfNeeded();
  }

  async function send() {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed, withUserId: customerId }),
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
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-950/40"
      >
        <p className="line-clamp-2 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
          {initialLastBody}
        </p>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-zinc-400 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          <div
            ref={scrollerRef}
            className="flex max-h-72 flex-col gap-2 overflow-y-auto bg-zinc-50 px-4 py-3 dark:bg-zinc-950"
          >
            {loading ? (
              <div className="flex items-center justify-center py-4 text-xs text-zinc-500 dark:text-zinc-400">
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Loading…
              </div>
            ) : messages.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                No messages.
              </div>
            ) : (
              messages.map((m) => (
                <Bubble key={m.id} message={m} self={m.senderId === vendorUserId} />
              ))
            )}
          </div>

          {error && (
            <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <form
            onSubmit={onSubmit}
            className="flex items-end gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={2000}
              placeholder="Reply… (Enter to send)"
              disabled={sending}
              className="min-h-9 flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
            />
            <Button type="submit" size="sm" disabled={!draft.trim() || sending}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function Bubble({ message, self }: { message: Message; self: boolean }) {
  return (
    <div className={cn("flex", self ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
          self
            ? "rounded-br-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "rounded-bl-sm bg-white text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p
          className={cn(
            "mt-1 text-[10px]",
            self ? "text-zinc-300 dark:text-zinc-500" : "text-zinc-500 dark:text-zinc-400",
          )}
        >
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
