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
    {
      label: "Complaints needing action",
      value: s.openComplaints,
      href: "/admin/complaints",
      cta: s.openComplaints > 0 ? "Handle now →" : "Open queue →",
      highlight: s.openComplaints > 0,
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-3">
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
            <Link key={c.label} href={c.href} className={`${cls} transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-md`}>
              {body}
            </Link>
          ) : (
            <div key={c.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { href: "/admin/analytics", title: "Analytics", text: "Bookings, revenue, cancellations, top doctors" },
          { href: "/admin/audit", title: "Audit log", text: "Who viewed or changed medical data" },
          { href: "/admin/catalog", title: "Specialties & tests", text: "What doctors can list and prescribe" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-2xl border border-slate-200 bg-white p-4 transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="font-semibold text-slate-900">{l.title} →</p>
            <p className="mt-0.5 text-sm text-slate-600">{l.text}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
