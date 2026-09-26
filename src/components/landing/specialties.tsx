import { SectionHeading } from "./section-heading";

const specialties = [
  { name: "Medicine", desc: "General & internal medicine" },
  { name: "Cardiology", desc: "Heart & blood pressure" },
  { name: "Pediatrics", desc: "Child health" },
  { name: "Gynecology", desc: "Women's health & pregnancy" },
  { name: "Dermatology", desc: "Skin, hair & nails" },
  { name: "Orthopedics", desc: "Bones, joints & spine" },
  { name: "Psychiatry", desc: "Mental health" },
  { name: "ENT", desc: "Ear, nose & throat" },
  { name: "Neurology", desc: "Brain & nerves" },
  { name: "Gastroenterology", desc: "Stomach & digestion" },
  { name: "Endocrinology", desc: "Diabetes & hormones" },
  { name: "Dentistry", desc: "Teeth & oral care" },
];

export function Specialties() {
  return (
    <section id="specialties" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Specialties"
          title="Specialists for every need"
          description="Consult experienced doctors across a wide range of specialties."
        />
        <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {specialties.map((s) => (
            <li
              key={s.name}
              className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-teal-300 hover:bg-teal-50/50"
            >
              <p className="font-semibold text-slate-900">{s.name}</p>
              <p className="mt-0.5 text-sm text-slate-600">{s.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
