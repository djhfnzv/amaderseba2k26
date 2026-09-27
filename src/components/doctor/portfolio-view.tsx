import { SlotPicker } from "@/components/schedule/slot-picker";
import { BookingWidget } from "@/components/booking/booking-widget";
import { todayIn } from "@/lib/schedule/queries";
import type { AvailableSlot } from "@/types/database";
import { DoctorAvatar } from "./doctor-avatar";
import {
  doctorPhotoUrl,
  formatFee,
  summarizeItem,
  yearsOfExperience,
} from "@/lib/doctor/constants";
import type { Portfolio } from "@/lib/doctor/queries";

/** The public portfolio page body (also used for the doctor's own preview). */
export function PortfolioView({
  portfolio,
  slots,
  bookable,
  embedded = false,
}: {
  portfolio: Portfolio;
  slots: AvailableSlot[];
  /** False for an unverified doctor's own preview. */
  bookable: boolean;
  /** Rendered inside the patient dashboard (no page container/padding). */
  embedded?: boolean;
}) {
  const { profile, specialties, education, experience, chambers, publications, awards } = portfolio;
  const years = yearsOfExperience(profile.practice_since_year);
  const degrees = education.map((e) => e.degree).join(", ");
  const chamberNames = Object.fromEntries(chambers.map((c) => [c.id, c.name]));

  return (
    <div className={embedded ? "@container" : "page-container @container py-8 lg:py-12"}>
    <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:grid-cols-[minmax(0,1fr)_22rem] @6xl:grid-cols-[minmax(0,1fr)_24rem] @5xl:gap-8">
      {/* Main column */}
      <div className="flex min-w-0 flex-col gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <DoctorAvatar name={profile.display_name} photoUrl={doctorPhotoUrl(profile.photo_path)} size={112} priority />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  {profile.display_name}
                </h1>
                {profile.is_verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
                      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.8-4.8 1.4 1.4-6.2 6.2Z" />
                    </svg>
                    Verified
                  </span>
                )}
              </div>
              {profile.headline && <p className="mt-1 text-lg text-slate-700">{profile.headline}</p>}
              {degrees && <p className="mt-1 text-sm text-slate-600">{degrees}</p>}
              {specialties.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Specialties">
                  {specialties.map((s) => (
                    <li key={s.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {s.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Experience" value={years != null ? `${years}+ years` : "—"} />
            <Stat label="Languages" value={profile.languages.join(", ") || "—"} />
            <Stat label="License" value={profile.license_number ?? "—"} />
            <Stat label="Rating" value="No reviews yet" />
          </dl>
        </section>

        {profile.bio && (
          <Section title="About">
            <p className="whitespace-pre-line leading-relaxed text-slate-700">{profile.bio}</p>
          </Section>
        )}

        <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-2 @5xl:[&>*:last-child:nth-child(odd)]:col-span-2">
        <ListSection title="Experience" items={experience.map((i) => summarizeItem("experience", i))} />
        <ListSection title="Education" items={education.map((i) => summarizeItem("education", i))} />

        {publications.length > 0 && (
          <Section title="Publications">
            <ul className="flex flex-col gap-3">
              {publications.map((p) => {
                const s = summarizeItem("publications", p);
                return (
                  <li key={p.id}>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-teal-800 hover:underline">
                        {s.primary}
                      </a>
                    ) : (
                      <p className="font-medium text-slate-900">{s.primary}</p>
                    )}
                    {s.secondary && <p className="text-sm text-slate-600">{s.secondary}</p>}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <ListSection title="Awards" items={awards.map((i) => summarizeItem("awards", i))} />
        </div>
      </div>

      {/* Side column */}
      <aside className={`flex min-w-0 flex-col gap-6 @4xl:sticky @4xl:self-start ${embedded ? "@4xl:top-6" : "@4xl:top-24"}`}>
        {bookable ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Book an appointment</h2>
            <div className="mt-4">
              <BookingWidget
                doctorId={profile.user_id}
                slug={profile.slug}
                today={todayIn(profile.timezone)}
                initialSlots={slots}
                chamberNames={chamberNames}
                options={[
                  ...(profile.offers_online
                    ? [{ type: "online" as const, label: "Online video consultation", detail: "From your phone or computer", fee: formatFee(profile.fee_online) }]
                    : []),
                  ...(profile.offers_in_person
                    ? [{
                        type: "in_person" as const,
                        label: "In-person visit",
                        detail: chambers.length ? chambers.map((c) => `${c.name}, ${c.city}`).join(" · ") : "At the doctor's chamber",
                        fee: formatFee(profile.fee_in_person),
                      }]
                    : []),
                ]}
              />
              <p className="mt-4 text-xs text-slate-500">We hold your chosen time for 5 minutes while you confirm.</p>
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-slate-900">Consultation</h2>
              <ul className="mt-4 flex flex-col gap-3 text-sm">
                {profile.offers_online && <FeeLine label="Online video consultation" fee={formatFee(profile.fee_online)} />}
                {profile.offers_in_person && <FeeLine label="In-person at chamber" fee={formatFee(profile.fee_in_person)} />}
                {!profile.offers_online && !profile.offers_in_person && (
                  <li className="text-slate-600">Consultation details coming soon.</li>
                )}
              </ul>
            </section>
            {(profile.offers_online || profile.offers_in_person) && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-900">Available slots (preview)</h2>
                <div className="mt-4">
                  <SlotPicker
                    slots={slots}
                    chamberNames={chamberNames}
                    note="Booking is enabled once your profile is verified."
                    emptyText="No open slots in the next 7 days."
                  />
                </div>
              </section>
            )}
          </>
        )}

        {chambers.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Chambers</h2>
            <ul className="mt-4 flex flex-col gap-4 text-sm">
              {chambers.map((c) => (
                <li key={c.id}>
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-slate-600">
                    {c.address}, {c.city}
                  </p>
                  {c.visiting_hours && <p className="text-slate-600">{c.visiting_hours}</p>}
                  {c.phone && (
                    <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="text-teal-700 hover:underline">
                      {c.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function FeeLine({ label, fee }: { label: string; fee: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-slate-700">{label}</span>
      <span className="font-semibold text-slate-900">{fee}</span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ListSection({ title, items }: { title: string; items: { primary: string; secondary: string }[] }) {
  if (items.length === 0) return null;
  return (
    <Section title={title}>
      <ul className="flex flex-col gap-3">
        {items.map((i, idx) => (
          <li key={idx} className="border-l-2 border-teal-200 pl-3">
            <p className="font-medium text-slate-900">{i.primary}</p>
            {i.secondary && <p className="text-sm text-slate-600">{i.secondary}</p>}
          </li>
        ))}
      </ul>
    </Section>
  );
}
