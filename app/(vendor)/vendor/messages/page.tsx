import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { VendorThread } from "./vendor-thread";

export const metadata = { title: "Customer messages" };

type Thread = {
  productId: string;
  productTitle: string;
  productSlug: string;
  customerId: string;
  customerName: string | null;
  customerEmail: string;
  lastBody: string;
  lastAt: string;
  unread: boolean;
};

export default async function VendorMessagesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/vendor/messages");

  const vendor = await prisma.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true, userId: true },
  });
  if (!vendor) redirect("/vendor/onboarding");

  // Pull every message where this vendor (the user) is sender or receiver, on
  // their own products, then group by (product, other-user) client-side.
  // For an MVP volume this is fine; an index-friendly view materializer can
  // come later if the inbox grows.
  const rows = await prisma.message.findMany({
    where: {
      product: { vendorId: vendor.id },
      OR: [
        { senderId: vendor.userId },
        { receiverId: vendor.userId },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      product: { select: { id: true, title: true, slug: true } },
      sender: { select: { id: true, name: true, email: true } },
      receiver: { select: { id: true, name: true, email: true } },
    },
  });

  const threadMap = new Map<string, Thread>();
  for (const row of rows) {
    const customer = row.senderId === vendor.userId ? row.receiver : row.sender;
    const key = `${row.productId}::${customer.id}`;
    if (threadMap.has(key)) continue; // we only need the latest per thread
    threadMap.set(key, {
      productId: row.productId,
      productTitle: row.product.title,
      productSlug: row.product.slug,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      lastBody: row.body,
      lastAt: row.createdAt.toISOString(),
      unread: row.receiverId === vendor.userId, // last message was inbound and unread-by-policy
    });
  }
  const threads = Array.from(threadMap.values()).sort((a, b) =>
    a.lastAt < b.lastAt ? 1 : -1,
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Customer messages
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          One thread per (product, customer). New messages stream in live.
        </p>
      </header>

      {threads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No customer messages yet.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {threads.map((t) => (
            <li
              key={`${t.productId}::${t.customerId}`}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {t.customerName ?? t.customerEmail}
                  </p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    on{" "}
                    <Link
                      href={`/products/${t.productSlug}`}
                      className="hover:underline"
                    >
                      {t.productTitle}
                    </Link>
                  </p>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(t.lastAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </header>
              <VendorThread
                productId={t.productId}
                productTitle={t.productTitle}
                customerId={t.customerId}
                customerName={t.customerName ?? t.customerEmail}
                vendorUserId={vendor.userId}
                initialLastBody={t.lastBody}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
