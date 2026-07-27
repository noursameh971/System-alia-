import { apiFetch } from "./apiClient";
import type { CreateUserInput, UserListItem } from "./types";

export function listUsers(): Promise<UserListItem[]> {
  return apiFetch<UserListItem[]>("/api/users");
}

export function createUser(input: CreateUserInput): Promise<UserListItem> {
  return apiFetch<UserListItem>("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
