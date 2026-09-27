import { SectionHeading } from "./section-heading";

const faqs = [
  {
    q: "How do you verify doctors?",
    a: "Doctors upload their medical license, degree certificates and national ID. Our admin team reviews every document before the doctor's portfolio becomes public or can accept bookings.",
  },
  {
    q: "What do I need for an online consultation?",
    a: "A phone or computer with a camera, microphone and a stable internet connection. The consultation runs in your browser — there is nothing to install.",
  },
  {
    q: "Can I cancel or reschedule?",
    a: "Yes. You can reschedule or cancel from your dashboard. Refunds follow the cancellation policy; if the doctor cancels, you receive a full refund.",
  },
  {
    q: "Is my health information private?",
    a: "Yes. Your profile and reports are visible only to you and to doctors you have booked with, and every access to medical records is logged.",
  },
  {
    q: "How can a pharmacy check my prescription?",
    a: "Each signed prescription has a QR code. Scanning it opens a public verification page showing whether the prescription is valid or has been replaced by a newer version.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 bg-white py-20">
      <div className="page-container max-w-4xl">
        <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
        <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {faqs.map((f) => (
            <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                {f.q}
                <span
                  aria-hidden="true"
                  className="text-xl leading-none text-teal-700 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
