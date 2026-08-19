"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { createUser } from "@/lib/users";
import { listBrands } from "@/lib/brands";
import { ApiError } from "@/lib/apiClient";
import { useLocale } from "@/context/LocaleContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Role, UserListItem } from "@/lib/types";

/** Replaces the old always-visible AddUserForm card — staff creation is an occasional action, so it shouldn't permanently occupy the top of the User Management tab. */
export function AddUserModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: UserListItem) => void;
}) {
  const { t } = useLocale();
  const { data: brands } = useSWR("brands", listBrands, { revalidateOnFocus: false });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("warehouse_staff");
  const [brandId, setBrandId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("warehouse_staff");
    setBrandId("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (role === "warehouse_staff" && !brandId) {
      toast.error("Select a brand for this warehouse staff account.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await createUser({
        fullName,
        email,
        password,
        role,
        brandId: role === "warehouse_staff" ? brandId : undefined,
      });
      onCreated(user);
      toast.success(`${user.fullName} was added.`);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Add new user")}</DialogTitle>
          <DialogDescription>{t("Staff sign in with this email and change the password afterwards.")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-name">{t("Full name")}</Label>
            <Input
              id="new-user-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-email">{t("Email")}</Label>
              <Input
                id="new-user-email"
                type="email"
                autoComplete="off"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-password">{t("Temporary password")}</Label>
              <Input
                id="new-user-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                placeholder={t("Min. 8 characters")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-role">{t("Role")}</Label>
              <Select
                id="new-user-role"
                value={role}
                onChange={(e) => {
                  const nextRole = e.target.value as Role;
                  setRole(nextRole);
                  if (nextRole === "admin") setBrandId("");
                }}
                disabled={submitting}
              >
                <option value="warehouse_staff">{t("Warehouse Staff")}</option>
                <option value="admin">{t("Admin")}</option>
              </Select>
            </div>

            {role === "warehouse_staff" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-user-brand">{t("Assigned Brand")}</Label>
                <Select
                  id="new-user-brand"
                  required
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  disabled={submitting}
                >
                  <option value="" disabled>
                    {t("Select a brand...")}
                  </option>
                  {(brands ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="hidden sm:block" aria-hidden />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Adding...") : t("Add user")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
