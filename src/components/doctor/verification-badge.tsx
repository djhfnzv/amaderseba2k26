import Link from "next/link";

/** Tells the doctor whether their page is public yet. */
export function VerificationBadge({ verified, slug }: { verified: boolean; slug: string }) {
  if (verified) {
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
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <strong className="font-semibold">Not public yet.</strong> Your page becomes visible to patients
      after an admin verifies your license and documents. Document submission opens soon — meanwhile,
      complete your portfolio.
    </div>
  );
}
