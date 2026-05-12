/**
 * Shared between server (broadcaster) and client (subscriber).
 * No "server-only" import — this file is safe in client bundles.
 */

export const CHAT_BROADCAST_EVENT = "message";

export function chatChannelName(productId: string, userAId: string, userBId: string) {
  const [a, b] = [userAId, userBId].sort();
  return `chat:${productId}:${a}:${b}`;
}
