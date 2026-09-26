import {
  CalendarIcon,
  LockIcon,
  PrescriptionIcon,
  QrIcon,
  ShieldCheckIcon,
  VideoIcon,
} from "./icons";
import { SectionHeading } from "./section-heading";

const features = [
  {
    icon: ShieldCheckIcon,
    title: "Verified portfolios",
    body: "Licenses, degrees and ID are checked by our team before a doctor's page goes public. See education, experience, chambers, awards and real patient reviews.",
  },
  {
    icon: CalendarIcon,
    title: "Conflict-free booking",
    body: "Pick a free slot and confirm in four steps or fewer. Your slot is held while you pay, so nobody else can take it.",
  },
  {
    icon: VideoIcon,
    title: "Secure video consultation",
    body: "Join from your browser — no app needed. Chat and share reports with your doctor during the call.",
  },
  {
    icon: PrescriptionIcon,
    title: "Digital prescriptions",
    body: "Receive a signed, tamper-proof prescription as a PDF right after your visit, with your full history in one place.",
  },
  {
    icon: QrIcon,
    title: "QR verification",
    body: "Every prescription carries a QR code so pharmacies can confirm it is genuine and up to date.",
  },
  {
    icon: LockIcon,
    title: "Private by design",
    body: "Your health records are visible only to you and the doctors you book with. Every access is logged.",
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Why MedLife"
          title="Care you can trust, from booking to prescription"
          description="Everything you need for a doctor visit — without the waiting room guesswork."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <Icon className="size-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
