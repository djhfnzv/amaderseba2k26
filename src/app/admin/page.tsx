import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getDashboardStats } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Admin · MedLife" };

export default async function AdminDashboard() {
  await requireRole("admin", "/admin");
  const s = await getDashboardStats();

  const cards = [
    {
      label: "Doctor verifications waiting",
      value: s.pendingVerifications,
      href: "/admin/verifications",
      cta: s.pendingVerifications > 0 ? "Review now →" : "Open queue →",
      highlight: s.pendingVerifications > 0,
    },
    { label: "Appointments today", value: s.appointmentsToday, sub: `${s.appointmentsUpcoming} upcoming after today` },
    { label: "Patients", value: s.patients, href: "/admin/users?role=patient", cta: "View patients →" },
    {
      label: "Doctors",
      value: s.doctors,
      sub: `${s.verifiedDoctors} verified`,
      href: "/admin/users?role=doctor",
      cta: "View doctors →",
    },
    {
      label: "Suspended accounts",
      value: s.suspended,
      href: "/admin/users?status=suspended",
      cta: "View →",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Admin panel</h1>
        <p className="mt-1 text-slate-600">Operate and moderate the MedLife platform.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5">
        {cards.map((c) => {
          const body = (
            <>
              <p className="text-sm font-medium text-slate-600">{c.label}</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{c.value}</p>
              {c.sub && <p className="mt-1 text-sm text-slate-500">{c.sub}</p>}
              {c.cta && <p className="mt-2 text-sm font-semibold text-teal-700">{c.cta}</p>}
            </>
          );
          const cls = `rounded-2xl border p-5 ${c.highlight ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`;
          return c.href ? (
            <Link key={c.label} href={c.href} className={`${cls} transition-shadow hover:shadow-md`}>
              {body}
            </Link>
          ) : (
            <div key={c.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-900">Coming later</h2>
        <p className="mt-1 text-sm text-slate-600">
          Payments & refunds, complaints, review moderation, specialties & medicines, analytics and audit logs.
        </p>
      </section>
    </div>
  );
}
