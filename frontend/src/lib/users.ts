import { apiFetch } from "./apiClient";
import type { CreateUserInput, UpdateUserInput, UserListItem } from "./types";

export function listUsers(): Promise<UserListItem[]> {
  return apiFetch<UserListItem[]>("/api/users");
}

export function createUser(input: CreateUserInput): Promise<UserListItem> {
  return apiFetch<UserListItem>("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateUser(userId: string, input: UpdateUserInput): Promise<UserListItem> {
  return apiFetch<UserListItem>(`/api/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function resetUserPassword(userId: string, password: string): Promise<void> {
  await apiFetch<{ success: boolean }>(`/api/users/${encodeURIComponent(userId)}/password`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
}

export async function deleteUser(userId: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

/** Self-service password change — the currently signed-in user changing their own password. */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch<{ success: boolean }>("/api/users/me/password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
