"use client";

import { useState, type FormEvent } from "react";
import { changeOwnPassword } from "@/lib/users";
import { ApiError } from "@/lib/apiClient";
import { useLocale } from "@/context/LocaleContext";
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

/** Reachable from the Header by any signed-in user (admin or warehouse staff) — unlike ResetPasswordModal (admin-only, no current-password check), this proves ownership first. */
export function ChangePasswordModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useLocale();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(t("Password must be at least 8 characters."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("New passwords don't match."));
      return;
    }

    setSubmitting(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      onOpenChange(false);
      resetForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Failed to change password"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("Change password")}</DialogTitle>
            <DialogDescription>{t("Update the password for your own account.")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">{t("Current password")}</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="change-new-password">{t("New password")}</Label>
            <Input
              id="change-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={submitting}
              placeholder={t("Min. 8 characters")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-new-password">{t("Confirm new password")}</Label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Saving...") : t("Save changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
