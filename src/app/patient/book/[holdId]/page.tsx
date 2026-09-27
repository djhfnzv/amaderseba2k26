import type { Metadata } from "next";
import Link from "next/link";
import { DoctorAvatar } from "@/components/doctor/doctor-avatar";
import { LocalTime } from "@/components/ui/local-time";
import { paymentLabel } from "@/lib/appointments/constants";
import { getOwnHold } from "@/lib/appointments/queries";
import { requireRole } from "@/lib/auth/guards";
import { doctorPhotoUrl, formatFee } from "@/lib/doctor/constants";
import { CONSULTATION_TYPE_LABEL } from "@/lib/schedule/constants";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Confirm appointment · MedLife" };

export default async function ConfirmBookingPage({ params }: PageProps<"/patient/book/[holdId]">) {
  await requireRole("patient", "/patient/appointments");
  const { holdId } = await params;
  const hold = /^[0-9a-f-]{36}$/i.test(holdId) ? await getOwnHold(holdId) : null;

  if (!hold || !hold.doctor || hold.expired) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">This hold has expired</h1>
        <p className="mt-2 text-slate-600">Slots are held for 5 minutes. Please pick a time again.</p>
        <Link
          href={hold?.doctor ? `/doctors/${hold.doctor.slug}` : "/doctors"}
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Pick a new time
        </Link>
      </div>
    );
  }

  const { doctor } = hold;
  const rows: [string, React.ReactNode][] = [
    ["When", <LocalTime key="t" iso={hold.slot_start} fallbackZone={doctor.timezone} />],
    ["Type", CONSULTATION_TYPE_LABEL[hold.consultation_type]],
    [
      "Where",
      hold.consultation_type === "online"
        ? "Video call in your browser — join from My appointments"
        : hold.chamber
          ? `${hold.chamber.name}, ${hold.chamber.address}, ${hold.chamber.city}`
          : "Chamber",
    ],
    ["Fee", formatFee(hold.fee)],
    ["Payment", paymentLabel(hold.consultation_type, "unpaid")],
  ];

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5">
      <div>
        <p className="text-sm font-semibold text-teal-700">Step 2 of 2</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Confirm your appointment</h1>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <DoctorAvatar name={doctor.display_name} photoUrl={doctorPhotoUrl(doctor.photo_path)} size={56} />
          <div>
            <p className="font-semibold text-slate-900">{doctor.display_name}</p>
            {doctor.headline && <p className="text-sm text-slate-600">{doctor.headline}</p>}
          </div>
        </div>
        <dl className="mt-5 flex flex-col gap-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <ConfirmForm holdId={hold.id} slug={doctor.slug} expiresAt={hold.expires_at} />
      </section>
    </div>
  );
}
