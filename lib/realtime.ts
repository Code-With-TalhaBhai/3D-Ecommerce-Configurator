import "server-only";

import { createClient } from "@supabase/supabase-js";

export { CHAT_BROADCAST_EVENT, chatChannelName } from "@/lib/realtime-shared";
import { CHAT_BROADCAST_EVENT } from "@/lib/realtime-shared";

/**
 * Server-side fan-out for a single chat message. Uses the public key — broadcast
 * doesn't require service_role and we don't want to ship the secret to clients.
 */
export async function broadcastChatMessage(
  channelName: string,
  payload: Record<string, unknown>,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Realtime is best-effort — clients will see the message on next refresh.
    return;
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  const channel = client.channel(channelName, {
    config: { broadcast: { self: false } },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("realtime subscribe timeout")), 3000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          clearTimeout(timeout);
          reject(new Error(status));
        }
      });
    });
    await channel.send({
      type: "broadcast",
      event: CHAT_BROADCAST_EVENT,
      payload,
    });
  } catch {
    // Swallow — broadcast is best-effort.
  } finally {
    await client.removeChannel(channel).catch(() => {});
  }
}
