import Link from "next/link";
import type { VerificationStatus } from "@/types/database";

/** Tells the doctor whether their page is public and what to do next. */
export function VerificationBadge({
  status,
  reason,
  slug,
}: {
  status: VerificationStatus | null;
  reason?: string | null;
  slug: string;
}) {
  if (status === "approved") {
    return (
      <div className="flex flex-col gap-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong className="font-semibold">Verified.</strong> Your page is public.
        </p>
        <Link href={`/doctors/${slug}`} className="font-semibold underline">
          /doctors/{slug}
        </Link>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong className="font-semibold">Verification under review.</strong> Your page goes public
        as soon as an admin approves your documents.
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong className="font-semibold">Verification needs changes.</strong>
          {reason && <> “{reason}”</>}
        </p>
        <Link href="/doctor/verification" className="shrink-0 font-semibold underline">
          Fix and resubmit
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <p>
        <strong className="font-semibold">Not public yet.</strong> Upload your license, degree and ID
        to get verified.
      </p>
      <Link href="/doctor/verification" className="shrink-0 font-semibold underline">
        Get verified
      </Link>
    </div>
  );
}
