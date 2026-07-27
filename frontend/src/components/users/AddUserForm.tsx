"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { createUser } from "@/lib/users";
import { listBrands } from "@/lib/brands";
import { ApiError } from "@/lib/apiClient";
import { MovementStatusBanner, type MovementStatus } from "@/components/inventory/MovementStatusBanner";
import type { Role, UserListItem } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300";

export function AddUserForm({ onCreated }: { onCreated: (user: UserListItem) => void }) {
  const { data: brands } = useSWR("brands", listBrands, { revalidateOnFocus: false });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("warehouse_staff");
  const [brandId, setBrandId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<MovementStatus | null>(null);

  function reset() {
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("warehouse_staff");
    setBrandId("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (role === "warehouse_staff" && !brandId) {
      setStatus({ kind: "error", message: "Select a brand for this warehouse staff account." });
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
      setStatus({ kind: "success", message: `${user.fullName} was added.` });
      reset();
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Failed to create user" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add new user</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="fullName" className={labelClass}>
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={submitting}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="new-user-email" className={labelClass}>
            Email
          </label>
          <input
            id="new-user-email"
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="new-user-password" className={labelClass}>
            Temporary password
          </label>
          <input
            id="new-user-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            placeholder="Min. 8 characters"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="role" className={labelClass}>
            Role
          </label>
          <select
            id="role"
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
            <label htmlFor="brand" className={labelClass}>
              Assigned brand
            </label>
            <select
              id="brand"
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
      </div>

      <MovementStatusBanner status={status} />

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        {submitting ? "Adding..." : "Add user"}
      </button>
    </form>
  );
}
