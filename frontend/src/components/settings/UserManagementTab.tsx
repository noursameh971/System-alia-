"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { listUsers } from "@/lib/users";
import { ApiError } from "@/lib/apiClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocale } from "@/context/LocaleContext";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddUserModal } from "@/components/users/AddUserModal";
import { UserList } from "@/components/users/UserList";
import { EditUserModal } from "@/components/users/EditUserModal";
import { ResetPasswordModal } from "@/components/users/ResetPasswordModal";
import type { UserListItem } from "@/lib/types";

/** Settings > "User Management" — staff roster, role/brand assignment, and account lifecycle. */
export function UserManagementTab() {
  const { id: currentUserId } = useCurrentUser();
  const { t } = useLocale();
  const { data, error, isLoading, mutate } = useSWR("users", listUsers);

  const [addOpen, setAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [resettingUser, setResettingUser] = useState<UserListItem | null>(null);

  const users = data ?? [];
  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Staff accounts")}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isLoading
              ? t("Loading...")
              : `${activeCount} ${t("active")} · ${users.length} ${t("total")}`}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="size-4" />
          {t("Add user")}
        </Button>
      </div>

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
          users={users}
          currentUserId={currentUserId}
          onEdit={setEditingUser}
          onResetPassword={setResettingUser}
          onChanged={() => void mutate()}
          onError={(message) => toast.error(message)}
          onAddUser={() => setAddOpen(true)}
        />
      )}

      <AddUserModal open={addOpen} onOpenChange={setAddOpen} onCreated={() => void mutate()} />

      {editingUser ? (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) => {
            toast.success(`${updated.fullName} was updated.`);
            void mutate();
          }}
        />
      ) : null}

      {resettingUser ? (
        <ResetPasswordModal
          user={resettingUser}
          onClose={() => setResettingUser(null)}
          onSaved={() => toast.success(`Password reset for ${resettingUser.fullName}.`)}
        />
      ) : null}
    </div>
  );
}
