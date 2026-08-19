"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreVertical, UserPlus } from "lucide-react";
import type { UserListItem } from "@/lib/types";
import { updateUser } from "@/lib/users";
import { ApiError } from "@/lib/apiClient";
import { useLocale } from "@/context/LocaleContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getBrandAccentClass, getBrandInitials } from "@/lib/brandColor";

export function UserList({
  users,
  currentUserId,
  onEdit,
  onResetPassword,
  onChanged,
  onError,
  onAddUser,
}: {
  users: UserListItem[];
  currentUserId: string | null;
  onEdit: (user: UserListItem) => void;
  onResetPassword: (user: UserListItem) => void;
  onChanged: () => void;
  onError: (message: string) => void;
  onAddUser?: () => void;
}) {
  const { t } = useLocale();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  if (users.length === 0) {
    return (
      <EmptyState
        title={t("No staff accounts yet")}
        description={t("Create the first account to give your team access.")}
        action={
          onAddUser ? (
            <Button onClick={onAddUser}>
              <UserPlus className="size-4" />
              {t("Add user")}
            </Button>
          ) : undefined
        }
      />
    );
  }

  async function handleToggleActive(user: UserListItem) {
    setTogglingId(user.id);
    try {
      await updateUser(user.id, { isActive: !user.isActive });
      toast.success(user.isActive ? `${user.fullName} deactivated.` : `${user.fullName} reactivated.`);
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : `Failed to update ${user.fullName}`);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="py-3">{t("Name & Email")}</TableHead>
            <TableHead className="py-3">{t("Role")}</TableHead>
            <TableHead className="py-3">{t("Assigned Brand")}</TableHead>
            <TableHead className="py-3">{t("Status")}</TableHead>
            <TableHead className="py-3 text-end">{t("Actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            return (
              <TableRow key={user.id}>
                <TableCell className="py-3">
                  <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                    {user.fullName}
                    {isSelf ? <span className="text-xs font-normal text-slate-400">({t("you")})</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                </TableCell>
                <TableCell className="py-3">
                  <Badge variant={user.role === "admin" ? "brand" : "neutral"}>
                    {t(user.role === "admin" ? "Admin" : "Warehouse Staff")}
                  </Badge>
                </TableCell>
                <TableCell className="py-3">
                  {user.brand ? (
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-wide text-white ${getBrandAccentClass(user.brand.code)}`}
                      >
                        {getBrandInitials(user.brand.name)}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">{user.brand.name}</span>
                    </div>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-600">—</span>
                  )}
                </TableCell>
                <TableCell className="py-3">
                  <Badge variant={user.isActive ? "success" : "warning"}>
                    {t(user.isActive ? "Active" : "Inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="py-3 text-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${user.fullName}`}>
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onEdit(user)}>{t("Edit")}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onResetPassword(user)}>{t("Reset password")}</DropdownMenuItem>
                      <DropdownMenuItem
                        variant={user.isActive ? "destructive" : "default"}
                        disabled={isSelf || togglingId === user.id}
                        onSelect={() => void handleToggleActive(user)}
                      >
                        {togglingId === user.id ? "Working..." : t(user.isActive ? "Deactivate" : "Reactivate")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
