import Link from "next/link";
import { SectionHeading } from "./section-heading";

// Slugs match the seeded "specialties" table (M3 migration).
const specialties = [
  { slug: "medicine", name: "Medicine", desc: "General & internal medicine" },
  { slug: "cardiology", name: "Cardiology", desc: "Heart & blood pressure" },
  { slug: "pediatrics", name: "Pediatrics", desc: "Child health" },
  { slug: "gynecology", name: "Gynecology", desc: "Women's health & pregnancy" },
  { slug: "dermatology", name: "Dermatology", desc: "Skin, hair & nails" },
  { slug: "orthopedics", name: "Orthopedics", desc: "Bones, joints & spine" },
  { slug: "psychiatry", name: "Psychiatry", desc: "Mental health" },
  { slug: "ent", name: "ENT", desc: "Ear, nose & throat" },
  { slug: "neurology", name: "Neurology", desc: "Brain & nerves" },
  { slug: "gastroenterology", name: "Gastroenterology", desc: "Stomach & digestion" },
  { slug: "endocrinology", name: "Endocrinology", desc: "Diabetes & hormones" },
  { slug: "dentistry", name: "Dentistry", desc: "Teeth & oral care" },
];

export function Specialties() {
  return (
    <section id="specialties" className="scroll-mt-20 bg-white py-20">
      <div className="page-container">
        <SectionHeading
          eyebrow="Specialties"
          title="Specialists for every need"
          description="Consult experienced doctors across a wide range of specialties."
        />
        <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {specialties.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/doctors?specialty=${s.slug}`}
                className="block h-full rounded-xl border border-slate-200 p-4 transition-colors hover:border-teal-300 hover:bg-teal-50/50 focus-visible:outline-2 focus-visible:outline-teal-700"
              >
                <p className="font-semibold text-slate-900">{s.name}</p>
                <p className="mt-0.5 text-sm text-slate-600">{s.desc}</p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8 text-center">
          <Link href="/doctors" className="font-semibold text-teal-700 hover:underline">
            See all doctors →
          </Link>
        </div>
      </div>
    </section>
  );
}
