import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/ui/local-time";
import { requireRole } from "@/lib/auth/guards";
import { listUsers, parseUserFilters, USERS_PAGE_SIZE, type UserFilters } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Users · Admin · MedLife" };

const ROLE_TABS = [
  { value: "", label: "All" },
  { value: "patient", label: "Patients" },
  { value: "doctor", label: "Doctors" },
  { value: "admin", label: "Admins" },
] as const;

function usersUrl(f: Partial<UserFilters>) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.role) p.set("role", f.role);
  if (f.status) p.set("status", f.status);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const qs = p.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireRole("admin", "/admin/users");
  const filters = parseUserFilters(await searchParams);
  const { users, total } = await listUsers(filters);
  const pages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Users</h1>
        <p className="mt-1 text-slate-600">Find accounts, and suspend or reactivate them.</p>
      </div>

      <form action="/admin/users" method="get" role="search" className="flex flex-col gap-3 sm:flex-row">
        {filters.role && <input type="hidden" name="role" value={filters.role} />}
        <label htmlFor="q" className="sr-only">Search by name, email or phone</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder="Name, email or phone"
          className="h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-teal-600"
        />
        <label htmlFor="status" className="sr-only">Status</label>
        <select
          id="status"
          name="status"
          defaultValue={filters.status}
          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-teal-600"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button type="submit" className="h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800">
          Search
        </button>
      </form>

      <nav aria-label="Filter by role" className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 sm:self-start">
        {ROLE_TABS.map((t) => (
          <Link
            key={t.value}
            href={usersUrl({ ...filters, role: t.value, page: 1 })}
            aria-current={filters.role === t.value ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
              filters.role === t.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <p className="text-sm text-slate-600">{total} account{total === 1 ? "" : "s"}</p>

      {users.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">No accounts match.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {/* Column headings (wider screens) */}
          <div className="hidden grid-cols-[minmax(0,1fr)_6.5rem_7rem_9rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>Name</span>
            <span>Role</span>
            <span>Status</span>
            <span>Joined</span>
          </div>
          <ul className="divide-y divide-slate-200">
            {users.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/admin/users/${u.id}`}
                  className="flex flex-col gap-2 px-5 py-4 hover:bg-slate-50 sm:grid sm:grid-cols-[minmax(0,1fr)_6.5rem_7rem_9rem] sm:items-center sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{u.full_name || "(no name)"}</p>
                    <p className="truncate text-sm text-slate-600">{[u.email, u.phone].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:contents">
                    <span className="w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-slate-700">{u.role}</span>
                    <span
                      className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        u.status === "active" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {u.status === "active" ? "Active" : "Suspended"}
                    </span>
                    <span className="text-sm text-slate-500">
                      <span className="sm:hidden">Joined </span>
                      <LocalTime iso={u.created_at} format="date" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3 text-sm">
          {filters.page > 1 && (
            <Link href={usersUrl({ ...filters, page: filters.page - 1 })} className="font-medium text-teal-700 hover:underline">
              ← Previous
            </Link>
          )}
          <span className="text-slate-600">
            Page {filters.page} of {pages}
          </span>
          {filters.page < pages && (
            <Link href={usersUrl({ ...filters, page: filters.page + 1 })} className="font-medium text-teal-700 hover:underline">
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
