import type { UserListItem } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getBrandAccentClass } from "@/lib/brandColor";

export function UserList({ users }: { users: UserListItem[] }) {
  if (users.length === 0) {
    return <EmptyState title="No staff accounts yet" description="Add the first one with the form above." />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      {users.map((user) => (
        <div
          key={user.id}
          className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 last:border-b-0 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {user.fullName}
              {!user.isActive ? <Badge variant="warning">Inactive</Badge> : null}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>

          <div className="flex items-center gap-2">
            {user.brand ? (
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white ${getBrandAccentClass(user.brand.code)}`}
                title={user.brand.name}
              >
                {user.brand.code}
              </span>
            ) : null}
            <Badge variant={user.role === "admin" ? "brand" : "neutral"}>
              {user.role === "admin" ? "Admin" : "Warehouse Staff"}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
