"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteSectionItem, saveSectionItem } from "@/app/doctor/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SECTIONS, summarizeItem, type SectionKey } from "@/lib/doctor/constants";
import type { FormState } from "@/lib/validation/form-state";

type Item = { id: string } & Record<string, string | number | null>;

/** List + add/edit/delete for one repeatable portfolio section. */
export function SectionEditor({ section, items }: { section: SectionKey; items: Item[] }) {
  const config = SECTIONS[section];
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const canAdd = items.length < config.max;

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && editing !== "new" && (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No {config.title.toLowerCase()} added yet.
        </p>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
          {items.map((item) =>
            editing === item.id ? (
              <li key={item.id} className="p-4">
                <ItemForm section={section} item={item} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <ItemRow
                key={item.id}
                section={section}
                item={item}
                onEdit={() => setEditing(item.id)}
                disabled={editing !== null}
              />
            ),
          )}
        </ul>
      )}

      {editing === "new" ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
          <ItemForm section={section} onDone={() => setEditing(null)} />
        </div>
      ) : (
        canAdd && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            disabled={editing !== null}
            className="self-start rounded-lg border border-dashed border-teal-400 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50"
          >
            + Add {config.singular}
          </button>
        )
      )}
    </div>
  );
}

function ItemRow({
  section,
  item,
  onEdit,
  disabled,
}: {
  section: SectionKey;
  item: Item;
  onEdit: () => void;
  disabled: boolean;
}) {
  const { primary, secondary } = summarizeItem(section, item);
  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{primary}</p>
        {secondary && <p className="text-sm text-slate-600">{secondary}</p>}
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="rounded-md px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
        >
          Edit
        </button>
        <form
          action={deleteSectionItem.bind(null, section)}
          onSubmit={(e) => {
            if (!confirm(`Delete "${primary}"?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={item.id} />
          <DeleteButton label={primary} disabled={disabled} />
        </form>
      </div>
    </li>
  );
}

function DeleteButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-label={`Delete ${label}`}
      className="rounded-md px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

function ItemForm({
  section,
  item,
  onDone,
}: {
  section: SectionKey;
  item?: Item;
  onDone: () => void;
}) {
  const config = SECTIONS[section];
  const [state, action, pending] = useActionState(
    async (prev: FormState, fd: FormData): Promise<FormState> => {
      const res = await saveSectionItem(section, prev, fd);
      if (res?.message) onDone();
      return res;
    },
    undefined,
  );
  const value = (name: string) => state?.values?.[name] ?? (item?.[name] == null ? "" : String(item[name]));
  const thisYear = new Date().getFullYear();

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {config.fields.map((f) => (
          <div key={f.name} className={f.half ? "" : "sm:col-span-2"}>
            <Field
              id={`${section}-${item?.id ?? "new"}-${f.name}`}
              label={f.required ? f.label : `${f.label} (optional)`}
              name={f.name}
              type={f.type === "year" ? "number" : f.type}
              inputMode={f.type === "year" ? "numeric" : undefined}
              min={f.type === "year" ? 1950 : undefined}
              max={f.type === "year" ? thisYear : undefined}
              maxLength={f.maxLength}
              placeholder={f.placeholder}
              defaultValue={value(f.name)}
              errors={state?.fieldErrors?.[f.name]}
              required={f.required}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : item ? "Save changes" : `Add ${config.singular}`}
        </Button>
      </div>
    </form>
  );
}
