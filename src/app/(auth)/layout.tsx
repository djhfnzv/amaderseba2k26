import { Logo } from "@/components/landing/logo";
import { BackToLanding } from "@/components/motion/auth-transition";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <header className="px-4 py-4 sm:px-6">
        <BackToLanding>
          <Logo transitionTypes={["from-auth"]} />
        </BackToLanding>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center">
        {children}
      </main>
    </div>
  );
}
