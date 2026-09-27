import { STATUS_META } from "@/lib/verification/constants";
import type { VerificationStatus } from "@/types/database";

export function StatusPill({ status }: { status: VerificationStatus | null | undefined }) {
  const meta = STATUS_META[status ?? "none"];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.tone}`}>
      {meta.label}
    </span>
  );
}
