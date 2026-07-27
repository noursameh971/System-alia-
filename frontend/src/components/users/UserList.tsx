"use client";

import { useState } from "react";
import type { UserListItem } from "@/lib/types";
import { updateUser } from "@/lib/users";
import { ApiError } from "@/lib/apiClient";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getBrandAccentClass } from "@/lib/brandColor";

export function UserList({
  users,
  currentUserId,
  onEdit,
  onResetPassword,
  onChanged,
  onError,
}: {
  users: UserListItem[];
  currentUserId: string | null;
  onEdit: (user: UserListItem) => void;
  onResetPassword: (user: UserListItem) => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [togglingId, setTogglingId] = useState<string | null>(null);

  if (users.length === 0) {
    return <EmptyState title="No staff accounts yet" description="Add the first one with the form above." />;
  }

  async function handleToggleActive(user: UserListItem) {
    setTogglingId(user.id);
    try {
      await updateUser(user.id, { isActive: !user.isActive });
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : `Failed to update ${user.fullName}`);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      {users.map((user) => {
        const isSelf = user.id === currentUserId;
        return (
          <div
            key={user.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 last:border-b-0 dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {user.fullName}
                {isSelf ? <span className="text-xs font-normal text-slate-400">(you)</span> : null}
                {!user.isActive ? <Badge variant="warning">Inactive</Badge> : null}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {user.brand ? (
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white ${getBrandAccentClass(user.brand.code)}`}
                  title={user.brand.name}
                >
                  {user.brand.code}
                </span>
              ) : null}
              <Badge variant={user.role === "admin" ? "brand" : "neutral"}>
                {user.role === "admin" ? "Admin" : "Warehouse Staff"}
              </Badge>

              <button
                type="button"
                onClick={() => onEdit(user)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onResetPassword(user)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Reset password
              </button>
              <button
                type="button"
                onClick={() => void handleToggleActive(user)}
                disabled={isSelf || togglingId === user.id}
                title={isSelf ? "You can't deactivate your own account" : undefined}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                  user.isActive
                    ? "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                    : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                }`}
              >
                {togglingId === user.id ? "..." : user.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
