"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { updateUser } from "@/lib/users";
import { listBrands } from "@/lib/brands";
import { ApiError } from "@/lib/apiClient";
import type { Role, UserListItem } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300";

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Edit user</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="edit-fullName" className={labelClass}>
              Full name
            </label>
            <input
              id="edit-fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={submitting}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="edit-role" className={labelClass}>
              Role
            </label>
            <select
              id="edit-role"
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value as Role;
                setRole(nextRole);
                if (nextRole === "admin") setBrandId("");
              }}
              disabled={submitting}
              className={inputClass}
            >
              <option value="warehouse_staff">Warehouse Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {role === "warehouse_staff" ? (
            <div>
              <label htmlFor="edit-brand" className={labelClass}>
                Assigned brand
              </label>
              <select
                id="edit-brand"
                required
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                disabled={submitting}
                className={inputClass}
              >
                <option value="" disabled>
                  Select a brand...
                </option>
                {(brands ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
