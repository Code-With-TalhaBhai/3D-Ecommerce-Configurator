import "server-only";

import { prisma } from "@/lib/prisma";
import { broadcastChatMessage, chatChannelName } from "@/lib/realtime";

export type ThreadMessage = {
  id: string;
  productId: string;
  senderId: string;
  receiverId: string;
  body: string;
  createdAt: string;
};

/**
 * Returns the thread for (product, userA <-> userB). Caller is responsible for
 * verifying that the current user is one of the two participants.
 */
export async function fetchThread(
  productId: string,
  userAId: string,
  userBId: string,
): Promise<ThreadMessage[]> {
  const rows = await prisma.message.findMany({
    where: {
      productId,
      OR: [
        { senderId: userAId, receiverId: userBId },
        { senderId: userBId, receiverId: userAId },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true,
      productId: true,
      senderId: true,
      receiverId: true,
      body: true,
      createdAt: true,
    },
  });
  return rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
}

/**
 * Persists a chat message and best-effort broadcasts it to the thread channel.
 * Caller must enforce authorization beforehand.
 */
export async function sendChatMessage(args: {
  productId: string;
  senderId: string;
  receiverId: string;
  body: string;
}): Promise<ThreadMessage> {
  const trimmed = args.body.trim();
  if (!trimmed) throw new Error("Message body cannot be empty.");
  if (trimmed.length > 2000) throw new Error("Message exceeds 2000 characters.");

  const row = await prisma.message.create({
    data: {
      productId: args.productId,
      senderId: args.senderId,
      receiverId: args.receiverId,
      body: trimmed,
    },
    select: {
      id: true,
      productId: true,
      senderId: true,
      receiverId: true,
      body: true,
      createdAt: true,
    },
  });
  const message: ThreadMessage = { ...row, createdAt: row.createdAt.toISOString() };

  await broadcastChatMessage(
    chatChannelName(args.productId, args.senderId, args.receiverId),
    message,
  );

  return message;
}
