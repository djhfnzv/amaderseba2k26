import Link from "next/link";
import { DoctorAvatar } from "@/components/doctor/doctor-avatar";
import { StarRating } from "@/components/reviews/stars";
import { LocalTime } from "@/components/ui/local-time";
import { doctorPhotoUrl, formatFee, yearsOfExperience } from "@/lib/doctor/constants";
import type { DoctorSearchRow } from "@/types/database";

export function DoctorCard({ doctor, profileBase = "/doctors" }: { doctor: DoctorSearchRow; profileBase?: string }) {
  const years = yearsOfExperience(doctor.practice_since_year);
  const href = `${profileBase}/${doctor.slug}`;

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex gap-4">
        <DoctorAvatar name={doctor.display_name} photoUrl={doctorPhotoUrl(doctor.photo_path)} size={64} />
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-semibold text-slate-900">
            <Link href={href} className="truncate hover:text-teal-700">
              {doctor.display_name}
            </Link>
            <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-teal-700" fill="currentColor" aria-label="Verified">
              <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.8-4.8 1.4 1.4-6.2 6.2Z" />
            </svg>
          </h2>
          {doctor.headline && <p className="truncate text-sm text-slate-700">{doctor.headline}</p>}
          {doctor.degrees.length > 0 && (
            <p className="truncate text-xs text-slate-500">{doctor.degrees.join(", ")}</p>
          )}
          <p className="mt-1 text-xs">
            {doctor.rating_avg != null ? (
              <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                <StarRating value={Number(doctor.rating_avg)} size="sm" />
                {Number(doctor.rating_avg).toFixed(1)}
                <span className="font-normal text-slate-500">({doctor.review_count} reviews)</span>
              </span>
            ) : (
              <span className="text-slate-500">{doctor.review_count > 0 ? `${doctor.review_count} review${doctor.review_count === 1 ? "" : "s"}` : "New doctor"}</span>
            )}
          </p>
        </div>
      </div>

      {doctor.specialties.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Specialties">
          {doctor.specialties.slice(0, 3).map((s) => (
            <li key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              {s}
            </li>
          ))}
          {doctor.specialties.length > 3 && (
            <li className="px-1 text-xs text-slate-500">+{doctor.specialties.length - 3}</li>
          )}
        </ul>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div>
          <dt className="sr-only">Experience</dt>
          <dd>{years != null ? `${years}+ yrs experience` : "Experience —"}</dd>
        </div>
        <div>
          <dt className="sr-only">Location</dt>
          <dd className="truncate">{doctor.cities.join(", ") || (doctor.offers_online ? "Online only" : "—")}</dd>
        </div>
        {doctor.languages.length > 0 && (
          <div className="col-span-2">
            <dt className="sr-only">Languages</dt>
            <dd className="truncate">Speaks {doctor.languages.join(", ")}</dd>
          </div>
        )}
      </dl>

      <p className="mt-3 text-sm">
        {doctor.next_available ? (
          <span className="font-medium text-emerald-700">
            Next available: <LocalTime iso={doctor.next_available} format="dateTime" />
          </span>
        ) : (
          <span className="text-slate-500">No open slots in the next 30 days</span>
        )}
      </p>

      <div className="mt-auto pt-4">
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 text-sm">
          {doctor.offers_online && (
            <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-teal-900">
              Video <strong className="font-semibold">{formatFee(doctor.fee_online)}</strong>
            </span>
          )}
          {doctor.offers_in_person && (
            <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-sky-900">
              In-person <strong className="font-semibold">{formatFee(doctor.fee_in_person)}</strong>
            </span>
          )}
        </div>
        <Link
          href={href}
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
        >
          {doctor.next_available ? "View profile & book" : "View profile"}
        </Link>
      </div>
    </article>
  );
}
