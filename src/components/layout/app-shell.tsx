import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/landing/logo";
import type { AppUser, Role } from "@/types/database";

const ROLE_LABEL: Record<Role, string> = {
  patient: "Patient",
  doctor: "Doctor",
  admin: "Admin",
};

export type NavItem = { href: string; label: string };

/** Header + content frame shared by the patient, doctor and admin areas. */
export function AppShell({
  user,
  nav,
  children,
}: {
  user: AppUser;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav aria-label="Main" className="hidden gap-5 text-sm sm:flex">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="text-slate-700 hover:text-teal-700">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{user.full_name || user.email}</p>
              <p className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
        {nav.length > 0 && (
          <nav aria-label="Main" className="flex gap-4 overflow-x-auto px-4 pb-3 text-sm sm:hidden">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap text-slate-700">
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
