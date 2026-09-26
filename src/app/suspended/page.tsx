import type { Metadata } from "next";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account suspended · MedLife" };

export default function SuspendedPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Account suspended</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account has been suspended by an administrator. If you think this is a mistake,
          please contact support.
        </p>
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="secondary" className="w-full">
            Log out
          </Button>
        </form>
      </div>
    </main>
  );
}
