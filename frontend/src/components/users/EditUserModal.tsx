"use client";

import { useState } from "react";
import useSWR from "swr";
import { updateUser } from "@/lib/users";
import { listBrands } from "@/lib/brands";
import { ApiError } from "@/lib/apiClient";
import type { Role, UserListItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserListItem;
  onClose: () => void;
  onSaved: (updated: UserListItem) => void;
}) {
  const { data: brands } = useSWR("brands", listBrands, { revalidateOnFocus: false });

  const [fullName, setFullName] = useState(user.fullName);
  const [role, setRole] = useState<Role>(user.role);
  const [brandId, setBrandId] = useState(user.brand?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (role === "warehouse_staff" && !brandId) {
      setError("Select a brand for this warehouse staff account.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateUser(user.id, {
        fullName,
        role,
        brandId: role === "warehouse_staff" ? brandId : null,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-fullName">Full name</Label>
            <Input
              id="edit-fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-role">Role</Label>
            <Select
              id="edit-role"
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value as Role;
                setRole(nextRole);
                if (nextRole === "admin") setBrandId("");
              }}
              disabled={submitting}
            >
              <option value="warehouse_staff">Warehouse Staff</option>
              <option value="admin">Admin</option>
            </Select>
          </div>

          {role === "warehouse_staff" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-brand">Assigned brand</Label>
              <Select
                id="edit-brand"
                required
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                disabled={submitting}
              >
                <option value="" disabled>
                  Select a brand...
                </option>
                {(brands ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
