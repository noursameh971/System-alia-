"use client";

import { useState } from "react";
import { resetUserPassword } from "@/lib/users";
import { ApiError } from "@/lib/apiClient";
import type { UserListItem } from "@/lib/types";
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

export function ResetPasswordModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await resetUserPassword(user.id, password);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              {user.fullName} &middot; {user.email}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              placeholder="Min. 8 characters"
            />
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            This takes effect immediately — {user.fullName} will need to use this password on their next login.
          </p>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Resetting..." : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
