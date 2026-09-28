import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConsultRoom } from "@/components/consult/consult-room";
import { OpensSoon } from "@/components/consult/opens-soon";
import { Logo } from "@/components/landing/logo";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/lib/auth/guards";
import { getIceServers } from "@/lib/consult/ice";
import { ageFromDob, formatDate } from "@/lib/format";
import { kickSmsDispatch } from "@/lib/notifications/dispatch";
import { FILE_CATEGORY_LABEL, SEX_OPTIONS } from "@/lib/patient/constants";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Consultation · MedLife", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConsultPage({ params }: PageProps<"/consult/[appointmentId]">) {
  const { appointmentId } = await params;
  const user = await requireUser(`/consult/${appointmentId}`);
  if (!UUID.test(appointmentId) || (user.role !== "doctor" && user.role !== "patient")) notFound();

  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("open_consultation", { p_appointment: appointmentId });
  if (error?.code === "P0002") notFound();
  const room = rows?.[0];
  // The doctor arriving notifies the patient (SMS goes out after the response).
  if (user.role === "doctor" && room?.room_status === "open") kickSmsDispatch();

  const doneHref = user.role === "doctor" ? `/doctor/appointments/${appointmentId}` : `/patient/appointments/${appointmentId}`;

  if (error || !room) {
    return (
      <Shell doneHref={doneHref}>
        <Notice title="You can't join this consultation" body={error?.code === "22023" ? error.message : "Something went wrong. Please try again."} doneHref={doneHref} />
      </Shell>
    );
  }

  const { data: appt } = await supabase
    .from("appointments")
    .select("id, doctor_id, patient_id, slot_start, slot_end")
    .eq("id", appointmentId)
    .single();
  if (!appt) notFound();

  const [{ data: doctor }, { data: patient }] = await Promise.all([
    supabase.from("doctor_profiles").select("display_name, timezone").eq("user_id", appt.doctor_id).maybeSingle(),
    supabase.from("users").select("full_name, email").eq("id", appt.patient_id).maybeSingle(),
  ]);
  const doctorName = doctor?.display_name ?? "the doctor";
  const patientName = patient?.full_name || patient?.email || "the patient";
  const peerName = room.role === "doctor" ? patientName : doctorName;
  const zone = doctor?.timezone;

  if (room.room_status === "not_open") {
    return (
      <Shell doneHref={doneHref}>
        <div className="mx-auto w-full max-w-md animate-fade-up rounded-2xl bg-white p-8 text-center text-slate-900">
          <h1 className="text-xl font-bold">The room opens 10 minutes before your appointment</h1>
          <p className="mt-2 text-sm text-slate-600">
            Consultation with {peerName} at <LocalTime iso={appt.slot_start} fallbackZone={zone} />.
          </p>
          <OpensSoon opensAt={room.opens_at} />
          <p className="mt-2 text-xs text-slate-500">This page opens the room automatically.</p>
          <Link href={doneHref} className="mt-6 inline-block text-sm font-semibold text-teal-700 hover:underline">
            ← Back to appointment
          </Link>
        </div>
      </Shell>
    );
  }

  const { data: messages } = await supabase
    .from("consultation_messages")
    .select("*")
    .eq("appointment_id", appointmentId)
    .order("created_at")
    .limit(200);

  if (room.room_status === "ended" || room.room_status === "closed") {
    return (
      <Shell doneHref={doneHref}>
        <div className="mx-auto w-full max-w-2xl animate-fade-up rounded-2xl bg-white p-6 text-slate-900 sm:p-8">
          <h1 className="text-xl font-bold">
            {room.room_status === "ended" ? "This consultation has ended" : "This consultation room is closed"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            With {peerName} · <LocalTime iso={appt.slot_start} fallbackZone={zone} />
          </p>
          <h2 className="mt-6 text-sm font-semibold">Chat history</h2>
          {messages?.length ? (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {messages.map((m) => (
                <li key={m.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-500">
                    {m.sender_id === user.id ? "You" : peerName} · <LocalTime iso={m.created_at} format="time" fallbackZone={zone} />
                  </span>
                  <p className="whitespace-pre-wrap">
                    {m.kind === "text" ? (
                      m.body
                    ) : (
                      <a href={`/consult-files/${m.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 underline">
                        {m.file_name}
                      </a>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No messages were exchanged.</p>
          )}
          <Link href={doneHref} className="mt-6 inline-block text-sm font-semibold text-teal-700 hover:underline">
            ← Back to appointment
          </Link>
        </div>
      </Shell>
    );
  }

  // Room is open.
  const [{ iceServers, hasTurn }, notesRow, patientPanel] = await Promise.all([
    getIceServers(),
    room.role === "doctor"
      ? supabase.from("consultations").select("notes").eq("appointment_id", appointmentId).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
    room.role === "doctor" ? PatientSummary({ patientId: appt.patient_id }) : Promise.resolve(undefined),
  ]);

  return (
    <Shell doneHref={doneHref} fullBleed title={`Consultation with ${peerName}`}>
      <ConsultRoom
        appointmentId={appointmentId}
        role={room.role}
        meId={user.id}
        peerName={peerName}
        names={{ [appt.doctor_id]: doctorName, [appt.patient_id]: patientName }}
        iceServers={iceServers}
        hasTurn={hasTurn}
        initialMessages={messages ?? []}
        initialNotes={notesRow?.notes ?? ""}
        patientPanel={patientPanel}
        doneHref={doneHref}
      />
    </Shell>
  );
}

/** Dark, distraction-free frame for the call. */
function Shell({ children, doneHref, fullBleed, title }: { children: React.ReactNode; doneHref: string; fullBleed?: boolean; title?: string }) {
  // The logo leads back to the dashboard home (/doctor or /patient), not the landing page.
  const homeHref = doneHref.startsWith("/doctor") ? "/doctor" : "/patient";
  return (
    <div className="flex h-dvh flex-col bg-slate-900 text-white">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Logo tone="light" href={homeHref} />
          {title && <span className="hidden truncate text-sm text-slate-300 sm:inline">· {title}</span>}
        </div>
        <Link href={doneHref} className="shrink-0 text-sm text-slate-300 hover:text-white">
          Exit
        </Link>
      </header>
      <main className={`flex min-h-0 flex-1 ${fullBleed ? "" : "items-center justify-center p-4"}`}>{children}</main>
    </div>
  );
}

function Notice({ title, body, doneHref }: { title: string; body: string; doneHref: string }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 text-center text-slate-900">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
      <Link href={doneHref} className="mt-6 inline-block text-sm font-semibold text-teal-700 hover:underline">
        ← Back to appointment
      </Link>
    </div>
  );
}

/** Doctor's side panel: health profile + reports (RLS: only this doctor's own patients). */
async function PatientSummary({ patientId }: { patientId: string }) {
  const supabase = await createClient();
  const [{ data: hp }, { data: files }] = await Promise.all([
    supabase.from("patient_profiles").select("*").eq("user_id", patientId).maybeSingle(),
    supabase.from("medical_files").select("id, title, category, report_date").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(20),
  ]);
  const age = ageFromDob(hp?.date_of_birth ?? null);
  const sex = SEX_OPTIONS.find((s) => s.value === hp?.sex)?.label;

  return (
    <div className="flex flex-col gap-5 text-sm">
      {hp ? (
        <>
          <dl className="grid grid-cols-2 gap-2">
            {[
              ["Age", age != null ? `${age} yrs` : "—"],
              ["Sex", sex ?? "—"],
              ["Blood group", hp.blood_group ?? "—"],
              ["Weight", hp.weight_kg != null ? `${hp.weight_kg} kg` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 p-2.5">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Allergies</p>
            <p className="mt-1">{hp.allergies.length ? hp.allergies.join(", ") : "None recorded"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chronic conditions</p>
            <p className="mt-1">{hp.chronic_conditions.length ? hp.chronic_conditions.join(", ") : "None recorded"}</p>
          </div>
        </>
      ) : (
        <p className="text-slate-600">No health profile yet.</p>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reports</p>
        {files?.length ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {files.map((f) => (
              <li key={f.id}>
                <a href={`/medical-files/${f.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 hover:underline">
                  {f.title}
                </a>
                <span className="text-xs text-slate-500">
                  {" "}· {FILE_CATEGORY_LABEL[f.category]}
                  {f.report_date && ` · ${formatDate(f.report_date)}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-slate-600">No reports uploaded.</p>
        )}
      </div>
    </div>
  );
}
