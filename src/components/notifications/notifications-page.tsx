import Link from "next/link";
import { NotificationLink } from "@/components/notifications/notification-center";
import { SmsSettings } from "@/components/notifications/sms-settings";
import { markAllReadForm } from "@/lib/notifications/actions";
import { getPreferences, listNotifications } from "@/lib/notifications/queries";
import { smsIsLive } from "@/lib/sms/provider";
import type { AppUser } from "@/types/database";

/** Shared body of /patient|doctor|admin/notifications. */
export async function NotificationsPage({
  user,
  basePath,
  searchParams,
}: {
  user: AppUser;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const unreadOnly = searchParams.show === "unread";
  const page = Math.max(1, Math.min(50, Number(searchParams.page) || 1));
  const showSms = user.role !== "admin";
  const [{ items, hasMore }, prefs] = await Promise.all([
    listNotifications(user.id, { page, unreadOnly }),
    showSms ? getPreferences(user.id) : Promise.resolve(null),
  ]);
  const hasUnread = items.some((n) => !n.read_at);
  const href = (p: Record<string, string>) => `${basePath}?${new URLSearchParams(p)}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Notifications</h1>
        <p className="mt-1 text-slate-600">Updates about your {user.role === "doctor" ? "patients, bookings and account" : user.role === "admin" ? "platform" : "appointments and prescriptions"}.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <nav aria-label="Filter" className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {[
                { value: "all", label: "All" },
                { value: "unread", label: "Unread" },
              ].map((t) => {
                const active = (t.value === "unread") === unreadOnly;
                return (
                  <Link
                    key={t.value}
                    href={href({ show: t.value })}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-md px-3 py-1 text-sm font-medium ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
            {hasUnread && (
              <form action={markAllReadForm}>
                <button type="submit" className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50">
                  Mark all as read
                </button>
              </form>
            )}
          </div>

          {items.length === 0 ? (
            <p className="p-10 text-center text-slate-600">{unreadOnly ? "No unread notifications." : "No notifications yet."}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationLink n={n} />
                </li>
              ))}
            </ul>
          )}

          {(page > 1 || hasMore) && (
            <div className="flex justify-between border-t border-slate-200 px-4 py-3 text-sm font-medium">
              {page > 1 ? (
                <Link href={href({ show: unreadOnly ? "unread" : "all", page: String(page - 1) })} className="text-teal-700 hover:underline">
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              {hasMore && (
                <Link href={href({ show: unreadOnly ? "unread" : "all", page: String(page + 1) })} className="text-teal-700 hover:underline">
                  Older →
                </Link>
              )}
            </div>
          )}
        </section>

        {showSms && (
          <aside className="flex min-w-0 flex-col gap-4 @4xl:self-start">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-900">SMS alerts</h2>
              <p className="mt-1 mb-4 text-sm text-slate-600">
                {user.role === "doctor"
                  ? "Get a text for new bookings, cancellations and verification updates."
                  : "Get a text when a booking is confirmed or changed, reminders 24 hours and 1 hour before, and when a prescription is ready."}
              </p>
              <SmsSettings
                phone={prefs?.sms_phone_verified_at ? prefs.sms_phone : null}
                enabled={prefs?.sms_enabled ?? true}
                live={smsIsLive()}
              />
            </section>
            <p className="px-1 text-xs text-slate-500">
              In-app notifications are always on. Texts never include diagnoses or medicines.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
