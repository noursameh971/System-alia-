"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { listUsers } from "@/lib/users";
import { ApiError } from "@/lib/apiClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { MovementStatusBanner, type MovementStatus } from "@/components/inventory/MovementStatusBanner";
import { AddUserForm } from "@/components/users/AddUserForm";
import { UserList } from "@/components/users/UserList";
import { EditUserModal } from "@/components/users/EditUserModal";
import { ResetPasswordModal } from "@/components/users/ResetPasswordModal";
import type { UserListItem } from "@/lib/types";

export default function UsersPage() {
  const router = useRouter();
  const { id: currentUserId, role, isLoading: isSessionLoading } = useCurrentUser();
  const isAdmin = role === "admin";

  const { data, error, isLoading, mutate } = useSWR(isAdmin ? "users" : null, listUsers);

  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [resettingUser, setResettingUser] = useState<UserListItem | null>(null);
  const [status, setStatus] = useState<MovementStatus | null>(null);

  useEffect(() => {
    // Client-side convenience only — every /api/users route and proxy.ts
    // are the real enforcement, which doesn't change if this check is ever
    // bypassed. Wait for the session to actually load first (see
    // dashboard/page.tsx for why).
    if (!isSessionLoading && !isAdmin) router.replace("/");
  }, [isSessionLoading, isAdmin, router]);

  if (isSessionLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Redirecting..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-950/95">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">User Management</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Staff accounts &amp; workspace access</p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ← Dashboard
        </Link>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        <AddUserForm onCreated={() => void mutate()} />

        <MovementStatusBanner status={status} />

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading users..." />
          </div>
        ) : error ? (
          <EmptyState
            title="Couldn't load users"
            description={error instanceof ApiError ? error.message : "Check that the backend API is running."}
          />
        ) : (
          <UserList
            users={data ?? []}
            currentUserId={currentUserId}
            onEdit={setEditingUser}
            onResetPassword={setResettingUser}
            onChanged={() => void mutate()}
            onError={(message) => setStatus({ kind: "error", message })}
          />
        )}
      </main>

      {editingUser ? (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) => {
            setStatus({ kind: "success", message: `${updated.fullName} was updated.` });
            void mutate();
          }}
        />
      ) : null}

      {resettingUser ? (
        <ResetPasswordModal
          user={resettingUser}
          onClose={() => setResettingUser(null)}
          onSaved={() => setStatus({ kind: "success", message: `Password reset for ${resettingUser.fullName}.` })}
        />
      ) : null}
    </div>
  );
}
