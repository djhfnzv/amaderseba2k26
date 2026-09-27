"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { MedicineSearch, type MedicinePick } from "@/components/prescriptions/medicine-search";
import { deleteDraft, deleteTemplate, saveDraft, saveTemplate, signPrescription } from "@/lib/prescriptions/actions";
import {
  ADVICE_SUGGESTIONS,
  COMMON_TESTS,
  DOSE_PRESETS,
  DURATION_PRESETS,
  MAX_ITEMS,
  MAX_TESTS,
  TIMING_OPTIONS,
  allergyWarnings,
  medicineLabel,
  type AllergyWarning,
} from "@/lib/prescriptions/constants";
import type { PrescriptionDetail } from "@/lib/prescriptions/queries";
import type { Draft, DraftItem, TemplatePayload } from "@/lib/prescriptions/schema";
import type { MedicineTiming, PrescriptionTemplate, Sex } from "@/types/database";

type Item = DraftItem & { key: string };
type Test = { key: string; name: string; note: string | null };
type Fields = Omit<Draft, "items" | "tests">;

/** Drops the React key before sending to the server. */
function stripKey<T extends { key: string }>(row: T): Omit<T, "key"> {
  const copy: Partial<T> = { ...row };
  delete copy.key;
  return copy as Omit<T, "key">;
}

function newKey() {
  return crypto.randomUUID();
}

function fieldsOf(rx: PrescriptionDetail): Fields {
  return {
    patient_name: rx.patient_name,
    patient_age: rx.patient_age,
    patient_sex: rx.patient_sex,
    patient_weight: rx.patient_weight,
    patient_phone: rx.patient_phone,
    chief_complaint: rx.chief_complaint,
    findings: rx.findings,
    diagnosis: rx.diagnosis,
    advice: rx.advice,
    follow_up_date: rx.follow_up_date,
    follow_up_note: rx.follow_up_note,
  };
}

/** Adds template / previous text without losing what the doctor already wrote. */
function mergeText(current: string | null, extra: string | null) {
  if (!extra?.trim()) return current;
  if (!current?.trim()) return extra;
  return current.includes(extra) ? current : `${current.trimEnd()}\n${extra}`;
}

