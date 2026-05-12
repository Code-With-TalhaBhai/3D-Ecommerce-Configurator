"use client";

import { useState, useTransition, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { changeRole, deleteUser, toggleSuspend, type ActionResult } from "./actions";

type Row = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "VENDOR" | "CUSTOMER";
  suspendedAt: string | null;
  createdAt: string;
  orderCount: number;
};

const roleStyle: Record<Row["role"], string> = {
  ADMIN: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  VENDOR: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  CUSTOMER: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function UserRow({ user, isSelf }: { user: Row; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isSuspended = !!user.suspendedAt;
  const canDelete = user.orderCount === 0 && !isSelf;

  function callAction(action: (fd: FormData) => Promise<ActionResult>, fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) setError(result.error);
    });
  }

  function onRoleChange(e: ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData();
    fd.set("id", user.id);
    fd.set("role", e.target.value);
    callAction(changeRole, fd);
  }

  function onSuspend() {
    const fd = new FormData();
    fd.set("id", user.id);
    callAction(toggleSuspend, fd);
  }

  function onDelete() {
    const fd = new FormData();
    fd.set("id", user.id);
    callAction(deleteUser, fd);
    setConfirmDelete(false);
  }

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {user.name ?? "—"}
            {isSelf && (
              <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                (you)
              </span>
            )}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{user.email}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        {isSelf ? (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${roleStyle[user.role]}`}>
            {user.role}
          </span>
        ) : (
          <select
            value={user.role}
            onChange={onRoleChange}
            disabled={pending}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="CUSTOMER">CUSTOMER</option>
            <option value="VENDOR">VENDOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            isSuspended
              ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200"
              : "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
          }`}
        >
          {isSuspended ? "Suspended" : "Active"}
        </span>
      </td>
      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{user.orderCount}</td>
      <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {!isSelf && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onSuspend}
              disabled={pending}
            >
              {isSuspended ? "Reactivate" : "Suspend"}
            </Button>
          )}
          {!isSelf && (
            confirmDelete ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={onDelete}
                  disabled={pending}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={!canDelete || pending}
                title={!canDelete ? "User has orders or is you — suspend instead" : undefined}
              >
                Delete
              </Button>
            )
          )}
        </div>
        {error && (
          <p className="mt-1 text-right text-[11px] text-red-600">{error}</p>
        )}
      </td>
    </tr>
  );
}
