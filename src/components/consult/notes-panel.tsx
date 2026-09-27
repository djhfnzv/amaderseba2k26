"use client";

import { useEffect, useRef, useState } from "react";
import { saveNotes } from "@/app/consult/[appointmentId]/actions";

/** Doctor's private consultation notes, saved automatically. */
export function NotesPanel({ appointmentId, initial }: { appointmentId: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(initial);

  async function flush(value: string) {
    setStatus("saving");
    const res = await saveNotes(appointmentId, value);
    if (latest.current !== value) return; // newer edits pending
    if (res.ok) {
      setStatus("saved");
      setSavedAt(res.data);
    } else {
      setStatus("error");
    }
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <label htmlFor="consult-notes" className="text-sm font-semibold text-slate-900">
        Consultation notes
      </label>
      <p className="text-xs text-slate-500">Private to you. Complaint, findings and plan — used for the prescription.</p>
      <textarea
        id="consult-notes"
        value={notes}
        maxLength={10000}
        onChange={(e) => {
          const v = e.target.value;
          setNotes(v);
          latest.current = v;
          setStatus("unsaved");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(v), 900);
        }}
        onBlur={() => {
          if (status === "unsaved") {
            if (timer.current) clearTimeout(timer.current);
            void flush(notes);
          }
        }}
        placeholder={"Chief complaint:\nFindings:\nAssessment:\nPlan:"}
        className="mt-3 min-h-40 flex-1 resize-none rounded-lg border border-slate-300 bg-white p-3 text-sm leading-relaxed text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
      />
      <p className={`mt-2 text-xs ${status === "error" ? "text-red-700" : "text-slate-500"}`} aria-live="polite">
        {status === "saving" && "Saving…"}
        {status === "unsaved" && "Unsaved changes"}
        {status === "error" && "Couldn't save — check your connection."}
        {status === "saved" && (savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Saved")}
      </p>
    </div>
  );
}
