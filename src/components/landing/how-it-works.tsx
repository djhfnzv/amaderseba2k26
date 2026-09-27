import { SectionHeading } from "./section-heading";

const steps = [
  {
    title: "Find your doctor",
    body: "Search by specialty, fee, language or consultation type and compare verified portfolios.",
  },
  {
    title: "Pick a slot",
    body: "Choose in-person or online and select a free time. We hold it for you while you pay.",
  },
  {
    title: "Consult",
    body: "Visit the chamber or join the video room from your browser at your scheduled time.",
  },
  {
    title: "Get your prescription",
    body: "Download your signed prescription and keep your full medical history in one place.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-slate-50 py-20">
      <div className="page-container">
        <SectionHeading
          eyebrow="How it works"
          title="From search to prescription in four steps"
        />
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="relative rounded-2xl bg-white p-6 shadow-sm">
              <span className="grid size-10 place-items-center rounded-full bg-teal-700 text-sm font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
