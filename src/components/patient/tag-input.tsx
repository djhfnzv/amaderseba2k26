"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { MAX_TAG_LENGTH, MAX_TAGS } from "@/lib/patient/constants";

/**
 * Free-text chip input with suggestions. Submits one hidden input per tag
 * under `name`, read on the server with formData.getAll(name).
 */
export function TagInput({
  label,
  name,
  defaultValue = [],
  suggestions,
  placeholder,
  hint,
  errors,
}: {
  label: string;
  name: string;
  defaultValue?: string[];
  suggestions: string[];
  placeholder?: string;
  hint?: string;
  errors?: string[];
}) {
  const id = useId();
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");
  const hasError = !!errors?.length;

  const has = (value: string) => tags.some((t) => t.toLowerCase() === value.toLowerCase());

  function add(value: string) {
    const tag = value.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    if (!tag || has(tag) || tags.length >= MAX_TAGS) return;
    setTags((prev) => [...prev, tag]);
  }

  function remove(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
      setDraft("");
    } else if (e.key === "Backspace" && !draft && tags.length) {
      remove(tags[tags.length - 1]);
    }
  }

  const available = suggestions.filter((s) => !has(s));

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>

      {tags.map((t) => (
        <input key={t} type="hidden" name={name} value={t} />
      ))}

      <div
        className={`flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-teal-600 ${
          hasError ? "border-red-500" : "border-slate-300"
        }`}
      >
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-md bg-teal-50 py-1 pl-2 pr-1 text-sm text-teal-900"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              className="grid size-5 place-items-center rounded text-teal-700 hover:bg-teal-100"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            add(draft);
            setDraft("");
          }}
          placeholder={tags.length ? "" : placeholder}
          maxLength={MAX_TAG_LENGTH}
          aria-describedby={hasError ? `${id}-error` : `${id}-hint`}
          className="h-8 min-w-32 flex-1 bg-transparent px-1 text-base text-slate-900 outline-none"
        />
      </div>

      {hasError ? (
        <p id={`${id}-error`} className="text-xs text-red-600">
          {errors[0]}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint ?? "Type and press Enter to add."}
        </p>
      )}

      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1" aria-label={`Common ${label.toLowerCase()}`}>
          {available.slice(0, 10).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:border-teal-400 hover:bg-teal-50"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