export function PrescriptionEditor({
  rx,
  allergies,
  conditions,
  templates: initialTemplates,
  last,
  canSign,
  todayIso,
}: {
  rx: PrescriptionDetail;
  allergies: string[];
  conditions: string[];
  templates: PrescriptionTemplate[];
  last: { payload: TemplatePayload; signedAt: string } | null;
  canSign: boolean;
  todayIso: string;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(() => fieldsOf(rx));
  const [items, setItems] = useState<Item[]>(() =>
    rx.items.map((it) => ({
      key: it.id,
      medicine_id: it.medicine_id,
      medicine_name: it.medicine_name,
      generic_name: it.generic_name,
      strength: it.strength,
      form: it.form,
      dose: it.dose,
      timing: it.timing,
      duration: it.duration,
      instructions: it.instructions,
      is_controlled: it.is_controlled,
    })),
  );
  const [tests, setTests] = useState<Test[]>(() => rx.tests.map((t) => ({ key: t.id, name: t.name, note: t.note })));
  const [templates, setTemplates] = useState(initialTemplates);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [serverWarnings, setServerWarnings] = useState<AllergyWarning[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [customTest, setCustomTest] = useState("");
  const [pending, startTransition] = useTransition();

  const warnings = useMemo(() => allergyWarnings(allergies, items), [allergies, items]);
  const warnedNames = new Set(warnings.map((w) => w.medicine));
  const blockedControlled = rx.is_online ? items.filter((i) => i.is_controlled) : [];

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function touch() {
    setDirty(true);
    setNotice(null);
  }
  function setField<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    touch();
  }
  function payload(): Draft {
    return {
      ...fields,
      items: items.map(stripKey),
      tests: tests.map(stripKey),
    };
  }
  function clinicalPayload(): TemplatePayload {
    const p = payload();
    return {
      chief_complaint: p.chief_complaint,
      findings: p.findings,
      diagnosis: p.diagnosis,
      advice: p.advice,
      follow_up_note: p.follow_up_note,
      items: p.items,
      tests: p.tests,
    };
  }

  // --- medicines -------------------------------------------------------------
  function addMedicine(m: MedicinePick) {
    if (items.length >= MAX_ITEMS) return setError(`Up to ${MAX_ITEMS} medicines per prescription.`);
    setItems((list) => [
      ...list,
      {
        key: newKey(),
        medicine_id: m.id,
        medicine_name: medicineLabel(m),
        generic_name: m.generic_name,
        strength: m.strength,
        form: m.form,
        dose: m.form === "tablet" || m.form === "capsule" ? "1+0+1" : null,
        timing: m.form === "tablet" || m.form === "capsule" || m.form === "syrup" || m.form === "suspension" ? "after_meal" : null,
        duration: "7 days",
        instructions: null,
        is_controlled: m.is_controlled,
      },
    ]);
    touch();
  }
  function updateItem(key: string, patch: Partial<Item>) {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
    touch();
  }
  function moveItem(key: string, dir: -1 | 1) {
    setItems((list) => {
      const i = list.findIndex((it) => it.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    touch();
  }

  // --- tests -----------------------------------------------------------------
  function toggleTest(name: string) {
    const exists = tests.some((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!exists && tests.length >= MAX_TESTS) return setError(`Up to ${MAX_TESTS} tests.`);
    setTests((list) => (exists ? list.filter((t) => t.name.toLowerCase() !== name.toLowerCase()) : [...list, { key: newKey(), name, note: null }]));
    touch();
  }

  // --- templates / copy last -------------------------------------------------
  function apply(p: TemplatePayload, label: string) {
    setFields((f) => ({
      ...f,
      chief_complaint: mergeText(f.chief_complaint, p.chief_complaint),
      findings: mergeText(f.findings, p.findings),
      diagnosis: mergeText(f.diagnosis, p.diagnosis),
      advice: mergeText(f.advice, p.advice),
      follow_up_note: f.follow_up_note || p.follow_up_note,
    }));
    setItems((list) => {
      const have = new Set(list.map((i) => i.medicine_name.toLowerCase()));
      const add = p.items.filter((i) => !have.has(i.medicine_name.toLowerCase())).map((i) => ({ ...i, key: newKey() }));
      return [...list, ...add].slice(0, MAX_ITEMS);
    });
    setTests((list) => {
      const have = new Set(list.map((t) => t.name.toLowerCase()));
      const add = p.tests.filter((t) => !have.has(t.name.toLowerCase())).map((t) => ({ ...t, key: newKey() }));
      return [...list, ...add].slice(0, MAX_TESTS);
    });
    touch();
    setNotice(`${label} added. Review the doses before signing.`);
  }

  function onSaveTemplate() {
    const name = prompt("Template name (e.g. “Viral fever — adult”)");
    if (!name?.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await saveTemplate(name, clinicalPayload());
      if (!res.ok) return setError(res.error);
      setTemplates((t) => [...t, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNotice(`Saved template “${res.data.name}”.`);
    });
  }

  function onDeleteTemplate(t: PrescriptionTemplate) {
    if (!confirm(`Delete the template “${t.name}”?`)) return;
    startTransition(async () => {
      const res = await deleteTemplate(t.id);
      if (!res.ok) return setError(res.error);
      setTemplates((list) => list.filter((x) => x.id !== t.id));
    });
  }

  // --- save / preview / sign -------------------------------------------------
  function save(then?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await saveDraft(rx.id, payload());
      if (!res.ok) return setError(res.error);
      setDirty(false);
      setSavedAt(res.data);
      then?.();
    });
  }

  function sign() {
    setError(null);
    startTransition(async () => {
      const res = await signPrescription(rx.id, payload(), acknowledged);
      if (!res.ok) {
        setError(res.error);
        if ("warnings" in res && res.warnings) setServerWarnings(res.warnings);
        return;
      }
      setDirty(false);
      router.replace(`/doctor/prescriptions/${rx.id}?signed=1`);
      router.refresh();
    });
  }

  const shownWarnings = serverWarnings?.length ? serverWarnings : warnings;
  const canSubmitSign = canSign && blockedControlled.length === 0 && (shownWarnings.length === 0 || acknowledged);

  return (
    <div className="flex flex-col gap-6 pb-28">
      {/* Patient */}
      <Card title="Patient">
        <div className="grid gap-3 sm:grid-cols-2 @3xl:grid-cols-[2fr_1fr_1fr_1fr_1.4fr]">
          <Input label="Name" value={fields.patient_name} onChange={(v) => setField("patient_name", v)} required />
          <Input label="Age" value={fields.patient_age ?? ""} onChange={(v) => setField("patient_age", v || null)} placeholder="32 y" />
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
            Sex
            <select
              value={fields.patient_sex ?? ""}
              onChange={(e) => setField("patient_sex", (e.target.value || null) as Sex | null)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="">—</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Input label="Weight" value={fields.patient_weight ?? ""} onChange={(v) => setField("patient_weight", v || null)} placeholder="60 kg" />
          <Input label="Phone" value={fields.patient_phone ?? ""} onChange={(v) => setField("patient_phone", v || null)} />
        </div>
        {rx.patient_id ? (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <TagList label="Allergies" items={allergies} tone="bg-red-50 text-red-800" empty="None recorded" />
            <TagList label="Conditions" items={conditions} tone="bg-slate-100 text-slate-800" empty="None recorded" />
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Entered manually — not linked to a MedLife account, so no allergy check. Ask the patient about allergies.
          </p>
        )}
      </Card>

      {/* Tools */}
      <div className="flex flex-wrap items-center gap-2">
        {templates.length > 0 && (
          <details className="group relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50">
              Use template <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">▾</span>
            </summary>
            <ul className="absolute z-20 mt-1 w-72 animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 px-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      apply(t.payload as TemplatePayload, `Template “${t.name}”`);
                      (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                    }}
                    className="min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left text-sm text-slate-900 hover:bg-teal-50"
                  >
                    {t.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTemplate(t)}
                    aria-label={`Delete template ${t.name}`}
                    className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-700"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {last && (
          <ToolButton onClick={() => apply(last.payload, "Previous prescription")}>
            Copy last prescription <span className="text-slate-500">({last.signedAt})</span>
          </ToolButton>
        )}
        <ToolButton onClick={onSaveTemplate} disabled={pending}>Save as template</ToolButton>
      </div>

      {notice && <p role="status" className="animate-fade-in rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">{notice}</p>}

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        {/* Clinical notes */}
        <Card title="Clinical notes">
          <div className="flex flex-col gap-4">
            <Area label="Chief complaints" value={fields.chief_complaint} onChange={(v) => setField("chief_complaint", v)} max={2000} placeholder="Fever for 3 days, headache…" />
            <Area label="On examination" value={fields.findings} onChange={(v) => setField("findings", v)} max={2000} placeholder="Temp 101°F, BP 120/80…" />
            <Area label="Diagnosis" value={fields.diagnosis} onChange={(v) => setField("diagnosis", v)} max={1000} rows={2} placeholder="Viral fever" />
          </div>
        </Card>

        {/* Medicines */}
        <Card title={`Medicines (${items.length})`}>
          <MedicineSearch onPick={addMedicine} disabled={items.length >= MAX_ITEMS} />
          <datalist id="dose-presets">{DOSE_PRESETS.map((d) => <option key={d} value={d} />)}</datalist>
          <datalist id="duration-presets">{DURATION_PRESETS.map((d) => <option key={d} value={d} />)}</datalist>

          {items.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
              Search above to add medicines. Dose, timing and duration are filled with common defaults — adjust as needed.
            </p>
          ) : (
            <ol className="mt-4 flex flex-col gap-3">
              {items.map((it, i) => {
                const blocked = rx.is_online && it.is_controlled;
                const allergic = warnedNames.has(it.medicine_name);
                return (
                  <li
                    key={it.key}
                    className={`animate-fade-in rounded-xl border p-3 ${blocked ? "border-red-300 bg-red-50/60" : allergic ? "border-amber-300 bg-amber-50/60" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          <span className="text-slate-400">{i + 1}.</span> {it.medicine_name}
                          {it.is_controlled && (
                            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-red-700">Controlled</span>
                          )}
                        </p>
                        {blocked && <p className="text-xs font-medium text-red-700">Controlled drugs can&apos;t be prescribed in an online consultation.</p>}
                        {allergic && <p className="text-xs font-medium text-amber-800">⚠ May clash with a recorded allergy.</p>}
                      </div>
                      <div className="flex shrink-0 items-center">
                        <IconBtn label="Move up" onClick={() => moveItem(it.key, -1)} disabled={i === 0}>↑</IconBtn>
                        <IconBtn label="Move down" onClick={() => moveItem(it.key, 1)} disabled={i === items.length - 1}>↓</IconBtn>
                        <IconBtn
                          label={`Remove ${it.medicine_name}`}
                          onClick={() => {
                            setItems((list) => list.filter((x) => x.key !== it.key));
                            touch();
                          }}
                          danger
                        >
                          ✕
                        </IconBtn>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <SmallInput label="Dose" list="dose-presets" value={it.dose ?? ""} onChange={(v) => updateItem(it.key, { dose: v || null })} placeholder="1+0+1" />
                      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                        When
                        <select
                          value={it.timing ?? ""}
                          onChange={(e) => updateItem(it.key, { timing: (e.target.value || null) as MedicineTiming | null })}
                          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
                        >
                          <option value="">—</option>
                          {TIMING_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </label>
                      <SmallInput label="Duration" list="duration-presets" value={it.duration ?? ""} onChange={(v) => updateItem(it.key, { duration: v || null })} placeholder="7 days" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {DOSE_PRESETS.slice(0, 6).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => updateItem(it.key, { dose: d })}
                          className={`rounded-md px-2 py-0.5 text-xs font-medium ${it.dose === d ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2">
                      <SmallInput
                        label="Instructions (optional)"
                        value={it.instructions ?? ""}
                        onChange={(v) => updateItem(it.key, { instructions: v || null })}
                        placeholder="e.g. Stop if rash appears"
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid gap-6 @4xl:grid-cols-2">
        {/* Tests */}
        <Card title={`Investigations (${tests.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_TESTS.map((t) => {
              const on = tests.some((x) => x.name.toLowerCase() === t.toLowerCase());
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTest(t)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${on ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-teal-400"}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (customTest.trim()) toggleTest(customTest.trim().slice(0, 150));
              setCustomTest("");
            }}
          >
            <label htmlFor="custom-test" className="sr-only">Other test</label>
            <input
              id="custom-test"
              value={customTest}
              onChange={(e) => setCustomTest(e.target.value)}
              placeholder="Other test…"
              className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
            />
            <button type="submit" className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50">
              Add
            </button>
          </form>
          {tests.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {tests.map((t) => (
                <li key={t.key} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{t.name}</span>
                  <input
                    aria-label={`Note for ${t.name}`}
                    value={t.note ?? ""}
                    onChange={(e) => {
                      setTests((list) => list.map((x) => (x.key === t.key ? { ...x, note: e.target.value || null } : x)));
                      touch();
                    }}
                    placeholder="Note"
                    maxLength={200}
                    className="h-8 w-36 rounded-md border border-slate-200 px-2 text-xs text-slate-900"
                  />
                  <IconBtn label={`Remove ${t.name}`} onClick={() => toggleTest(t.name)} danger>✕</IconBtn>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Advice + follow up */}
        <Card title="Advice & follow-up">
          <Area label="Advice" value={fields.advice} onChange={(v) => setField("advice", v)} max={3000} rows={4} placeholder="Lifestyle, diet, warning signs…" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ADVICE_SUGGESTIONS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setField("advice", mergeText(fields.advice, a))}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800"
              >
                + {a}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[11rem_1fr]">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
              Follow-up date
              <input
                type="date"
                min={todayIso}
                value={fields.follow_up_date ?? ""}
                onChange={(e) => setField("follow_up_date", e.target.value || null)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
              />
            </label>
            <Input label="Follow-up note" value={fields.follow_up_note ?? ""} onChange={(v) => setField("follow_up_note", v || null)} placeholder="After 7 days with reports" />
          </div>
        </Card>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:left-64 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          {error && <p role="alert" className="animate-fade-in text-sm font-medium text-red-700">{error}</p>}
          {shownWarnings.length > 0 && (
            <label className="flex animate-fade-in items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 size-4 accent-amber-700" />
              <span>
                <strong>Allergy warning:</strong>{" "}
                {shownWarnings.map((w) => `${w.medicine} (allergy: ${w.allergy})`).join("; ")}. I&apos;ve reviewed this and want to prescribe anyway.
              </span>
            </label>
          )}
          {blockedControlled.length > 0 && (
            <p className="text-sm text-red-700">Remove controlled drugs to sign — this is an online consultation.</p>
          )}
          {!canSign && <p className="text-sm text-amber-800">Your account must be verified before you can sign prescriptions. You can still save drafts.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-xs text-slate-500" aria-live="polite">
              {pending ? "Working…" : dirty ? "Unsaved changes" : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Draft"}
            </span>
            <form action={deleteDraft} onSubmit={(e) => { if (!confirm("Delete this draft?")) e.preventDefault(); }}>
              <input type="hidden" name="id" value={rx.id} />
              <button type="submit" className="h-10 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50">Delete draft</button>
            </form>
            <button
              type="button"
              onClick={() => save(() => window.open(`/prescriptions/${rx.id}/pdf`, "_blank", "noopener"))}
              disabled={pending}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              Preview PDF
            </button>
            <button
              type="button"
              onClick={() => save()}
              disabled={pending || !dirty}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              Save draft
            </button>
            {confirming ? (
              <span className="flex animate-fade-in items-center gap-2">
                <span className="text-sm text-slate-700">Sign and send? It can&apos;t be edited after, only amended.</span>
                <button type="button" onClick={() => setConfirming(false)} className="h-10 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  Back
                </button>
                <button
                  type="button"
                  onClick={sign}
                  disabled={pending || !canSubmitSign}
                  className="h-10 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {pending ? "Signing…" : "Confirm & sign"}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={pending || !canSubmitSign || !fields.patient_name.trim()}
                className="h-10 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                Sign &amp; send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-slate-800">
      {label}
      <input
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
      />
    </label>
  );
}

function SmallInput({
  label,
  value,
  onChange,
  placeholder,
  list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  list?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">
      {label}
      <input
        value={value}
        list={list}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  max,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  max: number;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
      {label}
      <textarea
        value={value ?? ""}
        rows={rows}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
      />
    </label>
  );
}

function ToolButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-8 place-items-center rounded-md text-sm disabled:opacity-30 ${danger ? "text-slate-500 hover:bg-red-50 hover:text-red-700" : "text-slate-500 hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}

function TagList({ label, items, tone, empty }: { label: string; items: string[]; tone: string; empty: string }) {
  return (
    <div>
      <span className="text-slate-500">{label}: </span>
      {items.length ? (
        <span className="inline-flex flex-wrap gap-1 align-middle">
          {items.map((i) => (
            <span key={i} className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${tone}`}>{i}</span>
          ))}
        </span>
      ) : (
        <span className="font-medium text-slate-800">{empty}</span>
      )}
    </div>
  );
}
