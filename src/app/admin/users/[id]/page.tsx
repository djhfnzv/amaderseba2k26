import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/ui/local-time";
import { StatusPill } from "@/components/verification/status-pill";
import { getUser, listAdminActions, userAppointmentStats } from "@/lib/admin/queries";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { StatusForm } from "./status-form";

export const metadata: Metadata = { title: "User · Admin · MedLife" };

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const me = await requireRole("admin", "/admin/users");
  const { id } = await params;
  const user = /^[0-9a-f-]{36}$/i.test(id) ? await getUser(id) : null;
  if (!user) notFound();

  const supabase = await createClient();
  const [actions, stats, doctor, verification] = await Promise.all([
    listAdminActions(user.id),
    userAppointmentStats(user.id),
    user.role === "doctor"
      ? supabase.from("doctor_profiles").select("slug, display_name, is_verified").eq("user_id", user.id).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
    user.role === "doctor"
      ? supabase.from("verification_requests").select("id, status").eq("doctor_id", user.id).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
  ]);
  const upcoming = user.role === "doctor" ? stats.asDoctorUpcoming : stats.asPatientUpcoming;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/users" className="text-sm font-medium text-teal-700 hover:underline">
        ← Users
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{user.full_name || user.email || "User"}</h1>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-slate-700">{user.role}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            user.status === "active" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-800"
          }`}
        >
          {user.status === "active" ? "Active" : "Suspended"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_18rem] @5xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Account">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Row label="Email">{user.email ?? "—"}</Row>
              <Row label="Phone">{user.phone ?? "—"}</Row>
              <Row label="Joined"><LocalTime iso={user.created_at} /></Row>
              <Row label="Last updated"><LocalTime iso={user.updated_at} /></Row>
              {user.status === "suspended" && user.suspended_reason && (
                <div className="rounded-lg bg-red-50 p-3 sm:col-span-2">
                  <dt className="text-red-800">Suspension reason</dt>
                  <dd className="mt-0.5 font-medium text-slate-900">{user.suspended_reason}</dd>
                </div>
              )}
            </dl>
          </Card>

          {user.role === "doctor" && (
            <Card title="Doctor">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-600">Verification:</span>
                <StatusPill status={verification?.status ?? null} />
                {verification && (
                  <Link href={`/admin/verifications/${verification.id}`} className="font-medium text-teal-700 hover:underline">
                    Open request
                  </Link>
                )}
                {doctor && (
                  <Link href={`/doctors/${doctor.slug}`} target="_blank" className="font-medium text-teal-700 hover:underline">
                    View portfolio ↗
                  </Link>
                )}
              </div>
            </Card>
          )}

          <Card title="Appointments">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {user.role === "doctor" ? (
                <>
                  <Row label="Total as doctor">{stats.asDoctor}</Row>
                  <Row label="Upcoming">{stats.asDoctorUpcoming}</Row>
                </>
              ) : (
                <>
                  <Row label="Total booked">{stats.asPatient}</Row>
                  <Row label="Upcoming">{stats.asPatientUpcoming}</Row>
                </>
              )}
            </dl>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 @4xl:self-start">
          <Card title="Account status">
            {user.role === "admin" ? (
              <p className="text-sm text-slate-600">Admin accounts are managed with <code>npm run create-admin</code> and SQL.</p>
            ) : user.id === me.id ? (
              <p className="text-sm text-slate-600">You can&apos;t change your own account.</p>
            ) : (
              <StatusForm userId={user.id} status={user.status} role={user.role} upcomingCount={upcoming} />
            )}
          </Card>

          <Card title="Admin history">
            {actions.length === 0 ? (
              <p className="text-sm text-slate-600">No admin actions yet.</p>
            ) : (
              <ol className="flex flex-col gap-3 text-sm">
                {actions.map((a) => (
                  <li key={a.id} className="border-l-2 border-slate-200 pl-3">
                    <p className="font-medium capitalize text-slate-900">{a.action}</p>
                    <p className="text-slate-500">
                      <LocalTime iso={a.created_at} />
                      {a.adminName && ` · ${a.adminName}`}
                    </p>
                    {a.reason && <p className="mt-1 text-slate-700">“{a.reason}”</p>}
                    {!!a.details.cancelled_appointments && (
                      <p className="text-slate-500">{a.details.cancelled_appointments} appointment(s) cancelled</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{children}</dd>
    </div>
  );
}
