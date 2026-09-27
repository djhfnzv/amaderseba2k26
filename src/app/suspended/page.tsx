import type { Metadata } from "next";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Account suspended · MedLife" };

export default async function SuspendedPage() {
  // May be null once the account's session has been revoked.
  const user = await getCurrentUser();
  const reason = user?.status === "suspended" ? user.suspended_reason : null;

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Account suspended</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account has been suspended by an administrator. If you think this is a mistake,
          please contact support.
        </p>
        {reason && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-left text-sm text-red-900">
            <span className="font-semibold">Reason:</span> {reason}
          </p>
        )}
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="secondary" className="w-full">
            Log out
          </Button>
        </form>
      </div>
    </main>
  );
}
